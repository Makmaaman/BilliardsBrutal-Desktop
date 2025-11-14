
# Duna Integrated Pack (Settings + Map + Controllers + Printing)

## Файли
- `electron/main.cjs` — IPC (`bb:httpGet`, `bb:printRaw`) + надійне завантаження `dist/index.html` і діагностика «білого екрану`»
- `electron/preload.cjs` — експозиція `window.bb.{httpGet, printRaw, printTest}`
- `src/services/controllerStatus.js` — авто‑пінг контролерів і спільний статус
- `src/components/modals/Settings/ControllersTab.jsx` — онлайн/офлайн, Ping, мапінг столів → IP
- `src/components/modals/Settings/MapTab.jsx` + `src/components/map/FacilityMapEditor.jsx` — карта закладу
- `src/components/TopBar.jsx` — чіп online/total + тест друку
- `src/modals/SettingsModal.jsx` — вже підключає «Контролери», «Карта», «Столи», «Принтер»

## Інсталяція
1) Скопіюй файли поверх свого проєкту з відповідним шляхом.
2) Встанови залежність:
   ```bash
   npm i zustand
   ```
3) Збери фронтенд:
   ```bash
   npm run build
   ```
4) Перезапусти Electron‑додаток.

> Якщо ти використовуєш інший файл для модалки (наприклад, Drawer), повтори ті самі імпорти/виклики в ньому.
