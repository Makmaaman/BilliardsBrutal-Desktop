// src/state/licenseStore.js
const KEY = "license_state_v1";
const MID = "machine_id_v1";

function load(){ try{ const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; }catch{ return null; } }
function save(s){ try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch{} }

export function getMachineId(){
  let id = localStorage.getItem(MID);
  if (!id){
    if (window.crypto?.getRandomValues){
      id = [...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');
    } else {
      id = String(Math.random()).slice(2) + Date.now().toString(16);
    }
    localStorage.setItem(MID, id);
  }
  return id;
}

let state = load() || {
  ok: false,
  kind: "trial",       // trial | lite | pro | full5 | full10
  tier: "trial",
  tablesLimit: 5,
  expiresAt: null,
  pendingInvoice: null, // { id, url, amount, plan, createdAt }
};

const listeners = new Set();
function notify(){ listeners.forEach(fn=>{ try{ fn(state); }catch{} }); }
export function subscribe(fn){ listeners.add(fn); fn(state); return ()=>listeners.delete(fn); }
export function getLicense(){ return state; }
function setLicense(p){ state = { ...state, ...p }; save(state); notify(); }

export function startTrial(days=14){
  const exp = new Date(Date.now()+days*864e5).toISOString();
  setLicense({ ok:true, kind:"trial", tier:"trial", tablesLimit:5, expiresAt: exp });
}

export function activateCode(code){
  // TODO: підключи свій бекенд. Поки — pro на 30 днів.
  const exp = new Date(Date.now()+30*864e5).toISOString();
  setLicense({ ok:true, kind:"pro", tier:"pro", tablesLimit:10, expiresAt: exp, activationCode: code });
}

export function selectPlan(plan){ // 'full5' | 'full10' | 'pro' | 'lite'
  setLicense({ selectedPlan: plan });
}

export async function createInvoiceForPlan(plan){
  // Завжди створюємо НОВИЙ інвойс (стара проблема була через перевикористання)
  const orderId = plan + "_" + Date.now();
  const amount = plan === "full10" ? 3000000 : plan === "full5" ? 2000000 : plan === "pro" ? 90000 : 60000; // копійки
  const payload = { machineId: getMachineId(), plan, orderId, amount };

  // Якщо лишився старий монобанк-слухач — він перехопить цю подію і підставить URL
  window.dispatchEvent(new CustomEvent("license:create-invoice", { detail: payload }));

  // Fallback, якщо інтеграція не повернула URL
  const url = "#";
  const id  = orderId;

  const pinv = { id, url, amount, plan, createdAt: new Date().toISOString() };
  setLicense({ pendingInvoice: pinv });
  return pinv;
}

export function markPaid(plan){
  const exp = new Date(Date.now()+365*864e5).toISOString();
  if (plan === "lite")      setLicense({ ok:true, kind:"lite", tier:"lite", tablesLimit:5,  expiresAt: exp, pendingInvoice:null });
  else if (plan === "pro")  setLicense({ ok:true, kind:"pro",  tier:"pro",  tablesLimit:10, expiresAt: exp, pendingInvoice:null });
  else if (plan === "full5")  setLicense({ ok:true, kind:"full", tier:"full", tablesLimit:5,  expiresAt: exp, pendingInvoice:null });
  else if (plan === "full10") setLicense({ ok:true, kind:"full", tier:"full", tablesLimit:10, expiresAt: exp, pendingInvoice:null });
}

export function daysLeft(){
  if (!state.expiresAt) return null;
  const ms = new Date(state.expiresAt).getTime() - Date.now();
  return Math.ceil(ms/864e5);
}
