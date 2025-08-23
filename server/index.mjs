import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';

const app = express();

// ===== ENV =====
const PORT = process.env.PORT || 8080;
const ORIGIN = process.env.PUBLIC_ORIGIN || '*';
const MONO_TOKEN = process.env.MONO_TOKEN;             // X-Token мерчанта Monobank
const WEBHOOK_URL = process.env.WEBHOOK_URL;           // https://<host>/api/mono/webhook
const REDIRECT_URL = process.env.REDIRECT_URL || 'https://example.com/payment-result';
const PRIVATE_KEY_PEM = process.env.PRIVATE_KEY_PEM;   // Ed25519 PKCS#8 — ТІЛЬКИ в Env!

if (!MONO_TOKEN) console.warn('[ENV] MONO_TOKEN is missing');
if (!PRIVATE_KEY_PEM) console.warn('[ENV] PRIVATE_KEY_PEM is missing');

// CORS
app.use(cors({ origin: ORIGIN }));

// ===== In-memory "DB" =====
const ORDERS = new Map(); // id -> { id, mid, tier, days, status, license, invoiceId }

// ===== Utils =====
const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');

function makeLicense({ mid, tier = 'pro', days = 365, sub = 'Duna Billiard Club' }) {
  const payload = { mid, tier, exp: Date.now() + days * 86400_000, iat: Date.now(), sub };
  const txt = Buffer.from(JSON.stringify(payload));
  const sig = crypto.sign(null, txt, PRIVATE_KEY_PEM); // Ed25519
  return `${b64url(txt)}.${b64url(sig)}`;
}

function log(tag, obj) {
  const ts = new Date().toISOString();
  if (obj !== undefined) console.log(`[${ts}] ${tag}`, obj);
  else console.log(`[${ts}] ${tag}`);
}

// ===== Monobank public key cache =====
let monoPubkeyPem = null;
let monoPubkeyExp = 0;
async function getMonoPubkeyPem() {
  const now = Date.now();
  if (monoPubkeyPem && now < monoPubkeyExp) return monoPubkeyPem;

  const resp = await fetch('https://api.monobank.ua/api/merchant/pubkey', {
    headers: { 'X-Token': MONO_TOKEN }
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Failed to get Mono pubkey: ${resp.status} ${txt}`);
  }
  const { key } = await resp.json(); // base64-encoded PEM string
  monoPubkeyPem = Buffer.from(key, 'base64').toString('utf8');
  monoPubkeyExp = now + 60 * 60 * 1000; // 1 hour
  return monoPubkeyPem;
}

// ===== WEBHOOK (RAW BODY!) — ставимо ДО express.json() =====
app.post('/api/mono/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const bodyBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
    const xSign = req.header('X-Sign');
    if (!xSign) {
      log('[WEBHOOK] Missing X-Sign');
      return res.sendStatus(400);
    }

    const pubKeyPem = await getMonoPubkeyPem();
    const isValid = crypto.verify('sha256', bodyBuf, crypto.createPublicKey(pubKeyPem), Buffer.from(xSign, 'base64'));
    if (!isValid) {
      log('[WEBHOOK] BAD SIGN');
      return res.sendStatus(400);
    }

    const data = JSON.parse(bodyBuf.toString('utf8'));

    const invoiceId =
      data.invoiceId ?? data?.data?.invoiceId ?? data?.invoice?.invoiceId ?? null;
    const status =
      data.status ?? data?.data?.status ?? data?.invoice?.status ?? null;
    const reference =
      data.reference ?? data?.data?.reference ?? data?.invoice?.reference ?? null;

    log('[WEBHOOK OK]', { invoiceId, status, reference });

    const orderId = reference || [...ORDERS.values()].find(o => o.invoiceId === invoiceId)?.id;
    if (!orderId) {
      log('[WEBHOOK] Order not found for', { invoiceId, reference });
      return res.sendStatus(200);
    }

    const o = ORDERS.get(orderId) || {};
    o.status = status || o.status || 'unknown';

    if (o.status === 'success' && !o.license) {
      o.license = makeLicense({ mid: o.mid, tier: o.tier, days: o.days });
      log('[LICENSE GENERATED]', { orderId, mid: o.mid, tier: o.tier, days: o.days });
    }

    ORDERS.set(orderId, o);
    return res.sendStatus(200);
  } catch (e) {
    console.error('webhook error', e);
    return res.sendStatus(500);
  }
});

// ===== JSON parser — ПІСЛЯ вебхука! =====
app.use(express.json({ limit: '1mb' }));

// Alive-check
app.get('/', (_req, res) => res.send('Mono license server OK'));

// ===== Create order (Monobank invoice) =====
app.post('/api/orders', async (req, res) => {
  try {
    const { mid, tier = 'pro', days = 365, email = '' } = req.body || {};
    if (!mid) return res.status(400).json({ ok: false, error: 'MID_REQUIRED' });

    const id = crypto.randomUUID();
    ORDERS.set(id, { id, mid, tier, days, status: 'new' });

    const body = {
      amount: 100, // 250.00 UAH у копійках — змініть під свій тариф
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

    const invoiceId = j.invoiceId;
    const pageUrl = j.pageUrl;

    const o = ORDERS.get(id);
    if (o) o.invoiceId = invoiceId;
    ORDERS.set(id, o);

    log('[ORDER_CREATE OK]', { id, invoiceId, pageUrl });
    return res.json({ ok: true, orderId: id, checkoutUrl: pageUrl });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'ORDER_CREATE_FAILED' });
  }
});

// ===== Poll order status / license =====
app.get('/api/orders/:id', (req, res) => {
  const o = ORDERS.get(req.params.id);
  if (!o) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
  return res.json({ ok: true, id: o.id, status: o.status || 'new', license: o.license || null });
});

// ===== Manual refresh (fallback, якщо webhook загубився) =====
app.post('/api/orders/:id/refresh', async (req, res) => {
  try {
    const o = ORDERS.get(req.params.id);
    if (!o?.invoiceId) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    const r = await fetch('https://api.monobank.ua/api/merchant/invoice/status?invoiceId=' + o.invoiceId, {
      headers: { 'X-Token': MONO_TOKEN }
    });
    const j = await r.json();
    if (!r.ok) {
      log('[STATUS FAIL]', { status: r.status, body: j });
      return res.status(r.status).json(j);
    }

    const status =
      j.status ?? j?.invoice?.status ?? (Array.isArray(j?.statuses) ? j.statuses[j.statuses.length - 1]?.status : undefined) ?? 'unknown';
    o.status = status;

    if (status === 'success' && !o.license) {
      o.license = makeLicense({ mid: o.mid, tier: o.tier, days: o.days });
      log('[LICENSE GENERATED via refresh]', { id: o.id });
    }

    ORDERS.set(o.id, o);
    return res.json({ ok: true, status: o.status, license: o.license || null });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'REFRESH_FAILED' });
  }
});

// ===== START =====
app.listen(PORT, () => console.log(`Mono server :${PORT}`));
