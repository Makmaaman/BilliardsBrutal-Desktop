// electron/ipcHandlers.cjs
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, ipcMain, shell } = require('electron');

function getUserDataPath() {
  try {
    return app.getPath('userData');
  } catch {
    return path.join(os.homedir(), '.duna-billiard-club');
  }
}

function getLicensePath() {
  return path.join(getUserDataPath(), 'license.json');
}

function readJSONSafe(p) {
  try {
    const s = fs.readFileSync(p, 'utf8');
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function writeJSONSafe(p, obj) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function deleteFileSafe(p) {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

function computeMachineId() {
  const ifaces = os.networkInterfaces();
  const macs = [];
  for (const key of Object.keys(ifaces)) {
    for (const ni of ifaces[key] || []) {
      if (!ni.internal && ni.mac && ni.mac !== '00:00:00:00:00:00') {
        macs.push(ni.mac);
      }
    }
  }
  const seed = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.release(),
    macs.sort().join('|'),
  ].join('|');
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32);
}

function registerIPCHandlers() {
  if (!ipcMain._duna_machine_id) {
    ipcMain._duna_machine_id = true;
    ipcMain.handle('machine:id', () => computeMachineId());
    ipcMain.handle('machine:info', () => ({
      id: computeMachineId(),
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      userData: getUserDataPath(),
      appVersion: app.getVersion ? app.getVersion() : '0.0.0',
    }));
  }

  if (!ipcMain._duna_license) {
    ipcMain._duna_license = true;
    ipcMain.handle('license:get', () => {
      const p = getLicensePath();
      const data = readJSONSafe(p) || {};
      return data;
    });
    ipcMain.handle('license:apply', (_e, tokenOrObj) => {
      const p = getLicensePath();
      const data = (typeof tokenOrObj === 'string')
        ? { token: tokenOrObj, updatedAt: Date.now() }
        : Object.assign({}, tokenOrObj || {}, { updatedAt: Date.now() });
      const ok = writeJSONSafe(p, data);
      return ok ? { ok: true, data } : { ok: false, error: 'write_failed' };
    });
    ipcMain.handle('license:reset', () => {
      const p = getLicensePath();
      const ok = deleteFileSafe(p);
      return ok ? { ok: true } : { ok: false, error: 'delete_failed' };
    });
  }

  if (!ipcMain._duna_open_external) {
    ipcMain._duna_open_external = true;
    ipcMain.handle('open-external', async (_e, url) => {
      if (!url || typeof url !== 'string') return { ok: false, error: 'bad_url' };
      try {
        await shell.openExternal(url);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    });
  }
}

module.exports = { registerIPCHandlers };
