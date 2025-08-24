// server/index.mjs
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";

// ---------- ENV ----------
const PORT = Number(process.env.PORT || 10000);

// приватний ключ Ed25519 (PEM). У Render часто з \n — нормалізуємо
const PRIVATE_KEY_PEM = (process.env.PRIVATE_KEY_PEM || "").replace(/\\n/g, "\n");
const PUBLIC_KEY_PEM  = (process.env.PUBLIC_KEY_PEM  || "").replace(/\\n/g, "\n");

// monobank merchant API
const MONO_TOKEN = process.env.MONO_TOKEN || "";
const BASE_URL   = process.env.BASE_URL || "";

// ---------- APP ----------
const app = express();

// ✅ Render/Heroku/Cloudflare — ми за проксі, треба довіряти X-Forwarded-*
app.set("trust proxy", 1);

// мідлвари
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));

// rate-limit (ПІСЛЯ trust proxy)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    // keyGenerator: (req) => req.ip, // не обов'язково
  })
);

// in-memory "БД"
const orders = new Map(); // id -> { id, machineId, tier, amount, invoiceId, pageUrl, status }

// ---------- Допоміжне ----------
async function getPrivateKey() {
  if (!PRIVATE_KEY_PEM) throw new Error("PRIVATE_KEY_PEM missing");
  return await importPKCS8(PRIVATE_KEY_PEM, "Ed25519");
}
function uahToKop(uah) { return Math.round(Number(uah) * 100); }
function makeId() { return crypto.randomUUID(); }

async function signLicense({ machineId, tier = "pro", expiresAt = null }) {
  const pk = await getPrivateKey();
  const jwt = await new SignJWT({
    mid: machineId,
    tier,
    exp: expiresAt ? Math.floor(expiresAt / 1000) : undefined,
  })
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
    .setIssuedAt()
    .setIssuer("duna.billiard.license")
    .setAudience("desktop-app")
    .sign(pk);
  return jwt;
}

async function monoCreateInvoice({ amountUAH, orderId }) {
  if (!MONO_TOKEN) {
    const fakeInvoiceId = "TEST-" + orderId.slice(0, 8);
    const fakeUrl = "https://pay.monobank.ua/" + fakeInvoiceId;
    return { invoiceId: fakeInvoiceId, pageUrl: fakeUrl };
  }

  const amount = uahToKop(amountUAH || 100); // копійки
  const payload = {
    amount,
    merchantPaymentId: orderId,
    paymentType: "debit",
    reference: `Duna Billiard Club • Ліцензія`,
    redirectUrl: BASE_URL ? `${BASE_URL}/paid/${orderId}` : undefined
  };

  const res = await fetch("https://api.monobank.ua/api/merchant/invoice/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Token": MONO_TOKEN,
    },
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
    return { status: "TEST_NO_TOKEN" };
  }
  const url = `https://api.monobank.ua/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`;
  const res = await fetch(url, { headers: { "X-Token": MONO_TOKEN } });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Mono status failed: ${res.status} ${txt}`);
  }
  const data = await res.json();
  return data; // містить status/paidAmount/paidTime тощо
}

// ---------- ROUTES ----------
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

// створити інвойс
app.post("/api/orders", async (req, res) => {
  try {
    const { machineId, tier = "pro" } = req.body || {};
    if (!machineId) return res.status(400).json({ ok: false, error: "MISSING_MACHINE_ID" });

    const id = makeId();
    const amountUAH = tier === "pro" ? 250 : 150; // під себе
    const { invoiceId, pageUrl } = await monoCreateInvoice({ amountUAH, orderId: id });

    const record = { id, machineId, tier, amount: amountUAH, invoiceId, pageUrl, status: "CREATED" };
    orders.set(id, record);

    console.log(`[ORDER_CREATE OK]`, { id, invoiceId, pageUrl });
    res.json({ ok: true, id, invoiceId, pageUrl });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || "CREATE_ORDER_FAILED" });
  }
});

// оновити статус, видати ліцензію якщо оплачено
app.post("/api/orders/:id/refresh", async (req, res) => {
  try {
    const id = req.params.id;
    const rec = orders.get(id);
    if (!rec) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });

    let paid = false;
    let status = "UNKNOWN";

    if (rec.invoiceId) {
      const st = await monoCheckInvoice(rec.invoiceId);
      status = st.status || (st.paidAmount ? "success" : "wait");
      paid = status?.toLowerCase?.() === "success" || !!st.paidAmount || !!st.paidTime;
    }

    if (!paid) {
      rec.status = status || "WAITING";
      orders.set(id, rec);
      return res.json({ ok: false, status: rec.status });
    }

    const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000; // 1 рік
    const license = await signLicense({ machineId: rec.machineId, tier: rec.tier, expiresAt });
    rec.status = "PAID";
    rec.license = license;
    orders.set(id, rec);

    res.json({ ok: true, status: rec.status, license });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || "REFRESH_FAILED" });
  }
});

// пряма активація (без оплати, для тестів/ручної видачі)
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

// ---------- START ----------
app.listen(PORT, () => {
  console.log(`Mono server :${PORT}`);
  console.log("     ==> Your service is live 🎉");
});
