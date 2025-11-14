// Tiny logger (logic only). Toggle via localStorage.DUNA_LOG="1"
const on = () => typeof localStorage !== "undefined" && localStorage.getItem("DUNA_LOG") === "1";
export const log = (...a) => { if (on()) console.log("[DUNA]", ...a); };
export const warn = (...a) => { if (on()) console.warn("[DUNA]", ...a); };
export const err = (...a) => { if (on()) console.error("[DUNA]", ...a); };
