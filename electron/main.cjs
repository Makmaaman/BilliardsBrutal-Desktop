/* electron/main.cjs — v35
   - ДВА режими друку: RAW:9100 (ESC/POS) + Системний спулер (тихий друк без діалогу)
   - printer:scan → завжди повертає МАСИВ [{ip,port,kind}]
   - printers:listSystem, printers:testSystem, printers:printHtml
   - Збережено ліцензію/оплату як у тебе
*/
const path = require("path");
const { app, BrowserWindow, ipcMain, shell, net: eNet } = require("electron");
const os = require("os");
const crypto = require("crypto");
const fs = require("fs");
const tcp = require("net");

const HARD_BASE = "https://billiardsbrutal-desktop-1.onrender.com";
const LIC_DIR = app.getPath("userData");
const LIC_JSON = path.join(LIC_DIR, "license.json");
const LIC_JWT  = path.join(LIC_DIR, "license.jwt");

// HTML-принт (твій модуль)
const { registerReceiptPrinting } = require("./receiptPrinter.cjs");
// ESC/POS (якщо є)
let registerEscposPrinting = null;
try { ({ registerEscposPrinting } = require("./escpos.cjs")); } catch (_) {}

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let mainWindow = null;
let paymentWindow = null;

/* ---------- machine/license ---------- */
function computeMachineId() {
  try {
    const nets = os.networkInterfaces();
    const macs = Object.values(nets).flat().filter(Boolean).map(n => n.mac).filter(m => m && m !== "00:00:00:00:00:00").sort().join("|");
    const seed = [os.hostname(), os.arch(), os.platform(), macs, process.execPath, app.getPath("userData")].join("#");
    return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32);
  } catch {
    return crypto.createHash("sha256").update(os.hostname() + (process.env.USER || "unknown")).digest("hex").slice(0, 32);
  }
}
function readLicenseToken() {
  try {
    const raw = fs.readFileSync(LIC_JSON, "utf-8").trim();
    if (raw) {
      try { const o = JSON.parse(raw); if (o && o.jwt) return String(o.jwt); } catch {}
      if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(raw)) return raw;
    }
  } catch {}
  try { const raw = fs.readFileSync(LIC_JWT, "utf-8").trim(); if (raw) return raw; } catch {}
  return null;
}
function writeLicenseToken(jwt) {
  const token = String(jwt || "").trim();
  if (!token) throw new Error("Empty license token");
  fs.writeFileSync(LIC_JSON, JSON.stringify({ jwt: token }, null, 2), "utf-8");
  fs.writeFileSync(LIC_JWT, token, "utf-8");
  return token;
}
function decodeJwtPayload(token){
  try{
    const p = String(token||"").split(".")[1];
    if (!p) return null;
    const pad = (s)=> s + "=".repeat((4 - s.length % 4) % 4);
    const json = Buffer.from(pad(p).replace(/-/g,"+").replace(/_/g,"/"), "base64").toString("utf-8");
    return JSON.parse(json);
  }catch{ return null; }
}

/* ---------- http via electron.net ---------- */
function httpJson(method, url, body) {
  return new Promise((resolve, reject) => {
    try {
      const req = eNet.request({ method, url });
      req.setHeader("Content-Type", "application/json");
      const t = setTimeout(() => { try{req.abort();}catch{}; reject(new Error("NETWORK_TIMEOUT")); }, 20000);
      req.on("response", (res) => {
        const chunks=[]; res.on("data",(c)=>chunks.push(Buffer.isBuffer(c)?c:Buffer.from(c)));
        res.on("end", ()=> {
          clearTimeout(t);
          const text = Buffer.concat(chunks).toString("utf-8");
          let json=null; try{ json = JSON.parse(text||"{}"); }catch{}
          if (res.statusCode<200 || res.statusCode>=300){
            const msg = (json && (json.error||json.message)) || text || String(res.statusCode);
            reject(new Error(msg));
          } else resolve(json||{});
        });
      });
      req.on("error", (e)=>{ clearTimeout(t); reject(e); });
      req.end(body ? JSON.stringify(body) : undefined);
    } catch(e){ reject(e); }
  });
}
const postJson = (u,b)=>httpJson("POST",u,b);
const getJson  = (u)=>httpJson("GET",u,null);

function normalizeOrder(resp) {
  const src = (resp && (resp.order || resp)) || {};
  const id = src.id || src.orderId || src.dbId || null;
  const invoiceId = src.invoiceId || src.invoice || src.invoice_id || null;
  const link = src.link || src.pageUrl || src.paymentLink || src.payment_url || src.url || null;
  return { id, invoiceId, link, ...src };
}
async function createOrder({ plan, machineId, forceNew }) {
  const raw = await postJson(`${HARD_BASE}/api/orders`, { plan, machineId, forceNew: !!forceNew });
  return normalizeOrder(raw);
}
async function refreshOrder(orderId) {
  const raw = await postJson(`${HARD_BASE}/api/orders/${encodeURIComponent(orderId)}/refresh`, {});
  return normalizeOrder(raw);
}
async function activateLicense({ machineId, orderId }) {
  return postJson(`${HARD_BASE}/api/license/activate`, { machineId, orderId });
}
async function pingApi() {
  try { return await getJson(`${HARD_BASE}/api/ping`); } catch (e) { return { ok:false, error: e.message || String(e) }; }
}

/* ---------- RAW:9100 tools ---------- */
function getLocalSubnets() {
  const nets = os.networkInterfaces();
  const out = new Set();
  for (const ifs of Object.values(nets)) {
    for (const n of (ifs || [])) {
      if (!n || n.internal || n.family !== "IPv4") continue;
      const ip = String(n.address || "");
      if (/^(10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/.test(ip)) {
        const p = ip.split("."); if (p.length===4) out.add(`${p[0]}.${p[1]}.${p[2]}.`);
      }
    }
  }
  return Array.from(out.values());
}
function tryConnect9100(host, timeout=1000){
  return new Promise((resolve) => {
    const s = new tcp.Socket(); let done=false;
    const finish=(ok)=>{ if(done) return; done=true; try{s.destroy();}catch{}; resolve(ok); };
    s.setTimeout(timeout);
    s.once("connect", ()=> finish(true));
    s.once("timeout", ()=> finish(false));
    s.once("error",  ()=> finish(false));
    s.connect({ host, port: 9100 });
  });
}
async function discoverPrinters9100({ timeout=1500, hosts, bases } = {}){
  let candidates = [];
  if (Array.isArray(hosts) && hosts.length) candidates = hosts;
  else {
    const roots = Array.isArray(bases)&&bases.length ? bases : getLocalSubnets();
    for (const b of roots) for (let i=1;i<=254;i++) candidates.push(b+i);
  }
  const CONC = 64, out=[]; let idx=0;
  await Promise.all(Array.from({length:CONC}, async ()=>{
    while(idx<candidates.length){
      const ip = candidates[idx++]; try { if (await tryConnect9100(ip, timeout)) out.push({ ip, port:9100, kind:"raw9100" }); } catch {}
    }
  }));
  out.sort((a,b)=> a.ip.localeCompare(b.ip));
  return out;
}
function sendRaw9100({ ip, data, timeout=4000 }){
  return new Promise((resolve, reject)=>{
    const s = new tcp.Socket(); let finished=false;
    const done=(err)=>{ if(finished) return; finished=true; try{s.end();s.destroy();}catch{}; err?reject(err):resolve(); };
    s.setTimeout(timeout, ()=> done(new Error("TIMEOUT")));
    s.once("error", (e)=> done(e));
    s.connect({ host: ip, port: 9100 }, ()=>{
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data||""), "utf8");
      s.write(buf, (err)=> {
        if (err) return done(err);
        setTimeout(()=> done(), 150); // дати буферу піти в мережу
      });
    });
  });
}

/* ---------- System silent HTML print ---------- */
async function printHtmlSilent({ html, deviceName, landscape=false }) {
  if (!deviceName) throw new Error("No deviceName");
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    const cleanup = () => { try{win.close();}catch{} };
    win.on("closed", ()=> {});
    const url = "data:text/html;charset=utf-8," + encodeURIComponent(html);
    win.loadURL(url).then(()=> {
      win.webContents.print({
        silent: true,
        deviceName,
        printBackground: true,
        landscape,
      }, (success, failureReason) => {
        cleanup();
        if (!success) reject(new Error(failureReason || "Print failed"));
        else resolve(true);
      });
    }).catch((e)=> { cleanup(); reject(e); });
  });
}

/* ---------- Payment window ---------- */
async function openPayment({ orderId, plan = "full-5", machineId, forceNew = true }) {
  const mid = machineId || computeMachineId();
  let order;
  if (forceNew) order = await createOrder({ plan, machineId: mid, forceNew: true });
  else if (orderId) { try { order = await refreshOrder(orderId); } catch { order = await createOrder({ plan, machineId: mid, forceNew: true }); } }
  else order = await createOrder({ plan, machineId: mid, forceNew: true });
  if (!order || !order.link) throw new Error("No payment link");

  try {
    const wins = BrowserWindow.getAllWindows();
    const serialized = JSON.stringify(order);
    await Promise.all(wins.map(w => w.webContents.executeJavaScript(
      `localStorage.setItem('license.order', ${JSON.stringify(serialized)});
       localStorage.setItem('LS_LICENSE_ORDER_JSON', ${JSON.stringify(serialized)}); true;`, true
    )));
  } catch {}

  const payUrl = `${order.link}${order.link.includes("?") ? "&" : "?"}t=${Date.now()}`;
  if (paymentWindow && !paymentWindow.isDestroyed()) { try{await paymentWindow.webContents.session.clearCache();}catch{}; try{paymentWindow.close();}catch{}; paymentWindow=null; }
  paymentWindow = new BrowserWindow({
    width: 560, height: 820, title: "Оплата ліцензії — Duna Billiard Club",
    autoHideMenuBar: true, resizable: true, show: true, modal: false,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  const sess = paymentWindow.webContents.session;
  try { await sess.clearCache(); } catch {}
  sess.webRequest.onBeforeSendHeaders((details, cb) => {
    const headers = { ...details.requestHeaders, "Cache-Control": "no-cache", "Pragma": "no-cache" };
    cb({ requestHeaders: headers });
  });
  paymentWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  paymentWindow.on("closed", () => { paymentWindow = null; });
  await paymentWindow.loadURL(payUrl);
  return { order };
}

/* ---------- IPC ---------- */
function registerIpc() {
  ipcMain.on("app:getVersionSync", (e) => { try { e.returnValue = app.getVersion(); } catch { e.returnValue = "dev"; } });
  ipcMain.on("machine:getIdSync", (e) => { try { e.returnValue = computeMachineId(); } catch { e.returnValue = ""; } });

  ipcMain.handle("app:getVersion", async () => { try { return app.getVersion(); } catch { return "dev"; } });
  ipcMain.handle("machine:getId", async () => { try { return computeMachineId(); } catch { return ""; } });

  ipcMain.handle("license:ping", async () => { try { const res = await pingApi(); return { ok:true, res }; } catch(e){ return { ok:false, error:e.message||String(e) }; } });
  ipcMain.handle("license:openPayment", async (_evt, payload) => { try { const result = await openPayment(payload||{}); return { ok:true, ...result }; } catch (err){ return { ok:false, error: err.message||String(err) }; } });
  ipcMain.handle("license:refreshOrder", async (_evt, { orderId }) => { try { const order = await refreshOrder(orderId); return { ok:true, order }; } catch (err){ return { ok:false, error: err.message||String(err) }; } });
  ipcMain.handle("license:activate", async (_evt, { machineId, orderId }) => { try { const result = await activateLicense({ machineId, orderId }); return { ok:true, ...result }; } catch (err){ return { ok:false, error: err.message||String(err) }; } });
  ipcMain.handle("license:applyJwt", async (_evt, { jwt, meta } = {}) => {
    try {
      if (!jwt || typeof jwt !== "string" || jwt.length < 40) throw new Error("Invalid license token");
      const token = writeLicenseToken(jwt);
      try {
        const cur = JSON.parse(fs.readFileSync(LIC_JSON,"utf-8"));
        const next = { ...cur, meta: {
          plan: meta?.plan || cur?.meta?.plan,
          mode: meta?.mode || cur?.meta?.mode,
          tablesLimit: Number(meta?.tablesLimit || cur?.meta?.tablesLimit || 0) || undefined,
          expiresAt: meta?.expiresAt || cur?.meta?.expiresAt
        }};
        fs.writeFileSync(LIC_JSON, JSON.stringify(next,null,2), "utf-8");
      } catch {}
      const wins = BrowserWindow.getAllWindows();
      await Promise.all(wins.map(async (w)=> { try{ await w.webContents.executeJavaScript(`localStorage.setItem('license.ok','1'); true;`, true); }catch{} }));
      return { ok:true };
    } catch(err){ return { ok:false, error: err.message||String(err) }; }
  });
  ipcMain.handle("license:getStatus", async () => {
    try {
      const jwt = readLicenseToken(); const active = !!jwt;
      let mode, tier, tablesLimit, expiresAt, daysLeft, plan;
      if (jwt){
        const p = decodeJwtPayload(jwt)||{};
        mode = p.mode || p.type || (p.sub ? "sub" : undefined);
        tier = p.tier || p.plan || undefined;
        plan = p.plan || p.tier || undefined;
        const exp = Number(p.exp || p.expires || 0); if (exp>0) expiresAt = exp*1000;
        tablesLimit = Number(p.tablesLimit || p.max_tables || p.maxTables || p.tables || 0) || undefined;
        if (expiresAt) daysLeft = Math.max(0, Math.ceil((expiresAt - Date.now())/86400000));
      }
      try {
        const cur = JSON.parse(fs.readFileSync(LIC_JSON,"utf-8"));
        const meta = cur?.meta; if (meta){
          plan = meta.plan || plan; mode = meta.mode || mode;
          tablesLimit = Number(meta.tablesLimit || tablesLimit || 0) || tablesLimit;
          expiresAt = meta.expiresAt || expiresAt;
          if (expiresAt) daysLeft = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now())/86400000));
        }
      } catch {}
      const wins = BrowserWindow.getAllWindows();
      await Promise.all(wins.map(async (w)=> { try{ await w.webContents.executeJavaScript(active ? "localStorage.setItem('license.ok','1'); true;" : "localStorage.removeItem('license.ok'); true;", true); }catch{} }));
      if (!active) return { ok:false, active:false, reason:"no_license" };
      if (mode==="sub" && expiresAt && Date.now() > new Date(expiresAt).getTime()){
        return { ok:false, active:false, reason:"expired", mode, tier, plan, tablesLimit, expiresAt, daysLeft:0 };
      }
      return { ok:true, active:true, mode, tier, plan, tablesLimit, expiresAt, daysLeft, jwt };
    } catch(err){ return { ok:false, error: err.message||String(err) }; }
  });
  ipcMain.handle("license:clearOrder", async () => {
    try {
      const wins = BrowserWindow.getAllWindows();
      await Promise.all(wins.map(w => w.webContents.executeJavaScript(
        `localStorage.removeItem('license.order'); localStorage.removeItem('licenseOrder'); localStorage.removeItem('LS_LICENSE_ORDER_JSON'); sessionStorage.removeItem('license.order'); true;`, true
      )));
      return { ok:true };
    } catch(err){ return { ok:false, error: err.message||String(err) }; }
  });
  ipcMain.handle("license:getApiBase", async () => ({ ok:true, base:HARD_BASE }));
  ipcMain.handle("license:setApiBase", async () => ({ ok:true, base:HARD_BASE }));
  ipcMain.handle("license:activated", async () => {
    try {
      const wins = BrowserWindow.getAllWindows();
      await Promise.all(wins.map(async (w)=> {
        try { await w.webContents.executeJavaScript("try { localStorage.setItem('license.ok','1'); } catch(e) {} ; location.reload(); true;", true); } catch {}
      }));
      return { ok:true };
    } catch(err){ return { ok:false, error: err.message||String(err) }; }
  });
  ipcMain.handle("license:deactivate", async () => {
    try {
      try { fs.unlinkSync(LIC_JSON); } catch {}
      try { fs.unlinkSync(LIC_JWT); } catch {}
      const wins = BrowserWindow.getAllWindows();
      await Promise.all(wins.map(async (w)=> {
        try {
          await w.webContents.session.clearStorageData({ storages: ["localstorage","indexeddb","websql","serviceworkers","cachestorage"] });
          await w.webContents.executeJavaScript("localStorage.removeItem('license.ok'); true;", true);
        } catch {}
      }));
      return { ok:true };
    } catch(err){ return { ok:false, error: err.message||String(err) }; }
  });

  // ---------- PRINT API ----------
  // RAW:9100 скан
  ipcMain.handle("printer:scan", async (_evt, opts) => {
    try {
      const list = await discoverPrinters9100({ timeout: 1500, ...(opts || {}) });
      return list; // масив
    } catch (e) {
      console.warn("[printer:scan] error:", e?.message || e);
      return [];
    }
  });
  // RAW:9100 тест
  ipcMain.handle("printer:test", async (_evt, { ip }) => {
    if (!ip) return { ok:false, error:"NO_IP" };
    try {
      // ESC @ (ініт), текст, feed, повний різ (GS V 66 0)
      const payload = Buffer.concat([
        Buffer.from([0x1B,0x40]),
        Buffer.from("DUNA — TEST RAW9100\n--------------------\n", "ascii"),
        Buffer.from("If you see this, RAW9100 works.\n\n", "ascii"),
        Buffer.from([0x1B,0x64,0x03]),
        Buffer.from([0x1D,0x56,0x42,0x00])
      ]);
      await sendRaw9100({ ip, data: payload });
      return { ok:true };
    } catch (e) {
      return { ok:false, error: e?.message || String(e) };
    }
  });
  // RAW:9100 друк
  ipcMain.handle("printer:print", async (_evt, { ip, data }) => {
    if (!ip) return { ok:false, error:"NO_IP" };
    try { await sendRaw9100({ ip, data: data || "" }); return { ok:true }; }
    catch (e) { return { ok:false, error: e?.message || String(e) }; }
  });

  // Системні принтери
  ipcMain.handle("printers:listSystem", async () => {
    try {
      const win = mainWindow || BrowserWindow.getAllWindows()[0];
      if (!win) return [];
      const list = await win.webContents.getPrintersAsync();
      return Array.isArray(list) ? list : [];
    } catch (e) {
      console.warn("[printers:listSystem] error:", e?.message || e);
      return [];
    }
  });
  // Системний тест (тихий HTML)
  ipcMain.handle("printers:testSystem", async (_evt, { deviceName }) => {
    if (!deviceName) return { ok:false, error:"NO_DEVICENAME" };
    try {
      const html = `
        <meta charset="utf-8" />
        <style>body{font:14px/1.35 -apple-system,Segoe UI,Roboto,Arial;padding:16px} h1{font-size:18px;margin:0 0 8px}</style>
        <h1>DUNA — тест друку (System)</h1>
        <div>${new Date().toLocaleString()}</div>
        <hr/><div>Якщо бачиш цей лист на папері — системний друк працює.</div>`;
      await printHtmlSilent({ html, deviceName, landscape:false });
      return { ok:true };
    } catch (e) { return { ok:false, error: e?.message || String(e) }; }
  });
  // Системний HTML друк довільного контенту
  ipcMain.handle("printers:printHtml", async (_evt, { deviceName, html, landscape }) => {
    if (!deviceName) return { ok:false, error:"NO_DEVICENAME" };
    try { await printHtmlSilent({ html: html||"<meta charset='utf-8'><pre>EMPTY</pre>", deviceName, landscape:!!landscape }); return { ok:true }; }
    catch (e) { return { ok:false, error: e?.message || String(e) }; }
  });

  // ESC/POS модуль (якщо є)
  try { if (registerEscposPrinting) registerEscposPrinting(ipcMain); }
  catch (e) { console.warn("[print] ESC/POS register failed:", e?.message || e); }

  console.log("[main] IPC v35 ready");
}

/* ---------- window ---------- */
function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, show: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  try {
    const prev = (win.webContents.session.getPreloads ? win.webContents.session.getPreloads() : []);
    win.webContents.session.setPreloads([ ...prev, path.join(__dirname, "preload_receipt.cjs") ]);
  } catch {}

  win.once("ready-to-show", () => win.show());
  if (isDev) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, "../dist/index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) { shell.openExternal(url); return { action: "deny" }; }
    return { action: "allow" };
  });

  try { registerReceiptPrinting(win); } catch (e) { console.warn("[print] registerReceiptPrinting failed:", e?.message || e); }
  return win;
}

/* ---------- bootstrap ---------- */
app.whenReady().then(() => {
  registerIpc();
  mainWindow = createMainWindow();
  const syncLocal = async () => {
    const has = !!readLicenseToken();
    const js = has ? "try{localStorage.setItem('license.ok','1');}catch(e){}; true;" : "try{localStorage.removeItem('license.ok');}catch(e){}; true;";
    try { await mainWindow.webContents.executeJavaScript(js, true); } catch {}
  };
  mainWindow.webContents.on("dom-ready", syncLocal);
  mainWindow.webContents.on("did-finish-load", syncLocal);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) { mainWindow = createMainWindow(); } });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
