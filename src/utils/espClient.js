// src/utils/espClient.js
export function getEspConfig() {
  const stores = ['esp-config','hardware.esp','settings.esp'];
  let cfg = {};
  for (const k of stores) {
    try { const raw = localStorage.getItem(k); if (raw) Object.assign(cfg, JSON.parse(raw)); } catch {}
  }
  const ip = (cfg.host || cfg.ip || '192.168.0.185').trim();
  const port = Number(cfg.port || 80);
  const proto = (cfg.proto || cfg.protocol || 'http').replace(':','');
  return { ip, port, proto };
}
export function espBase() {
  const { ip, port, proto } = getEspConfig();
  return `${proto}://${ip}${port && port !== 80 ? `:${port}` : ''}`;
}
export async function relayToggle(channel, on) {
  if (!channel || Number(channel) <= 0) throw new Error('invalid-channel');
  const url = `${espBase()}/relay?ch=${encodeURIComponent(channel)}&state=${on ? 'on' : 'off'}`;
  console.log('[ESP] GET', url);
  return fetch(url, { method: 'GET' });
}
export async function relayPulse(channel, ms = 200) {
  const url = `${espBase()}/pulse?ch=${encodeURIComponent(channel)}&ms=${Math.max(1, ms|0)}`;
  console.log('[ESP] GET', url);
  return fetch(url, { method: 'GET' });
}
