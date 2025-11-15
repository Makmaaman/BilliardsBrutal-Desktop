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

// ---------- Tariffs / plans ----------
const PLAN_PRICING = {
  // Повні тарифи (разовий платіж 20000/30000 ти робиш окремо, тут — тільки місячна підтримка)
  "full-5":  { amountUAH: 250, periodDays: 31 },
  "full-10": { amountUAH: 250, periodDays: 31 },

  // Помісячні тарифи
  "lite-m":  { amountUAH: 600, periodDays: 31 },
  "pro-m":   { amountUAH: 900, periodDays: 31 },

  // legacy / fallback ids (на випадок старих клієнтів)
  "pro":     { amountUAH: 250, periodDays: 31 },
  "lite":    { amountUAH: 150, periodDays: 31 },
};

function resolvePlan(inputPlan, inputTier) {
  const raw = String(inputPlan || inputTier || "").trim();
  const id = raw || "lite-m";

  if (PLAN_PRICING[id]) return { id, ...PLAN_PRICING[id] };

  // fallback: все, що закінчується на "-m", вважаємо помісячним (600/міс)
  if (id.endsWith("-m")) return { id, amountUAH: 600, periodDays: 31 };

  // інакше тримаємось моделі «повної»/річної за замовчуванням (250)
  return { id, amountUAH: 250, periodDays: 31 };
}

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
