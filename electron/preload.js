const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("versions", {
  app: (() => { try { return ipcRenderer.sendSync("app:getVersionSync"); } catch { return "0.0.0"; } })(),
  get: () => ipcRenderer.invoke("app:getVersion"),
});

contextBridge.exposeInMainWorld("updates", {
  on: (cb) => {
    const l = (_e, payload) => cb && cb(payload);
    ipcRenderer.on("license:event", l);
    return () => ipcRenderer.removeListener("license:event", l);
  },

  getMachineId: () => ipcRenderer.invoke("license:getMachineId"),
  getStatus:    () => ipcRenderer.invoke("license:getStatus"),
  activate:     (b64) => ipcRenderer.invoke("license:activate", b64),
  deactivate:   () => ipcRenderer.invoke("license:deactivate"),
});

contextBridge.exposeInMainWorld("license", {
  getMachineId: () => ipcRenderer.invoke("license:getMachineId"),
  getStatus:    () => ipcRenderer.invoke("license:getStatus"),
  activate:     (b64) => ipcRenderer.invoke("license:activate", b64),
  deactivate:   () => ipcRenderer.invoke("license:deactivate"),
});

contextBridge.exposeInMainWorld("bb", {
  httpGet: (url) => ipcRenderer.invoke("bb:httpGet", url),
  // print:  (payload) => ipcRenderer.invoke("bb:print", payload),
});
