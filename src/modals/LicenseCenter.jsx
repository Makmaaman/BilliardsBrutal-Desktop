// src/modals/LicenseCenter.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import ModalShell from "../components/ModalShell";

// Той самий бекенд що й на екрані активації
const API_BASE = (import.meta.env.VITE_LICENSE_SERVER_BASE || "https://billiardsbrutal-desktop-1.onrender.com/").replace(/\/+$/,'/') + "";

function Field({ label, children }){
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-slate-600">{label}</div>
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
  const [activated, setActivated] = useState(false);
  const pollRef = useRef(null);

  function stopPolling(){
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

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

  /* Поки є неоплачене замовлення — самі перевіряємо оплату кожні 5 с.
     Раніше користувач мусив вручну тиснути «Я оплатив», і при помилці
     ліцензія так і не застосовувалась. */
  useEffect(()=>{
    stopPolling();
    if (!order?.id || activated || !machineId) return;
    pollRef.current = setInterval(() => { checkPaid({ silent: true }); }, 5000);
    return stopPolling;
  }, [order?.id, activated, machineId]);

  useEffect(() => stopPolling, []);

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

  // Зберегти отриману ліцензію локально й оновити статус
  async function applyLicense(license, meta){
    const saved = await window.license?.applyJwt?.(license, meta);
    if (!saved?.ok) throw new Error("Не вдалося застосувати ліцензію (applyJwt).");
    await window.license?.getStatus?.().catch(()=>null);
    setActivated(true);
    stopPolling();
  }

  /**
   * Перевірка оплати. Сервер має маршрут /refresh; /check лишається як
   * запасний варіант (старіші збірки сервера).
   */
  async function fetchOrderStatus(orderId){
    for (const path of [`api/orders/${orderId}/refresh`, `api/orders/${orderId}/check`]) {
      const res = await fetch(API_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineId }),
      });
      if (res.status === 404) {
        // або маршруту немає, або замовлення не знайдено — пробуємо наступний
        const body = await res.json().catch(()=>null);
        if (body?.error === "ORDER_NOT_FOUND") return { notFound: true };
        continue;
      }
      const data = await res.json().catch(()=>({}));
      if (!res.ok && !data?.status) throw new Error(`FAILED ${res.status}`);
      return data;
    }
    return { notFound: true };
  }

  async function checkPaid({ silent = false } = {}){
    if (!order?.id) return false;
    if (!silent) { setMsg(""); setBusy(true); }
    try{
      const data = await fetchOrderStatus(order.id);

      if (data?.ok && data.license) {
        await applyLicense(data.license, { plan: data.tier || order.tier });
        setMsg("Ліцензію застосовано ✅ Перезапускати програму не потрібно.");
        return true;
      }

      if (data?.notFound) {
        // замовлення загубилось на сервері — пробуємо відновити за Machine ID
        const restored = await restoreLicense({ silent: true });
        if (!restored && !silent) {
          setMsg("Замовлення не знайдено на сервері. Якщо оплата пройшла — натисніть «Відновити ліцензію».");
        }
        return restored;
      }

      if (!silent) {
        setMsg(`Статус: ${data?.status || "очікування оплати"}. Якщо щойно оплатили — перевірка триває автоматично.`);
      }
      return false;
    }catch(e){
      if (!silent) setMsg("Помилка: " + (e.message || String(e)));
      return false;
    }finally{
      if (!silent) setBusy(false);
    }
  }

  /** Відновлення ліцензії за Machine ID (оплата була, але замовлення втрачено) */
  async function restoreLicense({ silent = false } = {}){
    if (!machineId) return false;
    if (!silent) { setMsg(""); setBusy(true); }
    try{
      const res = await fetch(API_BASE + "api/license/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineId }),
      });
      const data = await res.json().catch(()=>({}));
      if (data?.ok && data.license) {
        await applyLicense(data.license, { plan: data.tier });
        setMsg("Ліцензію відновлено ✅");
        return true;
      }
      if (!silent) {
        setMsg(
          data?.error === "NO_PAID_ORDER"
            ? "Оплачених замовлень для цього Machine ID не знайдено."
            : "Не вдалося відновити: " + (data?.error || res.status)
        );
      }
      return false;
    }catch(e){
      if (!silent) setMsg("Помилка: " + (e.message || String(e)));
      return false;
    }finally{
      if (!silent) setBusy(false);
    }
  }

  return (
    <ModalShell title="Ліцензія" onClose={onClose} containerStyle={{ width: "900px", maxWidth: "92vw", height: "700px", maxHeight: "86vh" }} footer={<div className="flex justify-between w-full">
      <div className="text-xs text-emerald-200/80">Версія: {version}</div>
      <div className="flex gap-2">
        {order && <button disabled={busy} className="h-9 px-3 rounded-lg border border-emerald-500/40 text-emerald-100 hover:bg-emerald-800/40 disabled:opacity-50" onClick={()=>checkPaid()}>Я оплатив — перевірити</button>}
        <button disabled={busy || !machineId} className="h-9 px-3 rounded-lg border border-emerald-500/40 text-emerald-100 hover:bg-emerald-800/40 disabled:opacity-50" title="Якщо оплата вже пройшла на цьому ПК" onClick={()=>restoreLicense()}>Відновити ліцензію</button>
        <button className="h-9 px-4 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500" onClick={onClose}>Готово</button>
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
              <div className="mt-2 text-xs text-slate-600">
                {activated
                  ? "Ліцензію активовано."
                  : "Після оплати ліцензія застосується автоматично (перевірка кожні 5 с). Можна також натиснути «Я оплатив — перевірити»."}
              </div>
            </div>
          )}

          {!!msg && <div className="mt-3 text-sm text-rose-400 bg-rose-500/10 px-3 py-2 rounded-lg">{msg}</div>}
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
