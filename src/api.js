// src/lib/api.js
export const API_BASE = window.API_BASE || import.meta.env.VITE_API_BASE || "";

export async function api(path, init) {
  const r = await fetch(API_BASE + path, init);
  if (!r.ok) {
    const txt = await r.text().catch(()=> "");
    throw new Error(txt || `HTTP ${r.status}`);
  }
  return r.json();
}

export function formatMoney(n) {
  try { return new Intl.NumberFormat("uk-UA",{style:"currency",currency:"UAH",maximumFractionDigits:2}).format(n||0); }
  catch { return `₴${(n||0).toFixed(2)}`; }
}
