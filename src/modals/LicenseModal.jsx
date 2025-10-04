
import React, { useEffect, useState } from "react";
import ModalShell from "../components/ModalShell";
export default function LicenseModal({ onClose }){
  const L = (globalThis.__billiard_license || (typeof window!=='undefined' ? window.license : undefined));
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  async function refresh(){ const s = await L?.getStatus?.(); setStatus(s || { ok:false }); }
  useEffect(()=>{ refresh(); /* eslint-disable-next-line */ }, []);
  async function doActivate(){ setBusy(true); try{ await L?.activate?.(key); await refresh(); setKey(""); alert("Ліцензію активовано."); }catch(e){ alert(e?.message||"Помилка"); }finally{ setBusy(false);} }
  async function doDeactivate(){ setBusy(true); try{ await L?.deactivate?.(); await refresh(); }catch(e){ alert(e?.message||"Помилка"); }finally{ setBusy(false);} }
  async function doTrial(){ setBusy(true); try{ await L?.startTrial?.(); await refresh(); }catch(e){ alert(e?.message||"Помилка"); }finally{ setBusy(false);} }
  return (
    <ModalShell title="Ліцензія" onClose={onClose} footer={<div className="flex justify-end gap-2">
      <button className="h-9 px-4 rounded-lg bg-slate-800 text-white" onClick={onClose}>Готово</button>
    </div>}>
      <section className="grid gap-4">
        <div className="grid md:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white"><div className="text-sm font-semibold mb-1">Lite</div><div className="text-xs text-slate-500 mb-2">до 5 столів</div><div className="text-lg font-semibold">₴600/міс</div></div>
          <div className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white"><div className="text-sm font-semibold mb-1">Pro</div><div className="text-xs text-slate-500 mb-2">до 10 столів</div><div className="text-lg font-semibold">₴900/міс</div></div>
          <div className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white"><div className="text-sm font-semibold mb-1">Повна оплата</div><div className="text-xs text-slate-500">5 столів: ₴20 000 + ₴250/міс</div><div className="text-xs text-slate-500">10 столів: ₴30 000 + ₴250/міс</div></div>
        </div>
        <div className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
          <div className="text-sm font-semibold mb-2">Статус</div>
          <div className="text-sm">
            {status?.ok ? (<>
              <div>Режим: <b>{status.mode}</b></div>
              {status.mode==='trial' && <div>Trial: лишилось <b>{status.trialDaysLeft}</b> днів</div>}
              {status.mode==='sub' && <div>Підписка, днів лишилось: <b>{status.daysLeft}</b></div>}
              <div>Ліміт столів: <b>{status.tablesLimit}</b></div>
              <div>Device ID: <code className="text-xs">{status.deviceId}</code></div>
            </>) : <div className="text-rose-600">Ліцензія не активна</div>}
          </div>
          <div className="mt-3 grid md:grid-cols-3 gap-2 items-center">
            <input className="h-10 px-3 rounded-xl border border-slate-300 md:col-span-2"
                   placeholder="Ключ активації..."
                   value={key} onChange={e=>setKey(e.target.value)} />
            <button disabled={busy} className="h-10 px-4 rounded-xl bg-slate-900 text-white" onClick={doActivate}>Активувати</button>
          </div>
          <div className="mt-2 flex gap-2">
            <button disabled={busy} className="h-9 px-3 rounded-xl border border-slate-300" onClick={doTrial}>Почати Trial</button>
            <button disabled={busy} className="h-9 px-3 rounded-xl border border-slate-300" onClick={doDeactivate}>Деактивувати</button>
            <button disabled={busy} className="h-9 px-3 rounded-xl border border-slate-300" onClick={refresh}>Оновити статус</button>
          </div>
        </div>
      </section>
    </ModalShell>
  );}
