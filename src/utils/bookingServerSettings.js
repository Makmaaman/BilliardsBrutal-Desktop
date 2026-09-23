// src/utils/bookingServerSettings.js
// Зберігає/читає налаштування VPS-сервера онлайн-бронювань.

const KEY = "billiards_brutal_booking_server_v1";
const LS_APP_KEY = "billiards_brutal_v1"; // (опційно) якщо App дублює туди

function safeJsonParse(s, fallback = null) {
  try {
    if (!s) return fallback;
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

export function normalizeServerUrl(url) {
  let u = String(url || "").trim();
  if (!u) return "";
  u = u.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

function clampNumber(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  if (typeof min === "number" && n < min) return min;
  if (typeof max === "number" && n > max) return max;
  return n;
}

function normalizeOfflineHours(offlineHours) {
  const from = String(offlineHours?.from || "12:00").trim();
  const to = String(offlineHours?.to || "23:00").trim();
  return { from: from || "12:00", to: to || "23:00" };
}

function randomTokenPart(len = 10) {
  // намагаємось крипто-рандом
  try {
    const bytes = new Uint8Array(len);
    const cryptoObj = globalThis.crypto || globalThis.msCrypto;
    if (cryptoObj?.getRandomValues) {
      cryptoObj.getRandomValues(bytes);
      return Array.from(bytes)
        .map((b) => (b % 36).toString(36))
        .join("")
        .toUpperCase();
    }
  } catch {}
  // fallback
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}

export function generateTerminalToken() {
  // Формат: TERM_XXXXXXXX_XXXXXXXX_XXXXXXXX (як у твоєму прикладі)
  return `TERM_${randomTokenPart(8)}_${randomTokenPart(8)}_${randomTokenPart(8)}`;
}

export function loadBookingServerSettings() {
  const raw = safeJsonParse(localStorage.getItem(KEY), {});
  const appRaw = safeJsonParse(localStorage.getItem(LS_APP_KEY), {});

  // підтримка різних імен полів (token/terminalToken)
  const serverUrl =
    normalizeServerUrl(raw.serverUrl || raw.url || appRaw?.bookingServerUrl || "");

  const token =
    String(
      raw.terminalToken ||
        raw.token ||
        appRaw?.bookingServerToken ||
        ""
    ).trim();

  const enabled =
    raw.enabled !== undefined
      ? !!raw.enabled
      : appRaw?.bookingServerEnabled !== undefined
      ? !!appRaw.bookingServerEnabled
      : true;

  const pollMs = clampNumber(raw.pollMs, 15000, 5000, 600000);
  const heartbeatMs = clampNumber(raw.heartbeatMs, 20000, 8000, 600000);
  const offlineHours = normalizeOfflineHours(raw.offlineHours || appRaw?.bookingServerOfflineHours);

  return {
    enabled,
    serverUrl,
    token, // головне поле (SettingsModal використовує bookingCfg.token)
    terminalToken: token, // сумісність зі старим кодом
    pollMs,
    heartbeatMs,
    offlineHours,
  };
}

export function saveBookingServerSettings(patch = {}) {
  const cur = loadBookingServerSettings();

  const next = {
    ...cur,
    ...patch,
  };

  // token може прийти як token або terminalToken
  const mergedToken = String(
    patch.token !== undefined ? patch.token :
    patch.terminalToken !== undefined ? patch.terminalToken :
    next.token
  ).trim();

  next.serverUrl = normalizeServerUrl(next.serverUrl);
  next.token = mergedToken;
  next.terminalToken = mergedToken;
  next.enabled = next.enabled !== false;

  next.pollMs = clampNumber(next.pollMs, 15000, 5000, 600000);
  next.heartbeatMs = clampNumber(next.heartbeatMs, 20000, 8000, 600000);
  next.offlineHours = normalizeOfflineHours(next.offlineHours);

  localStorage.setItem(KEY, JSON.stringify(next));

  // (опційно) дублюємо в LS_APP, щоб TopBar/інший код точно бачив
  try {
    const appRaw = safeJsonParse(localStorage.getItem(LS_APP_KEY), {}) || {};
    const appNext = { ...appRaw };

    if (patch.enabled !== undefined) appNext.bookingServerEnabled = !!next.enabled;
    if (patch.serverUrl !== undefined) appNext.bookingServerUrl = next.serverUrl;
    if (patch.token !== undefined || patch.terminalToken !== undefined) {
      appNext.bookingServerToken = next.token;
    }
    appNext.bookingServerOfflineHours = next.offlineHours;

    localStorage.setItem(LS_APP_KEY, JSON.stringify(appNext));
  } catch {}

  // сигналимо хукам, що налаштування змінились
  try {
    window.dispatchEvent(new CustomEvent("booking-server-settings-changed", { detail: next }));
  } catch {}

  return next;
}
