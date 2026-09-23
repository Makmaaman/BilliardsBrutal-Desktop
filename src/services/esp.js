// src/services/esp.js — focused fix for baseForChannel / hitRelay
import { ping as clientPing, relay as clientRelay, normalizeBase } from "../lib/espClient";
import { isValidIPv4, cleanIP } from "../utils/ip";
import { computeOnline, summarizeControllersStrict, buildRelayStatusText, FRESHNESS_MS } from "../utils/relayStatus";
export { computeOnline, summarizeControllersStrict, buildRelayStatusText, FRESHNESS_MS };

export function makeBase(controllerOrIp) {
  if (!controllerOrIp) return null;
  if (typeof controllerOrIp === "string") {
    const ipS = cleanIP(controllerOrIp);
    return ipS ? normalizeBase(ipS) : null;
  }
  const ip = cleanIP(controllerOrIp.espIP || controllerOrIp.ip || "");
  return normalizeBase(ip);
}

/**
 * Choose base URL for a given channel (0-based).
 * Priority:
 *  1) per-channel IP if it's a valid IPv4 and (optionally) differs from main IP,
 *  2) otherwise controller main IP (espIP/ip)
 * This prevents a stale/invalid relayIPs[3] from silently hijacking table #4.
 */
export function baseForChannel(controller, channel) {
  if (!controller) return null;
  const ch = Number(channel) || 0;
  const main = cleanIP(controller.espIP || controller.ip || "");
  const relIPs = Array.isArray(controller.relayIPs) ? controller.relayIPs : [];
  const perRaw = relIPs[ch] ?? "";
  const per = cleanIP(perRaw);

  // Use per-channel only if it's a valid IPv4. If invalid/empty — fall back to main.
  const selected = isValidIPv4(per) ? per : main;
  return selected ? normalizeBase(selected) : null;
}

/** passthrough ping if someone needs it */
export async function pingController(controller) {
  const base = makeBase(controller);
  if (!base) return { ok: false };
  return clientPing(base);
}

/**
 * Backward-compatible relay call:
 *  - New form: hitRelay(controller, channel, state)
 *  - Legacy form: hitRelay({ baseUrl, relayNum, state })
 */
export async function hitRelay(controllerOrObj, channel, state) {
  // Legacy object form
  if (controllerOrObj && typeof controllerOrObj === "object" && (controllerOrObj.baseUrl || controllerOrObj.relayNum !== undefined)) {
    const base = controllerOrObj.baseUrl || makeBase(controllerOrObj.controller || controllerOrObj.ip || controllerOrObj.espIP || null);
    const ch = Number(controllerOrObj.relayNum || 0);
    const st = state ?? controllerOrObj.state;
    if (!base) return { ok: false, error: "invalid base" };
    return await clientRelay(base, ch, st);
  }

  // New form
  const controller = controllerOrObj;
  if (!controller?.enabled) return { ok: false, error: "controller disabled" };
  const ch = Number(channel) || 0;
  const base = baseForChannel(controller, ch);
  if (!base) return { ok: false, error: "invalid base" };
  return await clientRelay(base, ch, state);
}

export function summarizeControllers(controllers = []) {
  return summarizeControllersStrict(controllers);
}