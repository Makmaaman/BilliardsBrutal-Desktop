// src/modals/LicenseCenter.jsx
import React, { useEffect, useMemo, useState } from "react";
import ModalShell from "../components/ModalShell";

// Той самий бекенд що й на екрані активації
const API_BASE = (import.meta.env.VITE_LICENSE_SERVER_BASE || "https://billiardsbrutal-desktop-1.onrender.com/").replace(/\/+$/,'/') + "";

function Field({ label, children }){
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      {children}
    </div>
  );
}

function PlanCard({ title, subtitle, price, onClick, tone="emerald" }){
  const toneMap = {
    emerald: "ring-emerald-200 bg-emerald-50/50",
    sky:     "ring-sky-200 bg-sky-50/50",
    amber:   "ring-amber-200 bg-amber-50/50",
  };
  return (
    <div className={`p-4 rounded-2xl ring-1 ${toneMap[tone]} flex flex-col`}>
      <div className="text-base font-semibold">{title}</div>
      {subtitle && <div className="text-sm text-slate-600">{subtitle}</div>}
      <div className="text-xl font-bold mt-2">{price}</div>
      <button className="mt-3 h-10 px-4 rounded-lg bg-slate-900 text-white hover:brightness-110" onClick={onClick}>Оформити</button>
    </div>
  );
}

export default function LicenseCenter({ onClose }){
  const [version, setVersion] = useState("-");
  const [machineId, setMachineId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Стан замовлення (кеш як у ActivationScreen)
  const [order, setOrder] = useState(() => {
    try {
      const cached = localStorage.getItem("LS_LICENSE_ORDER_JSON");
      return cached ? JSON.parse(cached) : null; // { id, invoiceId, pageUrl }
    } catch { return null; }
  });

  useEffect(()=>{
    try { setVersion(window.versions?.app?.() || "dev"); } catch { setVersion("dev"); }
    (async()=>{
      const mid = await window.machine?.id?.();
      setMachineId(mid || "");
    })();
  }, []);

  useEffect(()=>{
    try{
      if (order) localStorage.setItem("LS_LICENSE_ORDER_JSON", JSON.stringify(order));
      else localStorage.removeItem("LS_LICENSE_ORDER_JSON");
    }catch{}
  }, [order]);

  async function createOrder(tier){
    setMsg(""); setBusy(true);
    try{
      if(!machineId) throw new Error("Не вдалося визначити MACHINE ID.");
      const res = await fetch(API_BASE + "api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineId, tier }),
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Помилка створення замовлення (${res.status})`);
      const ord = { id: data.id, invoiceId: data.invoiceId, pageUrl: data.pageUrl };
      setOrder(ord);
      if (ord.pageUrl && /^https?:\/\//i.test(ord.pageUrl)) {
        window.open(ord.pageUrl, "_blank", "noopener,noreferrer");
      }
    }catch(e){
      setMsg("Помилка: " + (e.message || String(e)));
    }finally{
      setBusy(false);
    }
  }

  async function checkPaid(){
    if (!order?.id) return;
    setMsg(""); setBusy(true);
    try{
      const res = await fetch(API_BASE + `api/orders/${order.id}/check`, { method:"POST" });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(`FAILED ${res.status}`);

      if (data.ok && data.license) {
        const saved = await window.license?.applyJwt?.(data.license);
        if (!saved?.ok) throw new Error("Не вдалося застосувати ліцензію (applyJwt).");
        setMsg("Ліцензію застосовано ✅");
        // оновити статус у шапці
        await window.license?.getStatus?.().catch(()=>null);
      } else {
        setMsg(`Статус: ${data.status || "очікування"}. Якщо оплатили — натисніть «Я оплатив — перевірити» через кілька секунд.`);
      }
    }catch(e){
      setMsg("Помилка: " + (e.message || String(e)));
    }finally{
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Ліцензія" onClose={onClose} footer={<div className="flex justify-between w-full">
      <div className="text-xs text-slate-500">Версія: {version}</div>
      <div className="flex gap-2">
        {order && <button disabled={busy} className="h-9 px-3 rounded-lg border" onClick={checkPaid}>Я оплатив — перевірити</button>}
        <button className="h-9 px-4 rounded-lg bg-slate-800 text-white" onClick={onClose}>Готово</button>
      </div>
    </div>}>
      <section className="grid md:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
          <div className="text-sm font-semibold mb-2">Вибір плану</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <PlanCard title="Pro"  subtitle="до 10 столів" price="₴900/міс" tone="sky"    onClick={()=>createOrder("pro")} />
            <PlanCard title="Lite" subtitle="до 5 столів"  price="₴600/міс" tone="sky"    onClick={()=>createOrder("lite")} />
            <PlanCard title="Повна • 5 столів"  subtitle="₴20 000 + ₴250/міс" price="Разово" tone="emerald" onClick={()=>createOrder("full5")} />
            <PlanCard title="Повна • 10 столів" subtitle="₴30 000 + ₴250/міс" price="Разово" tone="emerald" onClick={()=>createOrder("full10")} />
          </div>
        </div>

        <div className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
          <div className="text-sm font-semibold mb-2">Дані пристрою</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Machine ID">
              <input className="h-10 px-3 rounded-lg border border-slate-300 bg-slate-50 w-full" readOnly value={machineId || "—"} />
            </Field>
            <Field label="Поточний статус">
              <StatusBlock/>
            </Field>
          </div>

          {!!order && (
            <div className="mt-3 p-3 rounded-xl bg-amber-50 ring-1 ring-amber-200">
              <div className="text-sm font-medium">Створено замовлення</div>
              <div className="text-xs text-slate-600">Invoice ID: {order.invoiceId}</div>
              <div className="text-xs text-slate-600 break-all">Посилання: <a className="underline" href={order.pageUrl} target="_blank" rel="noreferrer">{order.pageUrl}</a></div>
              <div className="mt-2 text-xs text-slate-600">Після оплати натисніть «Я оплатив — перевірити».</div>
            </div>
          )}

          {!!msg && <div className="mt-3 text-sm text-rose-600">{msg}</div>}
        </div>
      </section>
    </ModalShell>
  );
}

function StatusBlock(){
  const [s, setS] = useState(null);
  useEffect(()=>{ (async()=>{ const x = await window.license?.getStatus?.(); setS(x || { ok:false }); })(); }, []);
  if(!s) return <div className="text-slate-500 text-sm">—</div>;
  return (
    <div className="text-sm">
      {s.ok ? (
        <>
          <div>Режим: <b>{s.mode}</b></div>
          {s.mode==='trial' && <div>Trial: лишилось <b>{s.trialDaysLeft}</b> днів</div>}
          {s.mode==='sub'   && <div>Днів лишилось: <b>{s.daysLeft}</b></div>}
          <div>Ліміт столів: <b>{s.tablesLimit}</b></div>
          <div>Device ID: <code className="text-xs">{s.deviceId}</code></div>
        </>
      ) : <div className="text-rose-600">Ліцензія не активна</div>}
    </div>
  );
}
