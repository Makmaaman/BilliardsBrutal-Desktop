// src/utils/net.js
// Small helpers: timeout fetch and server base discovery.

export async function fetchWithTimeout(url, opts = {}) {
  const { timeout = 8000, ...rest } = opts;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function probe(base) {
  try {
    const r = await fetchWithTimeout(`${base.replace(/\/$/, '')}/api/health`, { timeout: 2500 });
    if (!r.ok) return false;
    const j = await r.json().catch(() => null);
    return !!(j && j.ok);
  } catch {
    return false;
  }
}

export async function findReachableServerBase(candidates) {
  for (const c of candidates) {
    if (!c) continue;
    const ok = await probe(c);
    if (ok) return c.replace(/\/$/, '');
  }
  return null;
}
