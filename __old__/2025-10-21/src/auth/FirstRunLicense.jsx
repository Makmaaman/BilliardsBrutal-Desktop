// src/auth/FirstRunLicense.jsx (фрагмент — показує як підключити BilliardsHero + MotionButton)
// Замініть ваш FirstRunLicense або адаптуйте приклад
import React, { useEffect, useState } from "react";
import { createMonobankOrder, refreshOrder, getMachineId, saveCachedOrder, loadCachedOrder, clearCachedOrder, applyLicense } from "../services/license";
import BilliardsHero from "../ui/BilliardsHero";
import MotionButton from "../ui/MotionButton";

const PLANS = [
  { id:"full-5",  title:"Повна оплата • 5 столів",  once:20000, mo:250,  tier:"max",  seats:5,  billing:"full+monthly" },
  { id:"full-10", title:"Повна оплата • 10 столів", once:30000, mo:250,  tier:"max",  seats:10, billing:"full+monthly" },
  { id:"pro",     title:"Pro • до 10 столів",       mo:900, tier:"pro", seats:10, billing:"monthly" },
  { id:"lite",    title:"Lite • до 5 столів",       mo:600, tier:"lite", seats:5,  billing:"monthly" },
];

export default function FirstRunLicense({ onActivated, onClose }){
  const [machineId, setMachineId] = useState(""); useEffect(()=>{(async()=>setMachineId(await getMachineId()))();},[]);
  const [sel, setSel] = useState("pro");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const order = loadCachedOrder();

  async function createInvoice(){
    setBusy(true); setMsg("");
    try{
      const p = PLANS.find(x=>x.id===sel); if(!p) throw new Error("Оберіть план");
      const ord = await createMonobankOrder({ machineId, plan:{ id:p.id, tier:p.tier, seats:p.seats, billing:p.billing } });
      saveCachedOrder(ord); window.open(ord.pageUrl, "_blank", "noopener,noreferrer");
    }catch(e){ setMsg(e?.message||String(e)); } finally{ setBusy(false); }
  }
  async function checkPaid(){
    setBusy(true); setMsg("");
    try{
      const res = await refreshOrder(order.id);
      if(res?.ok && res.license){ const r=await applyLicense(res.license); if(!r?.ok) throw new Error("Не вдалося застосувати"); setMsg("Готово ✅"); await onActivated?.(); }
      else setMsg(`Статус: ${res?.status||"очікування"}`);
    }catch(e){ setMsg(e?.message||String(e)); } finally{ setBusy(false); }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-b from-emerald-50 to-slate-50">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 overflow-hidden">
        <BilliardsHero machineId={machineId} />

        <div className="p-4 space-y-4">
          {/* Плани */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {PLANS.map(p => (
              <button key={p.id} onClick={()=>setSel(p.id)}
                className={"text-left rounded-xl border p-3 transition " + (sel===p.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-slate-50")}>
                <div className="font-semibold">{p.title}</div>
                <div className="text-sm text-slate-600">
                  {p.once ? <>₴{p.once.toLocaleString("uk-UA")} + </> : null}
                  ₴{p.mo.toLocaleString("uk-UA")}/міс
                </div>
              </button>
            ))}
          </div>

          {/* Дії */}
          {!order ? (
            <MotionButton tone="primary" disabled={!machineId || busy} onClick={createInvoice}>
              Оплатити через Monobank
            </MotionButton>
          ) : (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
              <div className="text-sm">Invoice: <b>{order.invoiceId}</b></div>
              <div className="mt-2 flex flex-wrap gap-2">
                <MotionButton tone="sky" onClick={()=>window.open(order.pageUrl, "_blank", "noopener,noreferrer")}>Відкрити оплату</MotionButton>
                <MotionButton tone="primary" onClick={checkPaid}>Я оплатив — перевірити</MotionButton>
                <MotionButton tone="ghost" onClick={()=>{ localStorage.removeItem("LS_LICENSE_ORDER_JSON"); location.reload(); }}>Скасувати рахунок</MotionButton>
              </div>
            </div>
          )}

          {!!msg && <div className="text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2">{msg}</div>}
          <div className="flex justify-end"><button className="text-sm text-slate-600" onClick={onClose}>Продовжити тест</button></div>
        </div>
      </div>
    </div>
  );
}
