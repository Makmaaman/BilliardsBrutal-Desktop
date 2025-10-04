export const lsGet  = (k, f = null) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch { return f; } };
export const lsSet  = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
