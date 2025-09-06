// src/lib/espClient.js

// Базовий GET через IPC (або тихий фолбек, якщо IPC недоступний)
export async function espGET(url, { timeout = 5000, silent = true } = {}) {
  try {
    if (window.esp?.get) {
      const r = await window.esp.get(url, { timeout });
      if (!r.ok) throw new Error(r.error || ('HTTP ' + r.status));
      return r; // { ok:true, status, text }
    }
    // Фолбек: "тихий" no-cors (відповідь не прочитаємо, але команда піде)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    return { ok: true, status: 200, text: '' };
  } catch (e) {
    if (!silent) throw e;
    console.warn('[ESP]', e.message || e);
    return { ok: false, error: e.message || String(e) };
  }
}

// Зручні хелпери під типові маршрути вашого ESP
export async function relay(espBaseUrl, num, state, opts = {}) {
  const base = String(espBaseUrl || '').replace(/\/+$/, '');
  const url = `${base}/relay?num=${encodeURIComponent(num)}&state=${state ? 'on' : 'off'}`;
  return espGET(url, opts);
}

export async function ping(espBaseUrl, opts = {}) {
  const base = String(espBaseUrl || '').replace(/\/+$/, '');
  return espGET(`${base}/ping`, opts);
}

// Додайте свої, якщо потрібно:
// export async function pwm(espBaseUrl, ch, value, opts = {}) { ... }
