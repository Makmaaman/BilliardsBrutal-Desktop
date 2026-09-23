import { isValidIPv4, cleanIP } from "./ip";

/** Consider a controller online if:
 *  - controller.enabled !== false
 *  - has a valid IP (espIP or ip)
 *  - controller.online === true
 *  - lastSeen is recent (< FRESHNESS_MS)
 */
export const FRESHNESS_MS = 15000;

export function computeOnline(controller, now = Date.now()) {
  if (!controller || controller.enabled === false) return false;
  const ip = cleanIP(controller.espIP || controller.ip || "");
  if (!isValidIPv4(ip)) return false;
  if (!controller.online) return false;
  const last = Number(controller.lastSeen || 0);
  return !!(last && (now - last) <= FRESHNESS_MS);
}

/** Summarize enabled controllers */
export function summarizeControllersStrict(controllers = []) {
  const now = Date.now();
  const list = (Array.isArray(controllers) ? controllers : []).filter(c => c && c.enabled !== false);
  const total = list.length;
  let online = 0;
  let latency;
  for (const c of list) {
    if (computeOnline(c, now)) {
      online += 1;
      if (latency == null && c.latency != null) latency = c.latency;
    }
  }
  return { total, online, anyOnline: online > 0, latency };
}

export function buildRelayStatusText(controllers = [], fallback = "Реле офлайн") {
  const s = summarizeControllersStrict(controllers);
  return s.anyOnline ? `Онлайн ${s.online}/${s.total}` : fallback;
}
