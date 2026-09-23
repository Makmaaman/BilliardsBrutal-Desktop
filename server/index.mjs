// server/index.mjs
import express from "express";
import cors from "cors";
import helmet from "helmet";
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
// Необов'язковий токен для ручної видачі ліцензії (X-Admin-Token)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

// ---------- APP ----------
const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));
// app.use(morgan("combined")); // Логи вимкнули, бо немає пакету morgan
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const orders = new Map(); // кеш у пам'яті (БД — джерело правди)

/* ---------- Замовлення в БД ----------
   Render на безкоштовному плані присипляє інстанс, і Map зникає разом із
   замовленням: клієнт оплатив, повернувся — ORDER_NOT_FOUND і ліцензія не
   видається. Тому кожне замовлення дублюємо в Postgres. */
async function initOrdersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY,
      machine_id TEXT NOT NULL,
      tier TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      invoice_id TEXT,
      page_url TEXT,
      status TEXT NOT NULL DEFAULT 'CREATED',
      license TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS orders_machine_id_idx ON orders (machine_id);`);
}

function rowToOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    machineId: row.machine_id,
    tier: row.tier,
    amount: Number(row.amount),
    invoiceId: row.invoice_id,
    pageUrl: row.page_url,
    status: row.status,
    license: row.license || null,
  };
}

async function saveOrder(rec) {
  orders.set(rec.id, rec);
  try {
    await query(
      `INSERT INTO orders (id, machine_id, tier, amount, invoice_id, page_url, status, license)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         license = COALESCE(EXCLUDED.license, orders.license),
         updated_at = now()`,
      [rec.id, rec.machineId, rec.tier, rec.amount, rec.invoiceId, rec.pageUrl, rec.status, rec.license || null]
    );
  } catch (e) {
    console.error("[ORDER_SAVE_FAILED]", rec.id, e.message);
  }
}

async function getOrder(id) {
  const cached = orders.get(id);
  if (cached) return cached;
  try {
    const { rows } = await query(`SELECT * FROM orders WHERE id = $1`, [id]);
    const rec = rowToOrder(rows[0]);
    if (rec) orders.set(rec.id, rec);
    return rec;
  } catch (e) {
    console.error("[ORDER_LOAD_FAILED]", id, e.message);
    return null;
  }
}

/** Останнє оплачене замовлення для машини (для відновлення ліцензії). */
async function getPaidOrderForMachine(machineId) {
  try {
    const { rows } = await query(
      `SELECT * FROM orders WHERE machine_id = $1 AND status = 'PAID' ORDER BY updated_at DESC LIMIT 1`,
      [machineId]
    );
    return rowToOrder(rows[0]);
  } catch (e) {
    console.error("[ORDER_LOOKUP_FAILED]", machineId, e.message);
    return null;
  }
}

// ---------- Helpers ----------
async function getPrivateKey() {
  if (!PRIVATE_KEY_PEM) throw new Error("PRIVATE_KEY_PEM missing");
  return await importPKCS8(PRIVATE_KEY_PEM, "Ed25519");
}
function uahToKop(uah) {
  return Math.round(Number(uah) * 100);
}
function makeId() {
  return crypto.randomUUID();
}

async function signLicense({ machineId, tier = "pro", expiresAt = null }) {
  const pk = await getPrivateKey();
  return await new SignJWT({
    mid: machineId,
    tier,
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
    redirectUrl: BASE_URL ? `${BASE_URL}/paid/${orderId}` : undefined,
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
  const url = `https://api.monobank.ua/api/merchant/invoice/status?invoiceId=${encodeURIComponent(
    invoiceId
  )}`;
  const res = await fetch(url, { headers: { "X-Token": MONO_TOKEN } });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Mono status failed: ${res.status} ${txt}`);
  }
  return await res.json();
}

// ---------- ROUTES: базові / ліцензія ----------
app.get("/", (_req, res) =>
  res.json({ ok: true, service: "billiards-license-mono" })
);
app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, ts: Date.now() })
);

app.get("/api/license/public-key", (_req, res) => {
  res.json({ ok: !!PUBLIC_KEY_PEM, publicKey: PUBLIC_KEY_PEM || null });
});

app.get("/api/license/status", (req, res) => {
  const mid = String(req.query.mid || "");
  if (!mid)
    return res
      .status(400)
      .json({ ok: false, error: "MISSING_MACHINE_ID" });
  res.json({ ok: true, mid });
});

app.post("/api/orders", async (req, res) => {
  try {
    // Клієнт (екран активації) надсилає поле plan, центр ліцензій — tier.
    // Раніше читали лише tier, тому будь-який план оплачувався як "pro" (250 ₴).
    const body = req.body || {};
    const machineId = body.machineId;
    const tier = body.tier || body.plan || "pro";
    if (!machineId)
      return res
        .status(400)
        .json({ ok: false, error: "MISSING_MACHINE_ID" });

    // --- Ціни під твої тарифи ---
    // tier:
    //   "lite-m" → 600 грн/місяць
    //   "pro-m"  → 900 грн/місяць
    //   "lite"   → 150 грн (як було)
    //   "pro"    → 250 грн (як було)
    let amountUAH;
    switch (tier) {
      case "full-5":
      case "full5":
        amountUAH = 20000;   // «Повна • 5 столів» — разово
        break;
      case "full-10":
      case "full10":
        amountUAH = 30000;   // «Повна • 10 столів» — разово
        break;
      case "lite-m":
        amountUAH = 600;
        break;
      case "pro-m":
        amountUAH = 900;
        break;
      case "lite":
        amountUAH = 150;
        break;
      case "pro":
      default:
        amountUAH = 250;
        break;
    }

    const id = makeId();
    const { invoiceId, pageUrl } = await monoCreateInvoice({
      amountUAH,
      orderId: id,
    });

    const record = {
      id,
      machineId,
      tier,
      amount: amountUAH,
      invoiceId,
      pageUrl,
      status: "CREATED",
    };
    await saveOrder(record);

    console.log(`[ORDER_CREATE OK]`, {
      id,
      invoiceId,
      pageUrl,
      tier,
      amountUAH,
    });
    res.json({ ok: true, id, invoiceId, pageUrl, tier, amountUAH });
  } catch (e) {
    if (e?.code === "MONO_TOKEN_MISSING")
      return res
        .status(503)
        .json({ ok: false, error: "PAYMENTS_DISABLED" });
    console.error(e);
    res
      .status(500)
      .json({ ok: false, error: e.message || "CREATE_ORDER_FAILED" });
  }
});

async function handleOrderRefresh(req, res) {
  try {
    const id = req.params.id;
    const rec = await getOrder(id);
    if (!rec)
      return res
        .status(404)
        .json({ ok: false, error: "ORDER_NOT_FOUND" });

    const st = await monoCheckInvoice(rec.invoiceId);
    const status = (st.status || "").toLowerCase();
    const paidAmount = Number(st.paidAmount || 0);
    const expectedKop = uahToKop(rec.amount);

    console.log("[ORDER_STATUS]", {
      id,
      status,
      paidAmount,
      expectedKop,
    });

    if (paidAmount < expectedKop) {
      rec.status = status || "WAITING";
      await saveOrder(rec);
      return res.json({
        ok: false,
        status: rec.status,
        paidAmount,
        expectedKop,
      });
    }

    const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const license = await signLicense({
      machineId: rec.machineId,
      tier: rec.tier,
      expiresAt,
    });
    rec.status = "PAID";
    rec.license = license;
    await saveOrder(rec);

    res.json({ ok: true, status: rec.status, license });
  } catch (e) {
    if (e?.code === "MONO_TOKEN_MISSING")
      return res
        .status(503)
        .json({ ok: false, error: "PAYMENTS_DISABLED" });
    console.error(e);
    res
      .status(500)
      .json({ ok: false, error: e.message || "REFRESH_FAILED" });
  }
}

app.post("/api/orders/:id/refresh", handleOrderRefresh);
// аліас: встановлені клієнти (<= 3.9.2) звертаються саме до /check
app.post("/api/orders/:id/check", handleOrderRefresh);

/**
 * Видача ліцензії. Раніше цей маршрут підписував ліцензію будь-кому, хто знав
 * адресу сервера, без перевірки оплати. Тепер потрібне оплачене замовлення
 * (orderId) або ADMIN_TOKEN для ручної видачі.
 */
app.post("/api/license/activate", async (req, res) => {
  try {
    const { machineId, orderId, tier, days = 365 } = req.body || {};
    if (!machineId)
      return res
        .status(400)
        .json({ ok: false, error: "MISSING_MACHINE_ID" });

    const adminToken = String(req.get("X-Admin-Token") || "");
    const isAdmin = !!ADMIN_TOKEN && adminToken === ADMIN_TOKEN;

    if (!isAdmin) {
      // шукаємо оплачене замовлення: або конкретне, або останнє для цієї машини
      let rec = orderId ? await getOrder(orderId) : null;
      if (rec && String(rec.machineId) !== String(machineId)) rec = null;
      if (!rec) rec = await getPaidOrderForMachine(machineId);

      if (!rec)
        return res
          .status(404)
          .json({ ok: false, error: "ORDER_NOT_FOUND" });

      // якщо ще не позначене оплаченим — перепитуємо монобанк
      if (rec.status !== "PAID") {
        try {
          const st = await monoCheckInvoice(rec.invoiceId);
          const paidAmount = Number(st.paidAmount || 0);
          if (paidAmount < uahToKop(rec.amount)) {
            return res
              .status(402)
              .json({ ok: false, error: "ORDER_NOT_PAID", status: st.status || rec.status });
          }
          rec.status = "PAID";
        } catch (e) {
          return res
            .status(402)
            .json({ ok: false, error: "ORDER_NOT_PAID" });
        }
      }

      const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
      const license = await signLicense({
        machineId,
        tier: rec.tier,
        expiresAt,
      });
      rec.license = license;
      await saveOrder(rec);
      return res.json({ ok: true, license, tier: rec.tier });
    }

    const expiresAt = Date.now() + Number(days) * 24 * 60 * 60 * 1000;
    const license = await signLicense({
      machineId,
      tier: tier || "pro",
      expiresAt,
    });
    res.json({ ok: true, license });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ ok: false, error: e.message || "ACTIVATE_FAILED" });
  }
});

/**
 * Відновлення ліцензії за Machine ID — для тих, хто вже оплатив, але втратив
 * номер замовлення (перевстановлення, втрачений localStorage).
 */
app.post("/api/license/restore", async (req, res) => {
  try {
    const { machineId } = req.body || {};
    if (!machineId)
      return res
        .status(400)
        .json({ ok: false, error: "MISSING_MACHINE_ID" });

    const rec = await getPaidOrderForMachine(machineId);
    if (!rec)
      return res
        .status(404)
        .json({ ok: false, error: "NO_PAID_ORDER" });

    const license =
      rec.license ||
      (await signLicense({
        machineId,
        tier: rec.tier,
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      }));
    if (!rec.license) {
      rec.license = license;
      await saveOrder(rec);
    }
    res.json({ ok: true, license, tier: rec.tier, orderId: rec.id });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ ok: false, error: e.message || "RESTORE_FAILED" });
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
      rows = (
        await query(
          `SELECT * FROM customers
         WHERE phone ILIKE $1 OR name ILIKE $1 OR email ILIKE $1
         ORDER BY created_at DESC LIMIT 200`,
          [`%${q}%`]
        )
      ).rows;
    } else {
      rows = (
        await query(
          `SELECT * FROM customers ORDER BY created_at DESC LIMIT 200`
        )
      ).rows;
    }
    res.json({ ok: true, items: rows });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ ok: false, error: e.message });
  }
});

app.post("/api/customers", async (req, res) => {
  try {
    const {
      phone = "",
      name = "",
      email = "",
      birthday = null,
      tags = [],
      consent = true,
    } = req.body || {};
    if (!phone && !email)
      return res.status(400).json({
        ok: false,
        error: "PHONE_OR_EMAIL_REQUIRED",
      });
    const id = crypto.randomUUID();
    if (phone) {
      await query(
        `
        INSERT INTO customers (id, phone, name, email, birthday, tags, consent)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (phone) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          birthday = EXCLUDED.birthday,
          tags = EXCLUDED.tags,
          consent = EXCLUDED.consent,
          updated_at = now()
      `,
        [
          id,
          phone,
          name,
          email || null,
          birthday || null,
          tags,
          consent,
        ]
      );
    } else {
      await query(
        `
        INSERT INTO customers (id, phone, name, email, birthday, tags, consent)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
        [id, null, name, email, birthday || null, tags, consent]
      );
    }
    const row = (
      await query(
        `SELECT * FROM customers WHERE ${
          phone ? "phone=$1" : "email=$1"
        } LIMIT 1`,
        [phone || email]
      )
    ).rows[0];
    await query(
      `INSERT INTO registrations (id, customer_id, source) VALUES ($1,$2,$3)`,
      [crypto.randomUUID(), row.id, "desktop"]
    );
    res.json({ ok: true, item: row });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ ok: false, error: e.message });
  }
});

app.patch("/api/customers/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { name, phone, email, birthday, tags } =
      req.body || {};
    await query(
      `
      UPDATE customers SET
        name = COALESCE($2, name),
        phone = COALESCE($3, phone),
        email = COALESCE($4, email),
        birthday = COALESCE($5, birthday),
        tags = COALESCE($6, tags),
        updated_at = now()
      WHERE id=$1
    `,
      [
        id,
        name ?? null,
        phone ?? null,
        email ?? null,
        birthday ?? null,
        tags ?? null,
      ]
    );
    const row = (
      await query(`SELECT * FROM customers WHERE id=$1`, [id])
    ).rows[0];
    res.json({ ok: true, item: row });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ ok: false, error: e.message });
  }
});

app.post("/api/customers/:id/bonus", async (req, res) => {
  const client = await pool.connect();
  try {
    const id = req.params.id;
    const delta = Math.trunc(
      Number(req.body?.delta || 0)
    );
    const reason = String(req.body?.reason || "");
    if (!delta)
      return res
        .status(400)
        .json({ ok: false, error: "DELTA_REQUIRED" });
    await client.query("BEGIN");
    await client.query(
      `UPDATE customers SET bonus_balance = bonus_balance + $2, updated_at=now() WHERE id=$1`,
      [id, delta]
    );
    await client.query(
      `INSERT INTO bonus_ledger (id, customer_id, delta, reason) VALUES ($1,$2,$3,$4)`,
      [
        crypto.randomUUID(),
        id,
        delta,
        reason || null,
      ]
    );
    await client.query("COMMIT");
    const row = (
      await query(`SELECT * FROM customers WHERE id=$1`, [id])
    ).rows[0];
    res.json({ ok: true, item: row });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.error(e);
    res
      .status(500)
      .json({ ok: false, error: e.message });
  } finally {
    client.release();
  }
});

// ---- Promos ----
app.get("/api/promos", async (_req, res) => {
  try {
    const rows = (
      await query(
        `SELECT * FROM promos ORDER BY created_at DESC`
      )
    ).rows;
    res.json({ ok: true, items: rows });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ ok: false, error: e.message });
  }
});

app.post("/api/promos", async (req, res) => {
  try {
    const {
      title,
      type,
      value,
      active = true,
      startAt = null,
      endAt = null,
      days = null,
      timeFrom = null,
      timeTo = null,
      minHours = null,
      extra = null,
    } = req.body || {};
    if (!title || !type || value == null)
      return res
        .status(400)
        .json({ ok: false, error: "BAD_PAYLOAD" });
    const id = crypto.randomUUID();
    await query(
      `
      INSERT INTO promos (id, title, type, value, active, start_at, end_at, days, time_from, time_to, min_hours, extra)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `,
      [
        id,
        title,
        type,
        value,
        active,
        startAt,
        endAt,
        days,
        timeFrom,
        timeTo,
        minHours,
        extra,
      ]
    );
    const row = (
      await query(`SELECT * FROM promos WHERE id=$1`, [id])
    ).rows[0];
    res.json({ ok: true, item: row });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ ok: false, error: e.message });
  }
});

app.patch("/api/promos/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const {
      title,
      type,
      value,
      active,
      startAt,
      endAt,
      days,
      timeFrom,
      timeTo,
      minHours,
      extra,
    } = req.body || {};
    await query(
      `
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
    `,
      [
        id,
        title ?? null,
        type ?? null,
        value ?? null,
        active ?? null,
        startAt ?? null,
        endAt ?? null,
        days ?? null,
        timeFrom ?? null,
        timeTo ?? null,
        minHours ?? null,
        extra ?? null,
      ]
    );
    const row = (
      await query(`SELECT * FROM promos WHERE id=$1`, [id])
    ).rows[0];
    res.json({ ok: true, item: row });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ ok: false, error: e.message });
  }
});

app.post("/api/promos/compute", async (req, res) => {
  try {
    const {
      amountUAH = 0,
      startedAt,
      finishedAt,
      customerId = null,
    } = req.body || {};
    const base = Number(amountUAH) || 0;
    if (!finishedAt)
      return res.status(400).json({
        ok: false,
        error: "FINISHED_AT_REQUIRED",
      });

    const promos = (
      await query(`SELECT * FROM promos WHERE active = TRUE`)
    ).rows;
    let customer = null;
    if (customerId) {
      const r = await query(
        `SELECT * FROM customers WHERE id=$1`,
        [customerId]
      );
      customer = r.rows[0] || null;
    }

    const ctx = { base, startedAt, finishedAt, customer };
    const out = computeBestDiscount(promos, ctx);
    res.json({ ok: true, ...out });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ ok: false, error: e.message });
  }
});

// ---------- START ----------
await initDb().catch((e) => {
  console.error("DB init failed:", e);
  process.exit(1);
});
await initOrdersTable().catch((e) => {
  console.error("Orders table init failed:", e);
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`Mono server :${PORT}`);
  console.log(
    `Payments: ${MONO_TOKEN ? "ENABLED" : "DISABLED (set MONO_TOKEN)"}`
  );
});

// ---------- Promo engine ----------
function computeBestDiscount(promos, ctx) {
  const { base, startedAt, finishedAt, customer } = ctx;
  const durHours =
    startedAt && finishedAt
      ? Math.max(0, (finishedAt - startedAt) / 3600000)
      : 0;
  const day = new Date(finishedAt);
  const dow = day.getDay(); // 0..6
  const time = day.toTimeString().slice(0, 8); // HH:MM:SS

  let best = { discountUAH: 0, finalAmountUAH: base, applied: [] };

  for (const p of promos) {
    if (
      p.start_at &&
      Date.now() < new Date(p.start_at).getTime()
    )
      continue;
    if (p.end_at && Date.now() > new Date(p.end_at).getTime())
      continue;

    if (Array.isArray(p.days) && p.days.length && !p.days.includes(dow))
      continue;
    if (p.min_hours != null && durHours < Number(p.min_hours))
      continue;
    if (p.time_from && time < p.time_from) continue;
    if (p.time_to && time > p.time_to) continue;

    let allowed = true;
    if (p.type === "birthday") {
      if (!customer?.birthday) allowed = false;
      else {
        const b = new Date(customer.birthday);
        const sameMd =
          b.getDate() === day.getDate() &&
          b.getMonth() === day.getMonth();
        let within = sameMd;
        const extra = p.extra || {};
        const offs = Number(extra.birthdayDays || 0);
        if (offs > 0) {
          const a = new Date(day);
          a.setDate(a.getDate() - offs);
          const z = new Date(day);
          z.setDate(z.getDate() + offs);
          const bb = new Date(b);
          bb.setFullYear(day.getFullYear());
          within = bb >= a && bb <= z;
        }
        allowed = within;
      }
    }
    if (!allowed) continue;

    let disc = 0;
    if (
      p.type === "percent" ||
      p.type === "happy_hour" ||
      p.type === "birthday"
    ) {
      disc = base * (Number(p.value) / 100);
    } else if (p.type === "amount") {
      disc = Number(p.value);
    }
    disc = Math.max(
      0,
      Math.min(base, Math.round(disc * 100) / 100)
    );

    if (disc > best.discountUAH) {
      best = {
        discountUAH: disc,
        finalAmountUAH: Math.max(
          0,
          Math.round((base - disc) * 100) / 100
        ),
        applied: [
          {
            id: p.id,
            title: p.title,
            type: p.type,
            value: Number(p.value),
          },
        ],
      };
    }
  }
  return best;
}
