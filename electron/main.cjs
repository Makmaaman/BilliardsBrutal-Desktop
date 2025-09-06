// electron/main.cjs
const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

/* ===== ENV ===== */
const LICENSE_SERVER_BASE = (process.env.LICENSE_SERVER_BASE || '').replace(/\/+$/,'');
const PUBLIC_KEY_PEM_ENV  = (process.env.PUBLIC_KEY_PEM || '').replace(/\\n/g, '\n');

/* Якщо колись захочеш generic-хост замість GitHub — задай UPDATES_FEED_URL,
   і він перекриє GitHub. Інакше використовуємо GitHub Releases. */
const UPDATES_FEED_URL    = (process.env.UPDATES_FEED_URL || '').replace(/\/+$/,'');
const GH_OWNER            = process.env.GH_OWNER || 'Makmaaman';
const GH_REPO             = process.env.GH_REPO  || 'BilliardsBrutal-Desktop';

let win = null;

/* ===== Window ===== */
function getEntryPoint() {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) return { type: 'url', value: devUrl };
  return { type: 'file', value: path.join(__dirname, '..', 'dist', 'index.html') };
}
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const entry = getEntryPoint();
  if (entry.type === 'url') {
    win.loadURL(entry.value);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(entry.value);
  }

  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('did-fail-load', (_e, code, desc) => console.error('[did-fail-load]', code, desc));
}

/* ===== App version ===== */
ipcMain.on('app:getVersionSync', (e) => { try { e.returnValue = app.getVersion(); } catch { e.returnValue = '0.0.0'; } });
ipcMain.handle('app:getVersion', async () => app.getVersion());

/* ===== FS utils ===== */
function getUserDataPath() { return app.getPath('userData'); }
function fileInUserData(name) { return path.join(getUserDataPath(), name); }
function readJsonSafe(p){ try{ if(!fs.existsSync(p)) return null; return JSON.parse(fs.readFileSync(p,'utf8')); }catch{ return null; } }
function writeJsonSafe(p,obj){ try{ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p, JSON.stringify(obj,null,2),'utf8'); return true; }catch{ return false; } }
function removeSafe(p){ try{ if(fs.existsSync(p)) fs.rmSync(p,{recursive:true,force:true}); return true; }catch{ return false; } }

/* ===== Machine ID ===== */
function computeMachineId() {
  const parts = [];
  try { parts.push(os.hostname() || ''); } catch {}
  try { parts.push(`${os.platform()}/${os.arch()}`); } catch {}
  try {
    const ifaces = os.networkInterfaces() || {};
    const macs = [];
    for (const name of Object.keys(ifaces)) {
      for (const ni of ifaces[name] || []) {
        const mac = (ni && ni.mac ? String(ni.mac) : '').toLowerCase();
        if (mac && mac !== '00:00:00:00:00:00' && !mac.startsWith('00:00:00')) macs.push(mac);
      }
    }
    macs.sort();
    if (macs.length) parts.push(macs.join('|'));
  } catch {}
  const seed = parts.join('#') || `seed_${crypto.randomUUID()}`;
  return crypto.createHash('sha256').update(seed).digest('hex');
}
function machineIdPath() { return fileInUserData('machine.id'); }
function getOrCreateMachineId() {
  const p = machineIdPath();
  try { if (fs.existsSync(p)) { const v = fs.readFileSync(p,'utf8').trim(); if (v) return v; } } catch {}
  const mid = computeMachineId();
  try { fs.writeFileSync(p, mid, 'utf8'); } catch {}
  return mid;
}
ipcMain.handle('machine:getId', async () => { try { return getOrCreateMachineId(); } catch { return null; } });

/* ===== Public key (JWT) ===== */
const fetchFn = (global.fetch ? (...a)=>global.fetch(...a) : (...a)=>import('node-fetch').then(({default: f})=>f(...a)));
async function loadPublicKeyPEM() {
  if (PUBLIC_KEY_PEM_ENV) return PUBLIC_KEY_PEM_ENV.trim();
  const localPem = path.join(__dirname, 'public.pem');
  try { if (fs.existsSync(localPem)) return fs.readFileSync(localPem,'utf8').trim(); } catch {}
  if (LICENSE_SERVER_BASE) {
    try {
      const url = `${LICENSE_SERVER_BASE}/api/license/public-key`;
      const r = await fetchFn(url);
      const j = await r.json().catch(()=> ({}));
      if (j?.publicKey) return String(j.publicKey).trim();
    } catch {}
  }
  return '';
}

/* ===== JWT verify (Ed25519, без jose) ===== */
function b64uToBuf(b64u){ const pad=b64u.length%4? '='.repeat(4-(b64u.length%4)) : ''; return Buffer.from((b64u+pad).replace(/-/g,'+').replace(/_/g,'/'),'base64'); }
function parseJwt(jwt){
  const parts = String(jwt||'').split('.');
  if (parts.length!==3) throw new Error('Bad JWT');
  const [h,p,s] = parts;
  return { header: JSON.parse(b64uToBuf(h)), payload: JSON.parse(b64uToBuf(p)), signature: b64uToBuf(s), signingInput: Buffer.from(`${h}.${p}`) };
}
async function verifyJwtLicense(jwt, midExpected){
  const pem = await loadPublicKeyPEM(); if (!pem) return { ok:false, reason:'no_public_key' };
  let parsed; try { parsed = parseJwt(jwt); } catch(e){ return { ok:false, reason:'bad_jwt' }; }
  const { header, payload, signature, signingInput } = parsed;
  if ((header?.alg||'').toUpperCase()!=='EDDSA') return { ok:false, reason:'alg_not_eddsa' };
  if (payload?.iss!=='duna.billiard.license') return { ok:false, reason:'bad_iss' };
  if (payload?.aud!=='desktop-app')           return { ok:false, reason:'bad_aud' };
  if (typeof payload?.exp==='number' && Date.now()>payload.exp*1000) return { ok:false, reason:'expired' };
  if (midExpected && payload?.mid && payload.mid!==midExpected) return { ok:false, reason:'mid_mismatch' };
  let key; try { key = crypto.createPublicKey(pem); } catch { return { ok:false, reason:'bad_public_key' }; }
  let ok = false; try { ok = crypto.verify(null, signingInput, key, signature); } catch { return { ok:false, reason:'verify_error' }; }
  if (!ok) return { ok:false, reason:'signature_invalid' };
  return { ok:true, tier: payload?.tier || 'basic', expiresAt: (typeof payload?.exp==='number') ? new Date(payload.exp*1000).toISOString() : null };
}

/* ===== License storage & IPC ===== */
function licensePath(){ return fileInUserData('license.json'); }
function readLic(){ return readJsonSafe(licensePath()) || null; }
function writeLic(obj){ return writeJsonSafe(licensePath(), obj); }

ipcMain.handle('license:getStatus', async () => {
  if (process.env.LICENSE_FORCE==='1') return { ok:true, tier: process.env.LICENSE_TIER||'dev', expiresAt:null, forced:true };
  const lic = readLic(); const mid = getOrCreateMachineId();
  if (lic?.jwt) {
    const v = await verifyJwtLicense(lic.jwt, mid);
    return v.ok ? { ok:true, kind:'jwt', tier:v.tier, expiresAt:v.expiresAt } : { ok:false, reason:v.reason||'jwt_invalid' };
  }
  if (lic?.key && lic?.fingerprint) {
    const expected = crypto.createHash('sha256').update(`${mid}#${lic.key}`).digest('hex');
    if (expected !== lic.fingerprint) return { ok:false, reason:'fingerprint_mismatch' };
    return { ok:true, kind:'legacy', tier: lic.tier||'basic', expiresAt: lic.expiresAt||null };
  }
  return { ok:false, reason:'no_license' };
});
ipcMain.handle('license:applyJwt', async (_e, jwt) => {
  if (!jwt || typeof jwt!=='string') return { ok:false, error:'EMPTY_JWT' };
  const mid = getOrCreateMachineId(); const v = await verifyJwtLicense(jwt, mid);
  if (!v.ok) return { ok:false, error:`JWT_VERIFY_FAILED: ${v.reason||''}` };
  if (!writeLic({ jwt })) return { ok:false, error:'WRITE_FAILED' };
  return { ok:true, tier:v.tier, expiresAt:v.expiresAt };
});
ipcMain.handle('license:deactivate', async () => ({ ok: removeSafe(licensePath()) }));
ipcMain.handle('license:reset', async (_e, opts={}) => {
  const removed=[]; if (removeSafe(licensePath())) removed.push('license.json');
  const midFile = machineIdPath();
  if (opts.resetMachineId && removeSafe(midFile)) removed.push('machine.id');
  if (opts.clearLocalStorage){ try{ await session.defaultSession.clearStorageData({ storages:['localstorage'] }); removed.push('LocalStorage'); }catch{} }
  if (opts.clearIndexedDB){ try{ await session.defaultSession.clearStorageData({ storages:['indexeddb'] }); removed.push('IndexedDB'); }catch{} }
  return { ok:true, userData:getUserDataPath(), removed };
});

/* ===== Auto-Updater (electron-updater) ===== */
const { autoUpdater } = require('electron-updater');
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'Makmaaman',
  repo: 'BilliardsBrutal-Desktop',
  releaseType: 'release'
});

function sendUpdateEvent(payload){ try { win && win.webContents.send('updates:event', payload); } catch {} }

function initUpdater() {
  autoUpdater.logger = { info: console.log, warn: console.warn, error: console.error, debug: console.debug };

  if (UPDATES_FEED_URL) {
    // Generic feed (S3/статичний хост)
    try {
      autoUpdater.setFeedURL({ provider: 'generic', url: UPDATES_FEED_URL });
      console.log('[updates] generic feed =', UPDATES_FEED_URL);
    } catch (e) { console.error('[updates] setFeedURL generic error', e); }
  } else {
    // === GitHub Releases (твій випадок) ===
    try {
      autoUpdater.setFeedURL({ provider: 'github', owner: GH_OWNER, repo: GH_REPO, releaseType: 'release' });
      console.log('[updates] github feed =', `${GH_OWNER}/${GH_REPO}`);
    } catch (e) { console.error('[updates] setFeedURL github error', e); }
  }

  autoUpdater.on('checking-for-update', () => sendUpdateEvent({ type:'checking' }));
  autoUpdater.on('update-available', (info) => sendUpdateEvent({ type:'available', info }));
  autoUpdater.on('update-not-available', (info) => sendUpdateEvent({ type:'not-available', info }));
  autoUpdater.on('download-progress', (p) => sendUpdateEvent({ type:'progress', p }));
  autoUpdater.on('update-downloaded', (info) => sendUpdateEvent({ type:'downloaded', info }));
  autoUpdater.on('error', (e) => sendUpdateEvent({ type:'error', message: e?.message || String(e) }));
}

ipcMain.handle('updates:checkNow', async () => {
  try {
    autoUpdater.autoDownload = true;            // завантажуємо одразу
    const r = await autoUpdater.checkForUpdates();
    return { ok:true, info: r?.updateInfo || null };
  } catch (e) {
    return { ok:false, error: e?.stack || e?.message || String(e) };
  }
});
ipcMain.handle('updates:quitAndInstall', async () => {
  try { setImmediate(()=> autoUpdater.quitAndInstall(false, true)); return { ok:true }; }
  catch (e) { return { ok:false, error: e?.stack || e?.message || String(e) }; }
});

/* ===== Lifecycle ===== */
if (process.platform === 'win32') app.setAppUserModelId(app.getName());
app.whenReady().then(() => { createWindow(); initUpdater(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
