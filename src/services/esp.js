// src/services/esp.js

export function makeBase(ip) {
  // У DEV ходимо через Vite proxy, щоб не було CORS
  // У проді/електроні — напряму на пристрій
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return '/esp';
  return `http://${ip}`;
}

async function httpGet(url, { triedNoCors = false } = {}) {
  const opts = { method: 'GET', redirect: 'follow' };
  try {
    const res = await fetch(url, opts);
    // Якщо працюємо через проксі — буде нормальний response
    if (res.type === 'opaque') {
      // (раптово) якщо хтось викличе напряму з браузера без проксі і ввімкнеться no-cors —
      // вважаємо успіхом (статус не доступний)
      return;
    }
    if (res.ok || (res.status >= 200 && res.status < 400)) return;

    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text}`);
  } catch (e) {
    // fallback: якщо все ж таки пішли напряму і ловимо CORS — спробуємо no-cors один раз
    if (!triedNoCors && typeof window !== 'undefined') {
      try {
        await fetch(url, { method: 'GET', mode: 'no-cors', redirect: 'follow' });
        return;
      } catch {}
    }
    throw e;
  }
}

export async function hitRelay({ baseUrl, relayNum, state, mock }) {
  if (mock) return; // у mock-режимі просто нічого не робимо
  const url = `${baseUrl}/relay?num=${encodeURIComponent(relayNum)}&state=${encodeURIComponent(state)}`;
  await httpGet(url);
}
