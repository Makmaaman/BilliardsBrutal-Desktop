const { contextBridge, ipcRenderer } = require("electron");

// Містки для існуючих функцій
contextBridge.exposeInMainWorld("bb", {
  httpGet: (url) => ipcRenderer.invoke("bb:httpGet", url),
  print:   (payload) => ipcRenderer.invoke("bb:print", payload),
});

// Події оновлень та виклики
contextBridge.exposeInMainWorld("updates", {
  on: (fn) => {
    const listener = (_e, payload) => fn(payload);
    ipcRenderer.on("updates:event", listener);
    return () => ipcRenderer.removeListener("updates:event", listener);
  },
  checkNow: () => ipcRenderer.invoke("updates:checkNow"),
  quitAndInstall: () => ipcRenderer.invoke("updates:quitAndInstall")
});
