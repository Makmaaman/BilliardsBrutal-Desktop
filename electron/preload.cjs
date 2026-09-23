// electron/preload.cjs — v36
const { contextBridge, ipcRenderer } = require("electron");

// iconv-lite може бути недоступна в деяких збірках — грейсфульний fallback
let iconv = null;
try { iconv = require("iconv-lite"); } catch (e) { console.warn("[preload] iconv-lite unavailable:", e.message); }

const invoke = (ch, payload) => ipcRenderer.invoke(ch, payload);

// версії / машина / ліцензія
contextBridge.exposeInMainWorld("versions", {
  app: () => ipcRenderer.sendSync("app:getVersionSync") || "dev"
});
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
  // текст перекодовує головний процес (у preload iconv-lite недоступний)
  printText: (opts) => invoke("printer:printText", opts || {}),      // => {ok,bytes}
  printCodepageTest: (ip) => invoke("printer:printCodepageTest", { ip }), // => {ok}

  // Системні (Windows/OS)
  listSystem: () => invoke("printers:listSystem"),                   // => [{name,displayName,isDefault,isNetwork,options...}]
  testSystem: (deviceName) => invoke("printers:testSystem", { deviceName }),
  printHtml: (deviceName, html, landscape=false) => invoke("printers:printHtml", { deviceName, html, landscape }),
});

// AUTO-UPDATER API
const updateListeners = new Set();
ipcRenderer.on("updates:event", (_evt, data) => {
  updateListeners.forEach(fn => { try { fn(data); } catch {} });
});

contextBridge.exposeInMainWorld("updates", {
  // Підписка на події оновлення
  on: (callback) => {
    if (typeof callback === "function") {
      updateListeners.add(callback);
      return () => updateListeners.delete(callback);
    }
    return () => {};
  },
  // Перевірити оновлення вручну
  checkNow: () => invoke("updates:check"),
  // Завантажити оновлення
  download: () => invoke("updates:download"),
  // Встановити і перезапустити
  quitAndInstall: () => invoke("updates:install"),
});

// ICONV для перекодування тексту (CP866, CP1251, UTF-8 тощо)
contextBridge.exposeInMainWorld("iconv", {
  encode: (text, encoding) => {
    if (!iconv) return null;
    try {
      return iconv.encode(text, encoding);
    } catch (e) {
      console.warn("iconv.encode error:", e);
      return null;
    }
  },
  decode: (buffer, encoding) => {
    if (!iconv) return null;
    try {
      return iconv.decode(buffer, encoding);
    } catch (e) {
      console.warn("iconv.decode error:", e);
      return null;
    }
  },
});
