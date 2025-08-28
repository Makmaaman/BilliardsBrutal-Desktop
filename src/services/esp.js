// src/services/esp.js
// Клієнт ESP через Electron IPC (без CORS). НІЧОГО не кидає — лише { ok, ... }.

export const makeBase = (ip) =>
  (/^https?:\/\//i.test(ip) ? ip : `http://${ip}`).replace(/\/+$/, '');

async function httpGet(url, { timeout = 5000 } = {}) {
  // 1) через main-процес
  if (window.esp?.get) {
    try {
      const r = await window.esp.get(url, { timeout });
      return r; // { ok, status, text } з main
    } catch (e) {
      return { ok: false, status: 0, statusText: String(e?.message || e), text: '' };
    }
  }

  // 2) фолбек (коли нема IPC) — "тихий" запит
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
    const text = await res.text().catch(() => '');
    clearTimeout(timer);
    return { ok: res.ok, status: res.status, statusText: res.statusText, text };
  } catch (e) {
    return { ok: false, status: 0, statusText: e?.message || 'NETWORK_ERROR', text: '' };
  }
}

export async function pingESP({ baseUrl, mock }) {
  if (mock) { await new Promise(r => setTimeout(r, 120)); return { ok: true, via: 'MOCK' }; }
  const r = await httpGet(`${baseUrl}/`);
  return r.ok ? { ok: true, via: `HTTP ${r.status}` } : { ok: false, error: `HTTP ${r.status} ${r.statusText}` };
}

export async function hitRelay({ baseUrl, relayNum, state, mock }) {
  if (mock) { await new Promise(r => setTimeout(r, 160)); return { ok: true, mock: true }; }
  const url = `${baseUrl}/relay?num=${encodeURIComponent(relayNum)}&state=${state}`;
  const r = await httpGet(url);
  return {
    ok: r && r.status >= 200 && r.status < 400,
    status: r?.status ?? 0,
    statusText: r?.statusText ?? '',
    text: r?.text ?? ''
  };
}
