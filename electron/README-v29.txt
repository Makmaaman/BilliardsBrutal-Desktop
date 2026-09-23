How to enable 'license:openPayment' (v29)
=========================================

1) Add ONE line near the top of your electron/main.cjs (before creating BrowserWindow):

   require("./license-open.cjs");

This registers ONLY the missing IPC handlers used by the Activation screen:
 - 'license:openPayment'
 - 'license:refreshOrder'
 - 'license:activate'
 - 'license:ping'

They use a hardcoded API base: https://billiardsbrutal-desktop-1.onrender.com
and electron.net for HTTP, so they won't depend on fetch/env.

2) You do NOT need to replace your main.cjs logic — this file avoids touching
   other channels like 'license:getStatus', 'license:applyJwt', etc., to prevent collisions.

3) Restart the app and click "Створити рахунок та оплатити".
