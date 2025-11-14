// src/lib/licenseClient.js — pass forceNew to server in browser fallback (v8)
function getApiBase() {
  const c = [import.meta?.env?.VITE_LICENSE_SERVER_BASE, import.meta?.env?.VITE_API_BASE].filter(Boolean);
  if (!c.length) return "";
  return c[0].replace(/\/+$/, "");
}
async function apiPost(path, body) {
  const base = getApiBase();
  if (!base) throw new Error("API base is not configured");
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || res.statusText || "HTTP error");
  try { return JSON.parse(text); } catch { return { ok: true, raw: text }; }
}
export async function getMachineId() {
  try { if (window?.machine?.id) return await window.machine.id(); } catch {}
  try { let g = localStorage.getItem("machine.guid"); if (!g) { g = crypto.randomUUID?.() || String(Date.now()); localStorage.setItem("machine.guid", g);} return g; } catch { return ""; }
}
export function setStoredOrder(order) { try { localStorage.setItem("license.order", JSON.stringify(order)); } catch {} }
export function getStoredOrder() { try { const raw = localStorage.getItem("license.order"); return raw ? JSON.parse(raw) : null; } catch { return null; } }
export async function openPayment({ plan, machineId }) {
  if (window?.license?.openPayment) {
    const res = await window.icense?.openPayment({ plan, machineId, forceNew: true });
    if (res?.ok && res.order) setStoredOrder(res.order);
    return res?.order || null;
  }
  const o = await apiPost(`/api/orders`, { plan, machineId, forceNew: true });
  if (!o?.link) throw new Error("Order link not received from server");
  try { window.open(o.link, "_blank", "noopener,noreferrer"); } catch {}
  setStoredOrder(o);
  return o;
}
