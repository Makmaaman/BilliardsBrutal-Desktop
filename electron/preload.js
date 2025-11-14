
// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('receipt', {
  listPrinters: async () => ipcRenderer.invoke('receipt:listPrinters'),
  print: async (opts) => ipcRenderer.invoke('receipt:print', opts),
});
