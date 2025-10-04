import './services/license.js'

const { app, BrowserWindow } = require('electron');
const path = require('path');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    // DEV: Vite dev-server
    win.loadURL('http://localhost:5173/');
  } else {
    // PROD: грузимо index.html із dist поруч з app
    const appRoot = path.join(process.resourcesPath, 'app'); // де лежить app.asar content
    const distDir = path.join(appRoot, 'dist');
    const indexFile = path.join(distDir, 'index.html');
    win.loadFile(indexFile);
  }

  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
