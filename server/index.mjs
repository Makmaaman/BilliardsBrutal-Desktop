// server/index.mjs
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";
import { initDb, query, pool } from "./db.mjs";

// ---------- ENV ----------
const PORT = Number(process.env.PORT || 10000);
const PRIVATE_KEY_PEM = (process.env.PRIVATE_KEY_PEM || "").replace(/\\n/g, "\n");
const PUBLIC_KEY_PEM  = (process.env.PUBLIC_KEY_PEM  || "").replace(/\\n/g, "\n");
const MONO_TOKEN = process.env.MONO_TOKEN || "";
const BASE_URL   = (process.env.BASE_URL || "").replace(/\/+$/,"");

// ---------- APP ----------
const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("combined"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));

const orders = new Map(); // in-memory

// ---------- Helpers ----------
async function getPrivateKey() {
  if (!PRIVATE_KEY_PEM) throw new Error("PRIVATE_KEY_PEM missing");
  return await importPKCS8(PRIVATE_KEY_PEM, "Ed25519");
}
function uahToKop(uah) { return Math.round(Number(uah) * 100); }
function makeId() { return crypto.randomUUID(); }

async function signLicense({ machineId, tier = "pro", expiresAt = null }) {
  const pk = await getPrivateKey();
  return await new SignJWT({
      mid: machineId, tier,
      exp: expiresAt ? Math.floor(expiresAt / 1000) : undefined,
    })
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
    .setIssuedAt()
    .setIssuer("duna.billiard.license")
    .setAudience("desktop-app")
    .sign(pk);
}

async function monoCreateInvoice({ amountUAH, orderId }) {
  if (!MONO_TOKEN) {
    const err = new Error("MONO_TOKEN_MISSING");
    err.code = "MONO_TOKEN_MISSING";
    throw err;
  }
  const amount = uahToKop(amountUAH || 100);
  const payload = {
    amount,
    merchantPaymentId: orderId,
    paymentType: "debit",
    reference: `Duna Billiard Club • Ліцензія`,
    redirectUrl: BASE_URL ? `${BASE_URL}/paid/${orderId}` : undefined
  };
  const res = await fetch("https://api.monobank.ua/api/merchant/invoice/create", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Token": MONO_TOKEN },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Mono create invoice failed: ${res.status} ${txt}`);
  }
  const data = await res.json();
  return { invoiceId: data.invoiceId, pageUrl: data.pageUrl };
}

async function monoCheckInvoice(invoiceId) {
  if (!MONO_TOKEN) {
    const err = new Error("MONO_TOKEN_MISSING");
    err.code = "MONO_TOKEN_MISSING";
    throw err;
  }
  const url = `https://api.monobank.ua/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`;
  const res = await fetch(url, { headers: { "X-Token": MONO_TOKEN } });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Mono status failed: ${res.status} ${txt}`);
  }
  return await res.json();
}

// ---------- ROUTES: базові / ліцензія ----------
app.get("/", (_req, res) => res.json({ ok: true, service: "billiards-license-mono" }));
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get("/api/license/public-key", (_req, res) => {
  res.json({ ok: !!PUBLIC_KEY_PEM, publicKey: PUBLIC_KEY_PEM || null });
});

app.get("/api/license/status", (req, res) => {
  const mid = String(req.query.mid || "");
  if (!mid) return res.status(400).json({ ok: false, error: "MISSING_MACHINE_ID" });
  res.json({ ok: true, mid });
});

app.post("/api/orders", async (req, res) => {
  try {
    const { machineId, tier = "pro" } = req.body || {};
    if (!machineId) return res.status(400).json({ ok: false, error: "MISSING_MACHINE_ID" });

    // ---- Ціни під твої тарифи ----
    let amountUAH;
    switch (tier) {
      case "lite-m":   // помісячний 600 грн
        amountUAH = 600;
        break;
      case "pro-m":    // помісячний 900 грн
        amountUAH = 900;
        break;
      case "lite":     // старий/простий lite
        amountUAH = 150;
        break;
      case "pro":
      default:
        amountUAH = 250;
        break;
    }

    const id = makeId();
    const { invoiceId, pageUrl } = await monoCreateInvoice({ amountUAH, orderId: id });

    const record = { id, machineId, tier, amount: amountUAH, invoiceId, pageUrl, status: "CREATED" };
    orders.set(id, record);

    console.log(`[ORDER_CREATE OK]`, { id, invoiceId, pageUrl, tier, amountUAH });
    res.json({ ok: true, id, invoiceId, pageUrl, tier, amountUAH });
  } catch (e) {
    if (e?.code === "MONO_TOKEN_MISSING")
      return res.status(503).json({ ok: false, error: "PAYMENTS_DISABLED" });
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || "CREATE_ORDER_FAILED" });
  }
});

app.post("/api/orders/:id/refresh", async (req, res) => {
  try {
    const id = req.params.id;
    const rec = orders.get(id);
    if (!rec) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });

    const st = await monoCheckInvoice(rec.invoiceId);
    const status = (st.status || "").toLowerCase();
    const paidAmount = Number(st.paidAmount || 0);
    const expectedKop = uahToKop(rec.amount);

    console.log("[ORDER_STATUS]", { id, status, paidAmount, expectedKop });

    if (paidAmount < expectedKop) {
      rec.status = status || "WAITING";
      orders.set(id, rec);
      return res.json({ ok: false, status: rec.status, paidAmount, expectedKop });
    }

    const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const license = await signLicense({ machineId: rec.machineId, tier: rec.tier, expiresAt });
    rec.status = "PAID";
    rec.license = license;
    orders.set(id, rec);

    res.json({ ok: true, status: rec.status, license });
  } catch (e) {
    if (e?.code === "MONO_TOKEN_MISSING")
      return res.status(503).json({ ok: false, error: "PAYMENTS_DISABLED" });
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || "REFRESH_FAILED" });
  }
});

app.post("/api/license/activate", async (req, res) => {
  try {
    const { machineId, tier = "pro", days = 365 } = req.body || {};
    if (!machineId) return res.status(400).json({ ok: false, error: "MISSING_MACHINE_ID" });
    const expiresAt = Date.now() + Number(days) * 24 * 60 * 60 * 1000;
    const license = await signLicense({ machineId, tier, expiresAt });
    res.json({ ok: true, license });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || "ACTIVATE_FAILED" });
  }
});

/* =========================
 *  КЛІЄНТИ / БОНУСИ / АКЦІЇ
 * ========================= */

// ---- Customers ----
app.get("/api/customers", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    let rows;
    if (q) {
      rows = (await query(
        `SELECT * FROM customers
         WHERE phone ILIKE $1 OR name ILIKE $1 OR email ILIKE $1
         ORDER BY created_at DESC LIMIT 200`,
        [`%${q}%`]
      )).rows;
    } else {
      rows = (await query(`SELECT * FROM customers ORDER BY created_at DESC LIMIT 200`)).rows;
    }
    res.json({ ok: true, items: rows });
  } catch (e) {
    console.error(e); res.statu
