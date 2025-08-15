// electron/main.js
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

/** --------------------------
 *   Автооновлення (GitHub)
 *  -------------------------- */
autoUpdater.autoDownload = true;           // качає одразу
autoUpdater.autoInstallOnAppQuit = true;   // встановлює при виході

function wireAutoUpdateIPC() {
  autoUpdater.on("checking-for-update", () =>
    win.webContents.send("updates:event", { type: "checking" })
  );
  autoUpdater.on("update-available", (info) =>
    win.webContents.send("updates:event", { type: "available", info })
  );
  autoUpdater.on("update-not-available", (info) =>
    win.webContents.send("updates:event", { type: "not-available", info })
  );
  autoUpdater.on("download-progress", (p) =>
    win.webContents.send("updates:event", { type: "progress", p })
  );
  autoUpdater.on("update-downloaded", (info) =>
    win.webContents.send("updates:event", { type: "downloaded", info })
  );
  autoUpdater.on("error", (err) =>
    win.webContents.send("updates:event", { type: "error", message: err?.message || String(err) })
  );

  // ручна перевірка з Renderer
  ipcMain.handle("updates:checkNow", async () => {
    try { await autoUpdater.checkForUpdates(); return { ok: true }; }
    catch (e) { return { ok: false, error: e?.message || String(e) }; }
  });

  // встановити зараз (після 'update-downloaded')
  ipcMain.handle("updates:quitAndInstall", () => {
    autoUpdater.quitAndInstall(false, true);
  });
}

/** --------------------------
 *   Твої існуючі IPC-містки
 *  -------------------------- */
ipcMain.handle("bb:httpGet", async (_e, url) => {
  const res = await fetch(url, { method: "GET", cache: "no-store" }).catch(() => null);
  if (!res) return { ok: false, status: 0, statusText: "NETWORK_ERROR", text: "" };
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, statusText: res.statusText, text };
});

// Під далі, якщо маєш друк:
// ipcMain.handle("bb:print", async (_e, { host, data }) => {
//   return { ok: true };
// });

/** --------------------------
 *   Старт застосунку
 *  -------------------------- */
app.whenReady().then(() => {
  createWindow();
  wireAutoUpdateIPC();

  // (опційно) CORS у дев-режимі
  if (!app.isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({ responseHeaders: {
        ...details.responseHeaders,
        "Access-Control-Allow-Origin": ["*"],
        "Access-Control-Allow-Headers": ["*"],
      }});
    });
  }

  // автоперевірка через 3с
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 3000);
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
