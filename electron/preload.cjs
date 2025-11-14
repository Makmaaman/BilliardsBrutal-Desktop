// electron/preload.cjs — v35
const { contextBridge, ipcRenderer } = require("electron");
const invoke = (ch, payload) => ipcRenderer.invoke(ch, payload);

// версії / машина / ліцензія (як у тебе)
contextBridge.exposeInMainWorld("versions", { app: () => "dev" });
contextBridge.exposeInMainWorld("machine", { id: () => invoke("machine:getId") });

contextBridge.exposeInMainWorld("license", {
  getStatus: () => invoke("license:getStatus"),
  openPayment: (payload) => invoke("license:openPayment", payload || {}),
  refreshOrder: (orderId) => invoke("license:refreshOrder", { orderId }),
  activate: (machineId, orderId) => invoke("license:activate", { machineId, orderId }),
  clearOrder: () => invoke("license:clearOrder"),
  applyJwt: (jwt, meta) => invoke("license:applyJwt", { jwt, meta }),
  getApiBase: () => invoke("license:getApiBase"),
  setApiBase: (base) => invoke("license:setApiBase", { base }),
  activated: () => invoke("license:activated"),
  deactivate: () => invoke("license:deactivate"),
  ping: () => invoke("license:ping"),
});

// НОВЕ: принтери
contextBridge.exposeInMainWorld("printers", {
  // RAW:9100 (термопринтери)
  scan: (opts) => invoke("printer:scan", opts || {}),                // => [{ip,port,kind}]
  testRaw: (ip) => invoke("printer:test", { ip }),                   // => {ok}
  printRaw: (ip, data) => invoke("printer:print", { ip, data }),     // => {ok}

  // Системні (Windows/OS)
  listSystem: () => invoke("printers:listSystem"),                   // => [{name,displayName,isDefault,isNetwork,options...}]
  testSystem: (deviceName) => invoke("printers:testSystem", { deviceName }),
  printHtml: (deviceName, html, landscape=false) => invoke("printers:printHtml", { deviceName, html, landscape }),
});
