// src/lib/connectivity.js
import { makeBase } from "../services/esp";

export function isValidIPv4(ip){
  try {
    return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(ip||"").trim());
  } catch { return false; }
}

export function getCandidateIPs({ controllers = [], relayIPs = {}, espIP } = {}){
  const u = new Set();
  (controllers||[])
    .filter(c => c && c.enabled !== false && isValidIPv4(c.ip))
    .forEach(c => u.add(String(c.ip).trim()));
  Object.values(relayIPs||{})
    .filter(ip => isValidIPv4(ip))
    .forEach(ip => u.add(String(ip).trim()));
  if (espIP && isValidIPv4(espIP)) u.add(String(espIP).trim());
  return Array.from(u);
}

async function pingURLRaw(url, { timeout = 1200, devNoCors = true } = {}){
  // 1) Electron IPC (preload)
  try {
    if (window.esp?.get){
      const r = await window.esp.get(url, { timeout });
      return { ok: !!(r && r.ok), via: "ipc", text: r?.text || "" };
    }
  } catch (e) {
    return { ok:false, via:"ipc", error: String(e?.message || e) };
  }
  // 2) fetch()
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    const opt = {};
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV && devNoCors) opt.mode = "no-cors";
    await fetch(url, { signal: controller.signal, ...opt });
    clearTimeout(t);
    return { ok:true, via:"fetch", text: "" };
  } catch (e) {
    return { ok:false, via:"fetch", error: String(e?.message || e) };
  }
}

export async function pingAny({ controllers = [], relayIPs = {}, espIP } = {}, { timeout = 1200 } = {}){
  const ips = getCandidateIPs({ controllers, relayIPs, espIP });
  if (!ips.length) return { online:false, ips, results:[], reason:"no-ips" };
  const results = [];
  for (const ip of ips){
    const base = makeBase(ip);
    const r = await pingURLRaw(`${base}/ping`, { timeout });
    results.push({ ip, ...r });
    if (r.ok) return { online:true, ips, results, reason:"ok" };
  }
  return { online:false, ips, results, reason:"all-fail" };
}

export function formatDiag(diag){
  if (!diag) return "Статус невідомий";
  const when = diag.when ? new Date(diag.when).toLocaleTimeString("uk-UA") : "—";
  const ips = (diag.ips||[]).join(", ");
  const okCount = (diag.results||[]).filter(x=>x.ok).length;
  const total = (diag.ips||[]).length;
  return `Перевірено ${when}. IP: [${ips || "—"}] • онлайн: ${okCount}/${total}`;
}