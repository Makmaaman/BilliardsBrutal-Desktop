// src/state/shiftStore.js
// Глобальне сховище стану Зміни (єдиний source of truth).
// - зберігаємо в localStorage (переживає перезавантаження)
// - події оновлення для всіх компонентів (subscribe)
// - крос-вкладки: слухаємо 'storage' і синхронізуємо стан
const KEY = "shift_state_v1";

function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : null;
  }catch(e){ console.warn("shiftStore load fail", e); return null; }
}
function save(state){
  try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){ console.warn("shiftStore save fail", e); }
}

let state = load() || {
  open: false,
  openedAt: null,
  closedAt: null,
  user: null,
};

const listeners = new Set();
function notify(){
  listeners.forEach(fn => { try{ fn(state); }catch(e){} });
  // кастомна подія для зовнішніх слухачів, якщо треба
  window.dispatchEvent(new CustomEvent("shift:change", { detail: state }));
}

export function getShift(){ return state; }

export function subscribe(fn){
  listeners.add(fn);
  fn(state); // миттєве повідомлення
  return () => listeners.delete(fn);
}

export function setShift(patch){
  state = { ...state, ...patch };
  save(state);
  notify();
}

export function openShift({ user=null, at=new Date().toISOString() } = {}){
  setShift({ open: true, openedAt: at, closedAt: null, user });
}

export function closeShift({ at=new Date().toISOString() } = {}){
  setShift({ open: false, closedAt: at });
}

// sync між вкладками
window.addEventListener("storage", (e)=>{
  if (e.key !== KEY || !e.newValue) return;
  try{
    const next = JSON.parse(e.newValue);
    if (next && JSON.stringify(next) !== JSON.stringify(state)){
      state = next;
      notify();
    }
  }catch{}
});

// утиліти форматування
export function fmtDateTime(iso, locale="uk-UA"){
  if(!iso) return "—";
  try{ return new Date(iso).toLocaleString(locale); }catch{ return iso; }
}
export function getShiftStatusText(s=state){
  if (s.open) return `Зміна відкрита • ${fmtDateTime(s.openedAt)}`;
  return `Зміна закрита • ${fmtDateTime(s.closedAt)}`;
}
