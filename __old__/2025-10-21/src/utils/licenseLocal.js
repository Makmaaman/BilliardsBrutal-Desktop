// src/utils/licenseLocal.js
// RS256-only browser-side verification using WebCrypto.

function b64urlToBytes(b64url) {
  const pad = '==='.slice((b64url.length + 3) % 4);
  const b64 = (b64url.replace(/-/g, '+').replace(/_/g, '/')) + pad;
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

function parseJwt(token) {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('Invalid token');
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  const signature = b64urlToBytes(s);
  return { header, payload, signature, signingInput: new TextEncoder().encode(`${h}.${p}`) };
}

async function importRsaPublicKey(pem) {
  const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return await crypto.subtle.importKey(
    'spki',
    buf,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

export async function verifyLocalJWT_RS256(token, publicKeyPem) {
  try {
    const { header, payload, signature, signingInput } = parseJwt(token);
    if (header.alg !== 'RS256') {
      return { ok: false, header, error: `Unsupported alg ${header.alg}. RS256 only.` };
    }
    const key = await importRsaPublicKey(publicKeyPem);
    const ok = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      signature,
      signingInput
    );
    if (!ok) return { ok: false, header, error: 'Invalid signature' };
    return { ok: true, header, payload };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}
