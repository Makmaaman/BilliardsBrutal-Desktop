// electron/license.cjs — Hotfix v28
// Hardcode server base, robust HTTP via electron.net, keep IPC stable.
/* eslint-disable no-console */
const { app, BrowserWindow, ipcMain, shell, net } = require("electron");
const os = require("os");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

let paymentWindow = null;

// ---- Hardcoded API base ----
const HARD_BASE = "https://billiardsbrutal-desktop-1.onrender.com";

// ---- License persistence ----
const LIC_JSON = path.join(app.getPath("userData"), "license.json");
const LIC_JWT  = path.join(app.getPath("userData"), "license.jwt");

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

function computeMachineId() {
  try {
    const nets = os.networkInterfaces();
    const macs = Object.values(nets).flat().filter(Boolean).map(n => n.mac).filter(m => m && m !== "00:00:00:00:00:00").sort().join("|");
    const seed = [os.hostname(), os.arch(), os.platform(), macs, process.execPath, app.getPath("userData")].join("#");
    return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32);
  } catch (e) {
    return crypto.createHash("sha256").update(os.hostname() + (process.env.USER || "unknown")).digest("hex").slice(0, 32);
  }
}

// ---- HTTP via electron.net ----
function httpJson(method, url, body) {
  return new Promise((resolve, reject) => {
    try {
      const request = net.request({ method, url });
      request.setHeader("Content-Type", "application/json");
      const timer = setTimeout(() => { try { request.abort(); } catch {} ; reject(new Error("NETWORK_TIMEOUT")); }, 20000);
      request.on("response", (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          clearTimeout(timer);
          const text = Buffer.concat(chunks).toString("utf-8");
          let json = null; try { json = JSON.parse(text || "{}"); } catch {}
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const msg = (json && (json.error || json.message)) || text || String(res.statusCode);
            reject(new Error(msg));
          } else resolve(json || {});
        });
      });
      request.on("error", (err) => { clearTimeout(timer); reject(err); });
      request.end(body ? JSON.stringify(body) : undefined);
    } catch (e) { reject(e); }
  });
}
const postJson = (url, body) => httpJson("POST", url, body);
const getJson  = (url) => httpJson("GET", url, null);

// --- Normalize order fields coming from server ---
function normalizeOrder(resp) {
  const src = (resp && (resp.order || resp)) || {};
  const id = src.id || src.orderId || src.dbId || null;
  const invoiceId = src.invoiceId || src.invoice || src.invoice_id || null;
  const link = src.link || src.pageUrl || src.paymentLink || src.payment_url || src.url || null;
  return { id, invoiceId, link, ...src };
}

// ---- API operations (always use HARD_BASE) ----
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

async function openPayment({ orderId, plan = "pro-1y", machineId, forceNew = true }) {
  const mid = machineId || computeMachineId();
  let order;
  try {
    if (forceNew) {
      order = await createOrder({ plan, machineId: mid, forceNew: true });
    } else if (orderId) {
      try { order = await refreshOrder(orderId); }
      catch { order = await createOrder({ plan, machineId: mid, forceNew: true }); }
    } else {
      order = await createOrder({ plan, machineId: mid, forceNew: true });
    }
  } catch (err) {
    console.error("[license] create/refresh error:", err);
    throw err;
  }

  if (!order || !order.link) throw new Error("Server responded without a payment link (link/pageUrl/paymentLink).");

  // push into renderer storage
  try {
    const wins = BrowserWindow.getAllWindows();
    const serialized = JSON.stringify(order);
    await Promise.all(wins.map(w => w.webContents.executeJavaScript(
      `localStorage.setItem('license.order', ${JSON.stringify(serialized)});
       localStorage.setItem('LS_LICENSE_ORDER_JSON', ${JSON.stringify(serialized)});
       true;`, true
    )));
  } catch {}

  const payUrl = `${order.link}${order.link.includes("?") ? "&" : "?"}t=${Date.now()}`;

  if (paymentWindow && !paymentWindow.isDestroyed()) {
    try { await paymentWindow.webContents.session.clearCache(); } catch {}
    try { paymentWindow.close(); } catch {}
    paymentWindow = null;
  }

  paymentWindow = new BrowserWindow({
    width: 560, height: 820, title: "Оплата ліцензії — Duna Billiard Club",
    autoHideMenuBar: true, resizable: true, show: true, modal: false,
    webPreferences: { sandbox: true, contextIsolation: true },
  });

  const sess = paymentWindow.webContents.session;
  try { await sess.clearCache(); } catch {}
  sess.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    headers["Cache-Control"] = "no-cache"; headers["Pragma"] = "no-cache";
    callback({ requestHeaders: headers });
  });

  paymentWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  paymentWindow.on("closed", () => { paymentWindow = null; });

  try { await paymentWindow.loadURL(payUrl); }
  catch (e) { console.error("[license] Failed to load URL:", payUrl, e); throw e; }

  return { order };
}

// -------------------- IPC --------------------
let _registered = false;
function registerIpc() {
  if (_registered) return; _registered = true;

  ipcMain.handle("license:ping", async () => {
    try { const res = await pingApi(); return { ok: true, res }; }
    catch (err) { return { ok: false, error: err.message || String(err) }; }
  });

  ipcMain.handle("license:openPayment", async (_evt, payload) => {
    try { const result = await openPayment(payload || {}); return { ok: true, ...result }; }
    catch (err) { return { ok: false, error: err.message || String(err) }; }
  });
  ipcMain.handle("license:refreshOrder", async (_evt, { orderId }) => {
    try { const order = await refreshOrder(orderId); return { ok: true, order }; }
    catch (err) { return { ok: false, error: err.message || String(err) }; }
  });
  ipcMain.handle("license:activate", async (_evt, { machineId, orderId }) => {
    try { const result = await activateLicense({ machineId, orderId }); return { ok: true, ...result }; }
    catch (err) { return { ok: false, error: err.message || String(err) }; }
  });
  ipcMain.handle("license:applyJwt", async (_evt, { jwt } = {}) => {
    try {
      if (!jwt || typeof jwt !== "string" || jwt.length < 40) throw new Error("Invalid license token");
      writeLicenseToken(jwt);
      const wins = BrowserWindow.getAllWindows();
      await Promise.all(wins.map(async (w) => {
        try { await w.webContents.executeJavaScript(`localStorage.setItem('license.ok','1'); true;`, true); } catch {}
      }));
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message || String(err) }; }
  });
  ipcMain.handle("license:getStatus", async () => {
    try {
      const jwt = readLicenseToken();
      const active = !!jwt;
      const wins = BrowserWindow.getAllWindows();
      await Promise.all(wins.map(async (w) => {
        try {
          await w.webContents.executeJavaScript(
            active
              ? "localStorage.setItem('license.ok','1'); true;"
              : "localStorage.removeItem('license.ok'); true;",
            true
          );
        } catch {}
      }));
      return { ok: true, active, jwt: jwt || null };
    } catch (err) { return { ok: false, error: err.message || String(err) }; }
  });
  ipcMain.handle("license:clearOrder", async () => {
    try {
      const wins = BrowserWindow.getAllWindows();
      await Promise.all(wins.map(w => w.webContents.executeJavaScript(
        `localStorage.removeItem('license.order'); localStorage.removeItem('licenseOrder'); localStorage.removeItem('LS_LICENSE_ORDER_JSON'); sessionStorage.removeItem('license.order'); true;`, true
      )));
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message || String(err) }; }
  });

  // get/setApiBase stay for backward compatibility but always return HARD_BASE
  ipcMain.handle("license:getApiBase", async () => ({ ok: true, base: HARD_BASE }));
  ipcMain.handle("license:setApiBase", async () => ({ ok: true, base: HARD_BASE }));

  ipcMain.handle("license:activated", async () => {
    try {
      const wins = BrowserWindow.getAllWindows();
      await Promise.all(wins.map(async (w) => {
        try {
          await w.webContents.executeJavaScript("try { localStorage.setItem('license.ok','1'); } catch(e) {} ; location.reload(); true;", true);
        } catch {}
      }));
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message || String(err) }; }
  });
  ipcMain.handle("license:deactivate", async () => {
    try {
      try { fs.unlinkSync(LIC_JSON); } catch {}
      try { fs.unlinkSync(LIC_JWT); } catch {}
      const wins = BrowserWindow.getAllWindows();
      await Promise.all(wins.map(async (w) => {
        try {
          await w.webContents.session.clearStorageData({
            storages: ["localstorage","indexeddb","websql","serviceworkers","cachestorage"],
          });
          await w.webContents.executeJavaScript("localStorage.removeItem('license.ok'); true;", true);
        } catch {}
      }));
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message || String(err) }; }
  });

  // Legacy sync listeners (no-op safe)
  ipcMain.on("app:getVersionSync", (event) => { try { event.returnValue = app.getVersion(); } catch { event.returnValue = "dev"; } });
  ipcMain.handle("app:getVersion", async () => { try { return app.getVersion(); } catch { return "dev"; } });
  ipcMain.on("machine:getIdSync", (event) => { try { event.returnValue = computeMachineId(); } catch { event.returnValue = ""; } });
  ipcMain.handle("machine:getId", async () => { try { return computeMachineId(); } catch { return ""; } });

  console.log("[license] IPC registered v28 (hard base:", HARD_BASE, ")");
}
registerIpc();

module.exports = { computeMachineId, readLicenseToken };
