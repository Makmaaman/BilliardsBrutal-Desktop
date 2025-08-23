import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';

const app = express();
const PORT = process.env.PORT || 8080;
const ORIGIN = process.env.PUBLIC_ORIGIN || '*';
const MONO_TOKEN = process.env.MONO_TOKEN;         // X-Token мерчанта Monobank
const WEBHOOK_URL = process.env.WEBHOOK_URL;       // https://<твій-сервер>/api/mono/webhook
const REDIRECT_URL = process.env.REDIRECT_URL;     // сторінка "після оплати"
const PRIVATE_KEY_PEM = process.env.PRIVATE_KEY_PEM; // Ed25519 PKCS#8 — тільки в Env!

app.use(cors({ origin: ORIGIN }));
app.use(express.json({ limit: '1mb' })); // JSON для всіх, крім webhook

// Дуже проста "БД" у пам'яті (в проді заміни на Redis/БД)
const ORDERS = new Map(); // id -> {id, mid, tier, days, status, license, invoiceId}

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

function makeLicense({ mid, tier='pro', days=365, sub='Duna Billiard Club' }) {
  const payload = { mid, tier, exp: Date.now() + days*86400_000, iat: Date.now(), sub };
  const txt = Buffer.from(JSON.stringify(payload));
  const sig = crypto.sign(null, txt, PRIVATE_KEY_PEM); // Ed25519, без алгоритму → OK
  return `${b64url(txt)}.${b64url(sig)}`;
}

app.get('/', (_req, res) => res.send('Mono license server OK'));

// 1) Створити інвойс Monobank
app.post('/api/orders', async (req, res) => {
  try {
    const { mid, tier = 'pro', days = 365, email = '' } = req.body || {};
    if (!mid) return res.status(400).json({ ok:false, error:'MID_REQUIRED' });

    const id = crypto.randomUUID();
    ORDERS.set(id, { id, mid, tier, days, status: 'new' });

    const body = {
      amount: 100,            // 250.00 UAH у копійках — заміни під свій тариф
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
    if (!r.ok) return res.status(r.status).json(j);

    ORDERS.get(id).invoiceId = j.invoiceId;
    return res.json({ ok:true, orderId:id, checkoutUrl:j.pageUrl });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:'ORDER_CREATE_FAILED' });
  }
});

// 2) Webhook Monobank (потребує RAW body для перевірки підпису X-Sign)
app.post('/api/mono/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const bodyBuf = Buffer.from(req.body);
    const xSign = req.header('X-Sign');
    if (!xSign) return res.sendStatus(400);

    // 2.1 Отримати публічний ключ Monobank (краще кешувати на 1 годину)
    const pkRes = await fetch('https://api.monobank.ua/api/merchant/pubkey', {
      headers: { 'X-Token': MONO_TOKEN }
    });
    const { key: pubKeyBase64 } = await pkRes.json();
    const pubKeyPem = Buffer.from(pubKeyBase64, 'base64').toString('utf8');

    // 2.2 Перевірка підпису: ECDSA(SHA-256), X-Sign у Base64 (ASN.1 DER)
    const ok = crypto.verify(
      'sha256',
      bodyBuf,
      crypto.createPublicKey(pubKeyPem),
      Buffer.from(xSign, 'base64')
    );
    if (!ok) return res.sendStatus(400);

    const data = JSON.parse(bodyBuf.toString('utf8'));
    const { invoiceId, status, reference } = data;

    const orderId = reference || [...ORDERS.values()].find(o => o.invoiceId === invoiceId)?.id;
    if (orderId) {
      const o = ORDERS.get(orderId) || {};
      o.status = status;
      if (status === 'success' && !o.license) {
        o.license = makeLicense({ mid: o.mid, tier: o.tier, days: o.days });
      }
      ORDERS.set(orderId, o);
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('webhook error', e);
    res.sendStatus(500);
  }
});

// 3) Клієнт тягне статус/ліцензію (для автозавантаження в апці)
app.get('/api/orders/:id', (req, res) => {
  const o = ORDERS.get(req.params.id);
  if (!o) return res.status(404).json({ ok:false, error:'NOT_FOUND' });
  res.json({ ok:true, id:o.id, status:o.status || 'new', license:o.license || null });
});

app.listen(PORT, () => console.log(`Mono server :${PORT}`));
