export const makeBase = (ip) => (/^https?:\/\//i.test(ip) ? ip : `http://${ip}`).replace(/\/+$/, '');

async function httpGet(url) {
  if (window.bb?.httpGet) return await window.bb.httpGet(url);
  try { const res = await fetch(url, { method: "GET", cache: "no-store" }); const text = await res.text().catch(()=> ""); return { ok: res.ok, status: res.status, statusText: res.statusText, text }; }
  catch (e) { return { ok:false, status:0, statusText:e.message, text:"" }; }
}

export async function pingESP({ baseUrl, mock }) {
  if (mock) { await new Promise(r=>setTimeout(r,120)); return { ok:true, via:"MOCK" }; }
  const r = await httpGet(`${baseUrl}/`); if (!r.ok) throw new Error(`GET / → ${r.status} ${r.statusText}`); return { ok:true, via:`HTTP ${r.status}` };
}

export async function hitRelay({ baseUrl, relayNum, state, mock }) {
  if (mock) { await new Promise(r=>setTimeout(r,160)); return { ok:true, mock:true }; }
  const url = `${baseUrl}/relay?num=${encodeURIComponent(relayNum)}&state=${state}`;
  const r = await httpGet(url); const ok = (r.status >= 200 && r.status < 400);
  if (!ok) throw new Error(`GET ${url} → ${r.status} ${r.statusText}\n${r.text?.slice(0,120) || ""}`);
  return { ok:true };
}
