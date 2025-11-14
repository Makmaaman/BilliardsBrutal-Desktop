const { BrowserWindow, ipcMain } = require('electron');

function mm(n){ return Math.round(Number(n) * 1000); }

function buildReceiptHTML(htmlBody, cssExtra = ""){
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: 80mm auto; margin: 0; }
        html, body { margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", Ubuntu, "Droid Sans", "Helvetica Neue", Arial; font-size: 12px; line-height: 1.25; }
        .row { display:flex; justify-content:space-between; }
        .center { text-align:center; }
        .bold { font-weight:600; }
        .mt8 { margin-top: 8px; }
        .mt12 { margin-top: 12px; }
        ${cssExtra || ""}
      </style>
    </head>
    <body>${htmlBody}</body>
  </html>`;
}

async function printHTML({ html, deviceName, silent = true, widthMM = 80, heightMM = 200 }){
  return new Promise(async (resolve) => {
    const win = new BrowserWindow({
      width: 400,
      height: 600,
      show: false,
      webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
    });
    win.on('closed', () => resolve({ ok:false, error: 'window-closed' }));
    const dataURL = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    await win.loadURL(dataURL);

    const options = {
      silent: Boolean(silent && deviceName),
      deviceName: deviceName || undefined,
      printBackground: true,
      margins: { marginType: 'none' },
      pageSize: { width: mm(widthMM), height: mm(heightMM) },
    };

    win.webContents.print(options, (success, failureReason) => {
      try { win.close(); } catch {}
      if (success) return resolve({ ok: true });
      if (options.silent && deviceName) {
        try { win.show(); win.focus(); } catch {}
        win.webContents.print({ ...options, silent: false, deviceName: undefined }, (ok2, fail2) => {
          resolve(ok2 ? { ok:true, interactive:true } : { ok:false, error: fail2 || failureReason || 'print-failed' });
        });
      } else {
        resolve({ ok:false, error: failureReason || 'print-failed' });
      }
    });
  });
}

function registerReceiptPrinting(mainWindow){
  ipcMain.handle('receipt:listPrinters', async () => {
    try {
      const printers = await mainWindow.webContents.getPrintersAsync();
      return { ok:true, printers };
    } catch (e){
      return { ok:false, error: String(e && e.message || e) };
    }
  });

  ipcMain.handle('receipt:print', async (_evt, payload = {}) => {
    try {
      const { htmlBody, cssExtra, deviceName, widthMM = 80, heightMM = 200 } = payload;
      if (!htmlBody) return { ok:false, error: 'htmlBody required' };
      const html = buildReceiptHTML(htmlBody, cssExtra);
      return await printHTML({ html, deviceName, widthMM, heightMM, silent:true });
    } catch (e){
      return { ok:false, error: String(e && e.message || e) };
    }
  });
}

module.exports = { registerReceiptPrinting };
