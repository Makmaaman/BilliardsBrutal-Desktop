// src/lib/espClient.js — deterministic 0-based mapping for 4 relays (0,1,2,3)
function hasBridge() {
  try { return typeof window !== "undefined" && window.esp && typeof window.esp.get === "function"; }
  catch { return false; }
}

export function normalizeBase(base) {
  if (!base) return null;
  let b = String(base).trim();
  if (!/^https?:\/\//i.test(b)) b = "http://" + b;
  return b.replace(/\/+$/,"");
}

async function bridgeGET(url) {
  if (!hasBridge()) return null;
  try {
    const res = await window.esp.get(url);
    if (res && typeof res.ok === "boolean") return res;
  } catch {}
  return null;
}

async function fetchGET(url, timeout = 1500) {
  try {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const id = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    const res = await fetch(url, { method: "GET", mode: "no-cors", cache: "no-cache", signal: ctrl ? ctrl.signal : undefined });
    if (id) clearTimeout(id);
    // On LAN many firmwares return opaque; treat as success for relay toggle
    if (res && res.type === "opaque") return { ok: true, opaque: true, status: 0 };
    return { ok: !!res?.ok, status: res?.status ?? 0 };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

async function httpGET(url, timeout = 1500) {
  const viaBridge = await bridgeGET(url);
  if (viaBridge) return viaBridge;
  return fetchGET(url, timeout);
}

export async function ping(base, timeout = 1200) {
  const b = normalizeBase(base);
  if (!b) return { ok: false };
  const start = Date.now();
  for (const p of ["/ping", "/status", "/"]) {
    const res = await httpGET(b + p, timeout);
    if (res.ok) return { ok: true, ms: Date.now() - start };
  }
  return { ok: false };
}

export async function relay(base, channel, state, timeout = 1500) {
  const b = normalizeBase(base);
  if (!b) return { ok: false, error: "invalid base" };

  // Expecting 0-based channels: 0,1,2,3  => tables 1,2,3,4
  const ch0 = Number(channel) || 0;

  const v = String(state ?? "").toLowerCase();
  const on  = v === "on" || v === "1" || v === "true";
  const off = v === "off" || v === "0" || v === "false";
  const stateParam = on ? "on" : off ? "off" : (v || "on");

  // Primary (what you confirmed works): /relay?num=<ch0>&state=<...>
  let url = `${b}/relay?num=${ch0}&state=${stateParam}`;
  let res = await httpGET(url, timeout);
  if (res.ok || res.opaque) return { ok: true };

  // Fallback with trailing slash (some firmwares require it)
  url = `${b}/relay?num=${ch0}&state=${stateParam}/`;
  res = await httpGET(url, timeout);
  if (res.ok || res.opaque) return { ok: true };

  return { ok: false, error: "relay endpoint failed" };
}
