import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';

/**
 * ENV
 */
const app = express();
const PORT = process.env.PORT || 8080;
const ORIGIN = process.env.PUBLIC_ORIGIN || '*';
const MONO_TOKEN = process.env.MONO_TOKEN;             // X-Token мерчанта Monobank
const WEBHOOK_URL = process.env.WEBHOOK_URL;           // https://<host>/api/mono/webhook
const REDIRECT_URL = process.env.REDIRECT_URL || 'https://example.com/payment-result';
const PRIVATE_KEY_PEM = process.env.PRIVATE_KEY_PEM;   // Ed25519 PKCS#8 — ТІЛЬКИ в Env!

if (!MONO_TOKEN) console.warn('[ENV] MONO_TOKEN is missing');
if (!PRIVATE_KEY_PEM) console.warn('[ENV] PRIVATE_KEY_PEM is missing');

app.use(cors({ origin: ORIGIN }));

/**
 * Дуже проста «БД» в памʼяті.
 * На проді: Redis/DB.
 */
const ORDERS = new Map(); // id -> { id, mid, tier, days, status, license, invoiceId }

/**
 * Утиліти
 */
const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

function makeLicense({ mid, tier = 'pro', days = 365, sub = 'Duna Billiard Club' }) {
  const payload = { mid, tier, exp: Date.now() + days * 86400_000, iat: Date.now(), sub };
  const txt = Buffer.from(JSON.stringify(payload));
  const sig = crypto.sign(null, txt, PRIVATE_KEY_PEM); // Ed25519
  return `${b64url(txt)}.${b64url(sig)}`;
}

function log(tag, obj) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${tag}`, obj ?? '');
}

/**
 * Кеш публічного ключа Monobank (щоб не тягнути на кожен webhook)
 */
let monoPubkeyPem = null;
let monoPubkeyExp = 0;
async function getMonoPubkeyPem() {
  const now = Date.now();
  if (monoPubkeyPem && now < monoPubkeyExp) return monoPubkeyPem;

  const resp = await fetch('https://api.monobank.ua/api/merchant/pubkey', {
    headers: { 'X-Token': MONO_TOKEN }
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(()=>'');
    throw new Error(`Failed to get Mono pubkey: ${resp.status} ${txt}`);
  }
  const { key } = await resp.json(); // base64 of PEM string
  monoPubkeyPem = Buffer.from(key, 'base64').toString('utf8');
  monoPubkeyExp = now + 60 * 60 * 1000; // 1 година
  return monoPubkeyPem;
}

/**
 * WEBHOOK — ВАЖЛИВО: сире тіло (raw) ДО express.json()
 * Перевірка підпису X-Sign: ECDSA(SHA-256), ASN.1 DER у Base64
 */
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

    // Структури вебхука можуть відрізнятись — намагаємось діставати максимально толерантно:
    const invoiceId =
      data.invoiceId ?? data?.data?.invoiceId ?? data?.invoice?.invoiceId ?? null;
    const status =
      data.status ?? data?.data?.status ?? data?.invoice?.status ?? null;
    const reference =
      data.reference ?? data?.data?.reference ?? data?.invoice?.reference ?? null;

    log('[WEBHOOK OK]', { invoiceId, status, reference });

    // Знаходимо замовлення по reference (наш orderId) або по invoiceId
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

/**
 * ТІЛЬКИ після вебхука: загальний JSON-парсер для решти маршрутів
 */
app.use(express.json({ limit: '1mb' }));

/**
 * Alive-check
 */
app.get('/', (_req, res) => res.send('Mono license server OK'));

/**
 * 1) Створити інвойс Monobank (клієнт натискає "Купити онлайн")
 */
app.post('/api/orders', async (req, res) => {
  try {
    const { mid, tier = 'pro', days = 365, email = '' } = req.body || {};
    if (!mid) return res.status(400).json({ ok: false, error: 'MID_REQUIRED' });

    const id = crypto.randomUUID();
    ORDERS.set(id, { id, mid, tier, days, status: 'new' });

    const body = {
      amount: 25000, // 250.00 UAH у копійках
