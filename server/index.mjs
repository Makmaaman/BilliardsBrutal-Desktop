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

    const id = makeId();
    const amountUAH = tier === "pro" ? 250 : 150;
    const { invoiceId, pageUrl } = await monoCreateInvoice({ amountUAH, orderId: id });

    const record = { id, machineId, tier, amount: amountUAH, invoiceId, pageUrl, status: "CREATED" };
    orders.set(id, record);

    console.log(`[ORDER_CREATE OK]`, { id, invoiceId, pageUrl });
    res.json({ ok: true, id, invoiceId, pageUrl });
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
    console.error(e); res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/customers", async (req, res) => {
  try {
    const { phone = "", name = "", email = "", birthday = null, tags = [], consent = true } = req.body || {};
    if (!phone && !email) return res.status(400).json({ ok: false, error: "PHONE_OR_EMAIL_REQUIRED" });
    const id = crypto.randomUUID();
    if (phone) {
      await query(`
        INSERT INTO customers (id, phone, name, email, birthday, tags, consent)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (phone) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          birthday = EXCLUDED.birthday,
          tags = EXCLUDED.tags,
          consent = EXCLUDED.consent,
          updated_at = now()
      `, [id, phone, name, email || null, birthday || null, tags, consent]);
    } else {
      await query(`
        INSERT INTO customers (id, phone, name, email, birthday, tags, consent)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [id, null, name, email, birthday || null, tags, consent]);
    }
    const row = (await query(`SELECT * FROM customers WHERE ${phone ? "phone=$1" : "email=$1"} LIMIT 1`, [phone || email])).rows[0];
    await query(`INSERT INTO registrations (id, customer_id, source) VALUES ($1,$2,$3)`, [crypto.randomUUID(), row.id, "desktop"]);
    res.json({ ok: true, item: row });
  } catch (e) {
    console.error(e); res.status(500).json({ ok: false, error: e.message });
  }
});

app.patch("/api/customers/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { name, phone, email, birthday, tags } = req.body || {};
    await query(`
      UPDATE customers SET
        name = COALESCE($2, name),
        phone = COALESCE($3, phone),
        email = COALESCE($4, email),
        birthday = COALESCE($5, birthday),
        tags = COALESCE($6, tags),
        updated_at = now()
      WHERE id=$1
    `, [id, name ?? null, phone ?? null, email ?? null, birthday ?? null, tags ?? null]);
    const row = (await query(`SELECT * FROM customers WHERE id=$1`, [id])).rows[0];
    res.json({ ok: true, item: row });
  } catch (e) {
    console.error(e); res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/customers/:id/bonus", async (req, res) => {
  const client = await pool.connect();
  try {
    const id = req.params.id;
    const delta = Math.trunc(Number(req.body?.delta || 0));
    const reason = String(req.body?.reason || "");
    if (!delta) return res.status(400).json({ ok: false, error: "DELTA_REQUIRED" });
    await client.query("BEGIN");
    await client.query(`UPDATE customers SET bonus_balance = bonus_balance + $2, updated_at=now() WHERE id=$1`, [id, delta]);
    await client.query(`INSERT INTO bonus_ledger (id, customer_id, delta, reason) VALUES ($1,$2,$3,$4)`, [crypto.randomUUID(), id, delta, reason || null]);
    await client.query("COMMIT");
    const row = (await query(`SELECT * FROM customers WHERE id=$1`, [id])).rows[0];
    res.json({ ok: true, item: row });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error(e); res.status(500).json({ ok: false, error: e.message });
  } finally {
    client.release();
  }
});

// ---- Promos ----
app.get("/api/promos", async (_req, res) => {
  try {
    const rows = (await query(`SELECT * FROM promos ORDER BY created_at DESC`)).rows;
    res.json({ ok: true, items: rows });
  } catch (e) {
    console.error(e); res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/promos", async (req, res) => {
  try {
    const { title, type, value, active = true, startAt = null, endAt = null, days = null, timeFrom = null, timeTo = null, minHours = null, extra = null } = req.body || {};
    if (!title || !type || value == null) return res.status(400).json({ ok: false, error: "BAD_PAYLOAD" });
    const id = crypto.randomUUID();
    await query(`
      INSERT INTO promos (id, title, type, value, active, start_at, end_at, days, time_from, time_to, min_hours, extra)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [id, title, type, value, active, startAt, endAt, days, timeFrom, timeTo, minHours, extra]);
    const row = (await query(`SELECT * FROM promos WHERE id=$1`, [id])).rows[0];
    res.json({ ok: true, item: row });
  } catch (e) {
    console.error(e); res.status(500).json({ ok: false, error: e.message });
  }
});

app.patch("/api/promos/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { title, type, value, active, startAt, endAt, days, timeFrom, timeTo, minHours, extra } = req.body || {};
    await query(`
      UPDATE promos SET
        title = COALESCE($2,title),
        type = COALESCE($3,type),
        value = COALESCE($4,value),
        active = COALESCE($5,active),
        start_at = COALESCE($6,start_at),
        end_at = COALESCE($7,end_at),
        days = COALESCE($8,days),
        time_from = COALESCE($9,time_from),
        time_to = COALESCE($10,time_to),
        min_hours = COALESCE($11,min_hours),
        extra = COALESCE($12,extra),
        updated_at = now()
      WHERE id=$1
    `, [id, title ?? null, type ?? null, value ?? null, active ?? null, startAt ?? null, endAt ?? null, days ?? null, timeFrom ?? null, timeTo ?? null, minHours ?? null, extra ?? null]);
    const row = (await query(`SELECT * FROM promos WHERE id=$1`, [id])).rows[0];
    res.json({ ok: true, item: row });
  } catch (e) {
    console.error(e); res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/promos/compute", async (req, res) => {
  try {
    const { amountUAH = 0, startedAt, finishedAt, customerId = null } = req.body || {};
    const base = Number(amountUAH) || 0;
    if (!finishedAt) return res.status(400).json({ ok: false, error: "FINISHED_AT_REQUIRED" });

    const promos = (await query(`SELECT * FROM promos WHERE active = TRUE`)).rows;
    let customer = null;
    if (customerId) {
      const r = await query(`SELECT * FROM customers WHERE id=$1`, [customerId]);
      customer = r.rows[0] || null;
    }

    const ctx = { base, startedAt, finishedAt, customer };
    const out = computeBestDiscount(promos, ctx);
    res.json({ ok: true, ...out });
  } catch (e) {
    console.error(e); res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- START ----------
await initDb().catch(e => { console.error("DB init failed:", e); process.exit(1); });

app.listen(PORT, () => {
  console.log(`Mono server :${PORT}`);
  console.log(`Payments: ${MONO_TOKEN ? "ENABLED" : "DISABLED (set MONO_TOKEN)"}`);
});

// ---------- Promo engine ----------
function computeBestDiscount(promos, ctx) {
  const { base, startedAt, finishedAt, customer } = ctx;
  const durHours = startedAt && finishedAt ? Math.max(0, (finishedAt - startedAt) / 3600000) : 0;
  const day = new Date(finishedAt);
  const dow = day.getDay(); // 0..6
  const time = day.toTimeString().slice(0,8); // HH:MM:SS

  let best = { discountUAH: 0, finalAmountUAH: base, applied: [] };

  for (const p of promos) {
    if (p.start_at && Date.now() < new Date(p.start_at).getTime()) continue;
    if (p.end_at && Date.now() > new Date(p.end_at).getTime()) continue;

    if (Array.isArray(p.days) && p.days.length && !p.days.includes(dow)) continue;
    if (p.min_hours != null && durHours < Number(p.min_hours)) continue;
    if (p.time_from && time < p.time_from) continue;
    if (p.time_to && time > p.time_to) continue;

    let allowed = true;
    if (p.type === "birthday") {
      if (!customer?.birthday) allowed = false;
      else {
        const b = new Date(customer.birthday);
        const sameMd = (b.getDate() === day.getDate() && b.getMonth() === day.getMonth());
        let within = sameMd;
        const extra = p.extra || {};
        const offs = Number(extra.birthdayDays || 0);
        if (offs > 0) {
          const a = new Date(day); a.setDate(a.getDate() - offs);
          const z = new Date(day); z.setDate(z.getDate() + offs);
          const bb = new Date(b); bb.setFullYear(day.getFullYear());
          within = bb >= a && bb <= z;
        }
        allowed = within;
      }
    }
    if (!allowed) continue;

    let disc = 0;
    if (p.type === "percent" || p.type === "happy_hour" || p.type === "birthday") {
      disc = base * (Number(p.value) / 100);
    } else if (p.type === "amount") {
      disc = Number(p.value);
    }
    disc = Math.max(0, Math.min(base, Math.round(disc * 100) / 100));

    if (disc > best.discountUAH) {
      best = {
        discountUAH: disc,
        finalAmountUAH: Math.max(0, Math.round((base - disc) * 100) / 100),
        applied: [{ id: p.id, title: p.title, type: p.type, value: Number(p.value) }]
      };
    }
  }
  return best;
}
