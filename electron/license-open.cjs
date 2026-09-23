// electron/license-open.cjs — Patch v29
// Registers ONLY the missing IPC handlers required by ActivationScreen:
//   - license:openPayment
//   - license:refreshOrder
//   - license:activate
//   - license:ping
// Uses hardcoded API base and electron.net. Does NOT touch getStatus/applyJwt/etc.
/* eslint-disable no-console */
const { app, BrowserWindow, ipcMain, shell, net } = require("electron");
const os = require("os");
const crypto = require("crypto");

const BASE = "https://billiardsbrutal-desktop-1.onrender.com";
let paymentWindow = null;

function computeMachineId() {
  try {
    const nets = os.networkInterfaces();
    const macs = Object.values(nets).flat().filter(Boolean).map(n => n.mac).filter(m => m && m !== "00:00:00:00:00:00").sort().join("|");
    const seed = [os.hostname(), os.arch(), os.platform(), macs, process.execPath].join("#");
    return require("crypto").createHash("sha256").update(seed).digest("hex").slice(0, 32);
  } catch {
    return "";
  }
}

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

function normalizeOrder(resp) {
  const src = (resp && (resp.order || resp)) || {};
  const id = src.id || src.orderId || src.dbId || null;
  const invoiceId = src.invoiceId || src.invoice || src.invoice_id || null;
  const link = src.link || src.pageUrl || src.paymentLink || src.payment_url || src.url || null;
  return { id, invoiceId, link, ...src };
}

async function createOrder({ plan, machineId, forceNew }) {
  const raw = await postJson(`${BASE}/api/orders`, { plan, machineId, forceNew: !!forceNew });
  return normalizeOrder(raw);
}
async function refreshOrder(orderId) {
  const raw = await postJson(`${BASE}/api/orders/${encodeURIComponent(orderId)}/refresh`, {});
  return normalizeOrder(raw);
}
async function activateLicense({ machineId, orderId }) {
  return postJson(`${BASE}/api/license/activate`, { machineId, orderId });
}
async function pingApi() {
  try { return await getJson(`${BASE}/api/ping`); } catch (e) { return { ok:false, error: e.message || String(e) }; }
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
    console.error("[license-open] create/refresh error:", err);
    throw err;
  }

  if (!order || !order.link) throw new Error("Server responded without a payment link (link/pageUrl/paymentLink).");

  // Also push order to renderer storage (best-effort)
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
  catch (e) { console.error("[license-open] Failed to load URL:", payUrl, e); throw e; }

  return { order };
}

// Register handlers (only these 4, to avoid collision with your existing ones)
let _done = false;
function registerOpenHandlers() {
  if (_done) return; _done = true;

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

  console.log("[license-open] Handlers registered (base:", BASE, ")");
}
registerOpenHandlers();
module.exports = { registerOpenHandlers };
