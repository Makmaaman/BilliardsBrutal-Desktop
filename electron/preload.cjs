// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

// Версія
contextBridge.exposeInMainWorld('versions', {
  app: () => { try { return ipcRenderer.sendSync('app:getVersionSync'); } catch { return '0.0.0'; } },
  appAsync: () => ipcRenderer.invoke('app:getVersion'),
});

// MACHINE
contextBridge.exposeInMainWorld('machine', {
  id: () => ipcRenderer.invoke('machine:getId'),
});

// Ліцензія
contextBridge.exposeInMainWorld('license', {
  getStatus: () => ipcRenderer.invoke('license:getStatus'),
  applyJwt:  (jwt) => ipcRenderer.invoke('license:applyJwt', jwt),
  deactivate: () => ipcRenderer.invoke('license:deactivate'),
  reset: (opts) => ipcRenderer.invoke('license:reset', opts || {}),
});

// ОНОВЛЕННЯ — рівно той API, що використовує твій фронт
contextBridge.exposeInMainWorld('updates', {
  on: (cb) => {
    const l = (_e, payload) => cb && cb(payload);
    ipcRenderer.on('updates:event', l);
    return () => ipcRenderer.removeListener('updates:event', l);
  },
  checkNow: () => ipcRenderer.invoke('updates:checkNow'),
  quitAndInstall: () => ipcRenderer.invoke('updates:quitAndInstall'),
});

// API сумісності
contextBridge.exposeInMainWorld('api', {
  appVersion: () => ipcRenderer.invoke('app:getVersion'),
  license: { getStatus: () => ipcRenderer.invoke('license:getStatus') },
  machineId: () => ipcRenderer.invoke('machine:getId'),
});
