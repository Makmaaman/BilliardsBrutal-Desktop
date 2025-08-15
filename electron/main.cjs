const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    show: false,
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, "../dist/index.html"));

  win.once("ready-to-show", () => win.show());
}

// --- Auto Update wiring ---
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function wireAutoUpdateIPC() {
  const send = (payload) => { try { win && win.webContents.send("updates:event", payload); } catch {} };

  autoUpdater.on("checking-for-update", () => send({ type: "checking" }));
  autoUpdater.on("update-available", (info) => send({ type: "available", info }));
  autoUpdater.on("update-not-available", (info) => send({ type: "not-available", info }));
  autoUpdater.on("download-progress", (p) => send({ type: "progress", p }));
  autoUpdater.on("update-downloaded", (info) => send({ type: "downloaded", info }));
  autoUpdater.on("error", (err) => send({ type: "error", message: err?.message || String(err) }));

  ipcMain.handle("updates:checkNow", async () => {
    try { await autoUpdater.checkForUpdates(); return { ok: true }; }
    catch (e) { return { ok: false, error: e?.message || String(e) }; }
  });
  ipcMain.handle("updates:quitAndInstall", () => { autoUpdater.quitAndInstall(false, true); });
}

// --- Bridges used elsewhere in the app (safe mocks if not needed) ---
ipcMain.handle("bb:httpGet", async (_e, url) => {
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, statusText: res.statusText, text };
  } catch (e) {
    return { ok: false, status: 0, statusText: "NETWORK_ERROR", text: "" };
  }
});
ipcMain.handle("bb:print", async (_e, payload) => {
  // TODO: integrate real printer if потрібно
  return { ok: true };
});

app.whenReady().then(() => {
  // Windows: корисно мати постійний AppUserModelID
  app.setAppUserModelId("club.duna.billiards");

  createWindow();
  wireAutoUpdateIPC();

  if (!app.isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({ responseHeaders: { ...details.responseHeaders, "Access-Control-Allow-Origin": ["*"], "Access-Control-Allow-Headers": ["*"] } });
    });
  }

  // Перевірка оновлень після старту (лише в упакованій версії це щось знайде)
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }, 3000);
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
