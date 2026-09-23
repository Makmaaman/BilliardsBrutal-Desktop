// Простий тест для перевірки, чи працює require('electron')
console.log('[TEST] Starting electron test...');
console.log('[TEST] process.versions.electron:', process.versions.electron);
console.log('[TEST] process.type:', process.type);

const electron = require('electron');
console.log('[TEST] electron type:', typeof electron);
console.log('[TEST] electron keys:', electron && typeof electron === 'object' ? Object.keys(electron).slice(0, 10) : 'N/A');

if (typeof electron === 'object' && electron.app) {
  console.log('[TEST] SUCCESS - electron.app exists');
  electron.app.quit();
} else {
  console.log('[TEST] FAIL - electron is not an object or app is missing');
  process.exit(1);
}
