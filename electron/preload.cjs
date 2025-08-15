// electron/preload.js
const { contextBridge, ipcRenderer } = require("electron");

// Те, що вже використовує фронт:
contextBridge.exposeInMainWorld("bb", {
  httpGet: (url) => ipcRenderer.invoke("bb:httpGet", url),
  print:   (payload) => ipcRenderer.invoke("bb:print", payload), // якщо використовуєш
});

// Новий API для оновлень:
contextBridge.exposeInMainWorld("updates", {
  on: (fn) => {
    const listener = (_e, payload) => fn(payload);
    ipcRenderer.on("updates:event", listener);
    return () => ipcRenderer.removeListener("updates:event", listener);
  },
  checkNow: () => ipcRenderer.invoke("updates:checkNow"),
  quitAndInstall: () => ipcRenderer.invoke("updates:quitAndInstall")
});
