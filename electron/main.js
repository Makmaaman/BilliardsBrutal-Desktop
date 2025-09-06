// electron/main.js
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // ВАЖЛИВО: правильний шлях до Vite-збірки
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

/* ---------- IPC: версія, ліцензія (заглушка), ESP-проксі ---------- */
ipcMain.on('app:getVersionSync', (e) => (e.returnValue = app.getVersion()));
ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('license:getStatus', async () => ({
  ok: true, tier: 'dev', features: ['all'], expiresAt: null,
}));

// Проксі GET для ESP (через Node fetch, без CORS)
ipcMain.handle('esp:get', async (_e, url, { timeout = 5000 } = {}) => {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
    const text = await res.text().catch(() => '');
    clearTimeout(t);
    return { ok: res.ok, status: res.status, statusText: res.statusText, text };
  } catch (e) {
    return { ok: false, status: 0, statusText: String(e?.message || e), text: '' };
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
