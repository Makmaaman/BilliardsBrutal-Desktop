
// main.js — ready-to-use (root) wired for printing + Vite dev
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { registerReceiptPrinting } = require('./electron/receiptPrinter');

let mainWindow;

function createWindow(){
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devURL = process.env.VITE_DEV_SERVER_URL;
  if (devURL) {
    mainWindow.loadURL(devURL);
  } else {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  registerReceiptPrinting(mainWindow);
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
