export const MS_IN_MIN = 60 * 1000;
export const MIN_MS = 5 * MS_IN_MIN;

export function snapToStep(ms, stepMs) {
  return Math.round(ms / stepMs) * stepMs;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function loadStep() {
  const v = Number(localStorage.getItem("RSVN_STEP_MIN"));
  return [5, 10, 15, 30].includes(v) ? v : 15;
}

export function saveStep(v) {
  localStorage.setItem("RSVN_STEP_MIN", String(v));
}

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getMonthMatrix(date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const first = new Date(y, m, 1);
  const start = new Date(first);
  const day = (first.getDay() + 6) % 7;
  start.setDate(first.getDate() - day);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}
