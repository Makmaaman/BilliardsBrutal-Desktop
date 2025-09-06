// src/utils/reservationUtils.js

/**
 * Простий генератор ID без залежностей
 */
export function makeId(prefix = "res") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Перевірка перетину відрізків часу [aStart, aEnd) та [bStart, bEnd)
 */
export function isOverlap(aStart, aEnd, bStart, bEnd) {
  const aS = new Date(aStart).getTime();
  const aE = new Date(aEnd).getTime();
  const bS = new Date(bStart).getTime();
  const bE = new Date(bEnd).getTime();
  if (!aS || !aE || !bS || !bE) return false;
  return aS < bE && bS < aE; // строгий перетин
}

/**
 * Людський формат дати/часу (локальний)
 */
export function fmtDT(dt) {
  const d = new Date(dt);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Валідація бронювання
 * - перевіряє, що кінець > початок
 * - перевіряє відсутність перетинів з іншими бронюваннями того ж столу
 */
export function validateReservation(newRes, existingList, { allowSelf = false } = {}) {
  const errors = [];
  const { startAt, endAt, tableId } = newRes || {};
  const s = new Date(startAt).getTime();
  const e = new Date(endAt).getTime();
  if (!s || !e || e <= s) {
    errors.push("Невірний інтервал часу (кінець має бути пізніше за початок)");
  }
  if (!tableId && tableId !== 0) {
    errors.push("Не обрано стіл");
  }
  if (!errors.length) {
    for (const r of existingList || []) {
      if (!allowSelf && r.id === newRes.id) continue; // редагування: пропускаємо себе
      if (r.tableId === tableId && r.status !== "cancelled") {
        if (isOverlap(startAt, endAt, r.startAt, r.endAt)) {
          errors.push(`Перетин із бронюванням №${r.code || r.id} для стола #${tableId + 1}`);
          break;
        }
      }
    }
  }
  return errors;
}
