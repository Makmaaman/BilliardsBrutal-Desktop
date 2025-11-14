// electron/windowOpen.cjs
'use strict';

const { shell } = require('electron');

// Allow all monobank subdomains and any https by fallback
const ALLOW = [
  /^https?:\/\/([a-z0-9-]+\.)*monobank\.ua\/?/i,
];

function isAllowedExternal(url) {
  return ALLOW.some(rx => rx.test(url)) || /^https?:\/\//i.test(url);
}

function wireExternalOpen(win) {
  if (!win || !win.webContents) return;

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (isAllowedExternal(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

module.exports = { wireExternalOpen };
