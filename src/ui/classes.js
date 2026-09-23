// src/ui/classes.js
export const modalPanel  = "bg-white rounded-2xl shadow-xl ring-1 ring-black/5 p-5 md:p-6";
export const modalHeader = "flex items-start justify-between gap-4 pb-3 md:pb-4";
export const modalTitle  = "text-lg md:text-xl font-semibold";
export const modalClose  = "shrink-0 rounded-full p-2 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700";
export const modalBody   = "mt-2 md:mt-3 space-y-4";

// Темна тема для модалок (ModalShell)
export const input    = "w-full rounded-xl border border-slate-600 bg-slate-900/60 text-emerald-50 px-3 py-2 text-[15px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500";
export const select   = input;
export const textarea = input + " resize-y min-h-[90px]";

export const btnPrimary = "rounded-xl bg-emerald-600 text-white px-4 py-2 hover:bg-emerald-500 active:scale-[.99]";
export const btnGhost   = "rounded-xl bg-slate-700 text-emerald-100 px-4 py-2 hover:bg-slate-600";
export const danger     = "bg-rose-600 hover:bg-rose-500 text-white rounded-xl px-3 py-2";

export const tableWrap = "rounded-xl ring-1 ring-emerald-500/30 overflow-hidden bg-slate-800/40";
export const table     = "min-w-full text-[15px]";
export const th        = "bg-slate-800/60 text-left font-medium text-emerald-200 px-4 py-2";
export const td        = "px-4 py-2 border-t border-emerald-500/20 text-emerald-50";
