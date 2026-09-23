// Простий тестовий файл для перевірки Electron

console.log('[TEST] Starting main-simple.cjs...');
console.log('[TEST] process.versions.electron:', process.versions.electron);

const { app, BrowserWindow } = require('electron');

console.log('[TEST] Success! app:', typeof app, 'BrowserWindow:', typeof BrowserWindow);

app.whenReady().then(() => {
  console.log('[TEST] App is ready!');
  const win = new BrowserWindow({ width: 800, height: 600 });
  win.loadURL('https://google.com');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
