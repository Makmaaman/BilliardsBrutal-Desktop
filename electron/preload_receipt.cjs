const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.exposeInMainWorld('receipt', {
    listPrinters: async () => ipcRenderer.invoke('receipt:listPrinters'),
    print: async (opts) => ipcRenderer.invoke('receipt:print', opts),
  });

  // Додаємо міст для ESC/POS по IP:9100
  contextBridge.exposeInMainWorld('escpos', {
    test: async (opts) => ipcRenderer.invoke('escpos:test', opts),
    printRaw: async (opts) => ipcRenderer.invoke('escpos:printRaw', opts),
  });
} catch (e) {
  // якщо contextIsolation=false — міст не потрібен
}
