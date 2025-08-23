import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'node:crypto';
import { Pool } from 'pg';

/* ================== ENV ================== */
const app = express();
const PORT = process.env.PORT || 8080;
const ORIGIN = process.env.PUBLIC_ORIGIN || '*';
const MONO_TOKEN = process.env.MONO_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const REDIRECT_URL = process.env.REDIRECT_URL || 'https://example.com/payment-result';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const DATABASE_URL = process.env.DATABASE_URL;
const PRIVATE_KEY_PEM = (process.env.PRIVATE_KEY_PEM || '').includes('\\n')
  ? process.env.PRIVATE_KEY_PEM.replace(/\\n/g, '\n')
  : process.env.PRIVATE_KEY_PEM;

if (!MONO_TOKEN) console.warn('[ENV] MONO_TOKEN is missing');
if (!PRIVATE_KEY_PEM) console.warn('[ENV] PRIVATE_KEY_PEM is missing');
if (!DATABASE_URL) console.warn('[ENV] DATABASE_URL is missing');

/* ================== SECURITY ================== */
app.use(helmet({
  contentSecurityPolicy: false, // CSP краще в рендерері; бек — API
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({ origin: ORIGIN }));

/* ===== РОЗБІР JSON ТІЛА — НИЖЧЕ ВЕБХУКА RAW! ===== */

/* ================== DB ================== */
const pool = new Pool({ connectionString: DATABASE_URL });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY,
      order_token TEXT NOT NULL,
      mid TEXT NOT NULL,
      tier TEXT NOT NULL,
      days INTEGER NOT NULL,
      status TEXT NOT NULL,
      invoice_id TEXT,
      license TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_orders_invoice_id ON orders(invoice_id);
  `);
}
initDb().then(()=>console.log('[DB] ready')).catch(e=>console.error('[DB] init error', e));

/* ================== UTILS ================== */
const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

function randToken(bytes = 24) {
  return Buffer.from(crypto.randomBytes(bytes).toString('base64'))
    .toString()
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function nowIso() { return new Date().toISOString(); }

function log(tag, obj) {
  console.log(`[${nowIso()}] ${tag}`, obj ?? '');
}

function makeLicense({ mid, tier='pro', days=365, sub='Duna Billiard Club' }) {
  const payload = { mid, tier, exp: Date.now() + days*86400_000, iat: Date.now(), sub };
  const txt = Buffer.from(JSON.stringify(payload));
  const sig = crypto.sign(null, txt, PRIVATE_KEY_PEM); // Ed25519
  return `${b64url(txt)}.${b64url(sig)}`;
}

/* ================== MONOBANK PUBKEY CACHE ================== */
let monoPubkeyPem = null;
let monoPubkeyExp = 0;
async function getMonoPubkeyPem() {
  const now = Date.now();
  if (monoPubkeyPem && now < monoPubkeyExp) return monoPubkeyPem;
  const resp = await fetch('https://api.monobank.ua/api/merchant/pubkey', {
    headers: { 'X-Token': MONO_TOKEN }
  });
  if (!resp.ok) throw new Error(`Monobank pubkey ${resp.status}`);
  const { key } = await resp.json();
  monoPubkeyPem = Buffer.from(key, 'base64').toString('utf8');
  monoPubkeyExp = now + 60*60*1000; // 1 година
  return monoPubkeyPem;
}

/* ================== WEBHOOK (RAW) ДО JSON ================== */
app.post('/api/mono/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const bodyBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
    const xSign = req.header('X-Sign');
    if (!xSign) return res.sendStatus(400);

    const pubKeyPem = await getMonoPubkeyPem();
    const ok = crypto.verify('sha256', bodyBuf, crypto.createPublicKey(pubKeyPem), Buffer.from(xSign, 'base64'));
    if (!ok) {
      log('[WEBHOOK] BAD SIGN');
      return res.sendStatus(200); // відповідаємо 200, щоби Monobank не заспамив ретраями
    }

    const data = JSON.parse(bodyBuf.toString('utf8'));
    const invoiceId = data.invoiceId ?? data?.data?.invoiceId ?? data?.invoice?.invoiceId ?? null;
    const status    = data.status    ?? data?.data?.status    ?? data?.invoice?.status    ?? null;
    const reference = data.reference ?? data?.data?.reference ?? data?.invoice?.reference ?? null;

    log('[WEBHOOK OK]', { invoiceId, status, reference });

    let order = null;
    if (reference) {
      const r = await pool.query('SELECT * FROM orders WHERE id = $1', [reference]);
      order = r.rows[0] || null;
    }
    if (!order && invoiceId) {
      const r = await pool.query('SELECT * FROM orders WHERE invoice_id = $1', [invoiceId]);
      order = r.rows[0] || null;
    }
    if (!order) return res.sendStatus(200);

    let license = order.license;
    let newStatus = status || order.status;
    if (newStatus === 'success' && !license) {
      license = makeLicense({ mid: order.mid, tier: order.tier, days: order.days });
      log('[LICENSE GENERATED]', { orderId: order.id });
    }

    await pool.query(
      'UPDATE orders SET status = $1, license = $2, updated_at = NOW() WHERE id = $3',
      [newStatus, license, order.id]
    );

    return res.sendStatus(200);
  } catch (e) {
    console.error('[WEBHOOK ERROR]', e);
    return res.sendStatus(200); // 200, щоб Monobank не ретраїв до безкінечності
  }
});

/* ===== JSON для решти маршрутів (після вебхука) ===== */
app.use(express.json({ limit: '1mb' }));

/* ================== RATE LIMITS ================== */
import rateLimit from 'express-rate-limit';
const rlCreate = rateLimit({ windowMs: 10*60*1000, max: 20, standardHeaders: true, legacyHeaders: false });
const rlPoll   = rateLimit({ windowMs: 10*60*1000, max: 300, standardHeaders: true, legacyHeaders: false });

/* ================== ROUTES ================== */

// Alive
app.get('/', (_req, res) => res.send('Mono license server OK'));

// Create order
app.post('/api/orders', rlCreate, async (req, res) => {
  try {
    const { mid, tier = 'pro', days = 365, email = '' } = req.body || {};
    if (!mid) return res.status(400).json({ ok:false, error:'MID_REQUIRED' });

    const id = crypto.randomUUID();
    const orderToken = randToken(24);

    await pool.query(
      `INSERT INTO orders (id, order_token, mid, tier, days, status)
       VALUES ($1, $2, $3, $4, $5, 'new')`,
      [id, orderToken, mid, tier, days]
    );

    const body = {
      amount: 25000, // 250.00 UAH у копійках — замініть під ваш тариф
      ccy: 980,
      merchantPaymInfo: {
        reference: id,
        destination: `Ліцензія ${tier.toUpperCase()} (${days} днів)`,
        customerEmails: email ? [email] : []
      },
      redirectUrl: REDIRECT_URL,
      webHookUrl: WEBHOOK_URL,
      validity: 3600
    };

    const r = await fetch('https://api.monobank.ua/api/merchant/invoice/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Token': MONO_TOKEN },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) {
      log('[ORDER_CREATE FAIL]', { status: r.status, body: j });
      return res.status(r.status).json(j);
    }

    await pool.query(
      'UPDATE orders SET invoice_id = $1, updated_at = NOW() WHERE id = $2',
      [j.invoiceId, id]
    );

    log('[ORDER_CREATE OK]', { id, invoiceId: j.invoiceId, pageUrl: j.pageUrl });
    return res.json({ ok:true, orderId: id, orderToken, checkoutUrl: j.pageUrl });
  } catch (e) {
    console.error('[ORDER_CREATE ERROR]', e);
    res.status(500).json({ ok:false, error:'ORDER_CREATE_FAILED' });
  }
});

// Helper: auth by order token
async function authOrder(req, res) {
  const id = req.params.id;
  const token = req.header('x-order-token') || req.query.token;
  const r = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  const o = r.rows[0];
  if (!o) { res.status(404).json({ ok:false, error:'NOT_FOUND' }); return null; }
  if (!token || token !== o.order_token) { res.status(403).json({ ok:false, error:'FORBIDDEN' }); return null; }
  return o;
}

// Get order status/license (secure by token)
app.get('/api/orders/:id', rlPoll, async (req, res) => {
  const o = await authOrder(req, res); if (!o) return;
  res.json({ ok:true, id:o.id, status:o.status, license:o.license || null });
});

// Manual refresh (fallback)
app.post('/api/orders/:id/refresh', rlPoll, async (req, res) => {
  const o = await authOrder(req, res); if (!o) return;
  try {
    const r = await fetch('https://api.monobank.ua/api/merchant/invoice/status?invoiceId=' + o.invoice_id, {
      headers: { 'X-Token': MONO_TOKEN }
    });
    const j = await r.json();
    if (!r.ok) {
      log('[STATUS FAIL]', { status: r.status, body: j });
      return res.status(r.status).json(j);
    }
    const status = j.status ?? j?.invoice?.status ?? (Array.isArray(j?.statuses) ? j.statuses.at(-1)?.status : undefined) ?? 'unknown';

    let license = o.license;
    if (status === 'success' && !license) {
      license = makeLicense({ mid: o.mid, tier: o.tier, days: o.days });
      log('[LICENSE GENERATED via refresh]', { id: o.id });
    }

    await pool.query(
      'UPDATE orders SET status = $1, license = $2, updated_at = NOW() WHERE id = $3',
      [status, license, o.id]
    );

    const r2 = await pool.query('SELECT status, license FROM orders WHERE id = $1', [o.id]);
    const oo = r2.rows[0];
    res.json({ ok:true, status: oo.status, license: oo.license || null });
  } catch (e) {
    console.error('[REFRESH ERROR]', e);
    res.status(500).json({ ok:false, error:'REFRESH_FAILED' });
  }
});

// Admin bind (re-issue license for a different mid) — protect with ADMIN_TOKEN
app.post('/api/orders/:id/bind', async (req, res) => {
  const token = req.header('x-admin-token') || req.query.token;
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) return res.status(403).json({ ok:false, error:'FORBIDDEN' });
  const { mid } = req.body || {};
  if (!mid) return res.status(400).json({ ok:false, error:'MID_REQUIRED' });

  const r = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  const o = r.rows[0];
  if (!o) return res.status(404).json({ ok:false, error:'NOT_FOUND' });
  if (o.status !== 'success') return res.status(400).json({ ok:false, error:'NOT_PAID' });

  const license = makeLicense({ mid, tier:o.tier, days:o.days });
  await pool.query('UPDATE orders SET license = $1, mid = $2, updated_at = NOW() WHERE id = $3', [license, mid, o.id]);
  res.json({ ok:true, license });
});

/* ================== START ================== */
app.listen(PORT, () => console.log(`Mono server :${PORT}`));
