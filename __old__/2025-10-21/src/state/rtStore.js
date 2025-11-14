import { updateOnlineMeta, summarizeControllersStrict, hitRelay } from "../services/esp";
const state = { controllers: [], tables: [], relayStatus: { total:0, online:0, anyOnline:false }, timer: null };
const subs = new Set();
function notify(){ subs.forEach(fn => { try{ fn(state); }catch{} }); }
export const rtStore = {
  getState: () => state,
  subscribe(fn){ subs.add(fn); return () => subs.delete(fn); },
  setControllers(list){ state.controllers = Array.isArray(list)?list:[]; state.relayStatus = summarizeControllersStrict(state.controllers); notify(); },
  setTables(list){ state.tables = Array.isArray(list)?list:[]; notify(); },
  async refreshOnce(){ const up = await Promise.all((state.controllers||[]).map(c => updateOnlineMeta(c))); state.controllers = up; state.relayStatus = summarizeControllersStrict(state.controllers); notify(); },
  start(intervalMs=7000){ if(state.timer) clearInterval(state.timer); rtStore.refreshOnce(); state.timer = setInterval(rtStore.refreshOnce, intervalMs); },
  stop(){ if(state.timer) clearInterval(state.timer); state.timer = null; },
  async toggleForTable(tableId, onoff){ const t=(state.tables||[]).find(x=>String(x.id)===String(tableId)); if(!t) return {ok:false,error:"table not found"}; const c=(state.controllers||[]).find(x=>String(x.id)===String(t.controllerId)); if(!c) return {ok:false,error:"controller not found"}; return await hitRelay(c, Number(t.channel)||0, onoff); },
};
