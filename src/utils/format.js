export const CURRENCY = "₴";

export const fmtDur = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600).toString().padStart(2, "0");
  const mm = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

export const money = (x) => `${CURRENCY}${(Math.round(x * 100) / 100).toFixed(2)}`;
