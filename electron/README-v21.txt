// electron/license.cjs — fragment patch v21 (only the getStatus handler changed)
/* In your current electron/license.cjs, replace the 'license:getStatus' handler with this: */
ipcMain.handle("license:getStatus", async () => {
  try {
    const jwt = readLicenseToken();
    const active = !!jwt;
    // also sync a localStorage flag in all renderers
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
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});