# Cleanup report (2025-10-21)

Цей автоматичний клін‑ап не змінює логіку або дизайн застосунку.
Переміщено файли до папки `__old__/` для безпечного зберігання.

## Переміщені точні дублікати (залишено один реально використовуваний варіант)
_Немає_

## Потенційно невикористані файли (не досяжні зі стартових точок, тільки в межах `src/`)
- src/api.js
- src/auth/FirstRunLicense.jsx
- src/auth/license.css
- src/components/AnimatedMenu.jsx
- src/components/AppLogo.jsx
- src/components/SideDrawer.jsx
- src/components/TableMoveMenu.jsx
- src/components/TopBarStatusChips.jsx
- src/components/TopMenu.jsx
- src/components/modals/Settings/ControllersTab.jsx
- src/components/modals/Settings/MapTab.jsx
- src/components/topbar.css
- src/drawers/SettingsDrawer.jsx
- src/drawers/ShiftDrawer.jsx
- src/drawers/StatsDrawer.jsx
- src/drawers/TariffsDrawer.jsx
- src/hooks/useControllersOnline.js
- src/hooks/useLicenseReminders.js
- src/hooks/useLocalStorage.js
- src/hooks/useRtStore.js
- src/hooks/useShift.js
- src/index.css
- src/lib/connectivity.js
- src/lib/licenseClient.js
- src/lib/logger.js
- src/modals/LicenseModal.jsx
- src/modals/reservations/TimelineGrid.jsx
- src/services/controllerStatus.js
- src/services/license.js
- src/state/licenseStore.js
- src/state/rtStore.js
- src/state/shiftStore.js
- src/styles/reservations.css
- src/ui/AnimatedChip.jsx
- src/ui/BilliardsHero.jsx
- src/ui/MotionButton.jsx
- src/utils/espClient.js
- src/utils/licenseLocal.js
- src/utils/net.js
- src/views/LicenseActivation.jsx

> Примітка: усі файли фізично збережені у `__old__/{stamp}/`, можна повернути будь‑який у разі потреби.

## Відновлені файли (гарячий патч)
- src/index.css
- src/styles/reservations.css

## Відновлені файли (generic import fix)
- src/services/license.js
