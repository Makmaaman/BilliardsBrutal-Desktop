// src/auth/ActivationScreen.jsx — Patch v33 (radio cards UI + new plans + robust errors)
import React, { useEffect, useState } from "react";

const PLANS = [
  { id: "full-5",  title: "Повна • 5 столів",   note: "20000₴ + 250₴/міс", limit: 5,  mode: "full" },
  { id: "full-10", title: "Повна • 10 столів",  note: "30000₴ + 250₴/міс", limit: 10, mode: "full" },
  { id: "lite-m",  title: "Lite до 5 столів",   note: "₴600/міс",          limit: 5,  mode: "sub"  },
  { id: "pro-m",   title: "Pro до 10 столів",   note: "₴900/міс",          limit: 10, mode: "sub"  },
];

export default function ActivationScreen({ onActivated }) {
  const [version, setVersion] = useState("dev");
  const [machineId, setMachineId] = useState("");
  const [plan, setPlan] = useState("full-5");
  const [order, setOrder] = useState(() => {
    try {
      const raw = localStorage.getItem("LS_LICENSE_ORDER_JSON") || localStorage.getItem("license.order");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    try { const v = window.versions?.app?.(); if (v) setVersion(v); } catch {}
    (async () => {
      try { const id = await window.machine?.id?.(); setMachineId(id || ""); } catch {}
    })();
  }, []);

  useEffect(() => {
    try {
      if (order) {
        localStorage.setItem("LS_LICENSE_ORDER_JSON", JSON.stringify(order));
        localStorage.setItem("license.order", JSON.stringify(order));
      } else {
        localStorage.removeItem("LS_LICENSE_ORDER_JSON");
        localStorage.removeItem("license.order");
      }
    } catch {}
  }, [order]);

  const clearOrder = async () => { setMsg(""); setBusy(true); try { await window.license?.clearOrder?.(); setOrder(null); } finally { setBusy(false); } };

  const createOrder = async () => {
    setMsg(""); setBusy(true);
    try {
      if (!machineId) throw new Error("Не вдалося визначити MACHINE ID.");
      const res = await window.license?.openPayment?.({ plan, machineId, forceNew: true });
      if (!res?.ok) throw new Error(res?.error || "Не вдалося створити рахунок");
      const o = res.order || null;
      const pay = o?.link || o?.pageUrl || o?.paymentLink || o?.url;
      if (!pay) throw new Error("Сервер не повернув посилання на оплату");
      setOrder(o);
      window.open(`${pay}${pay.includes("?") ? "&" : "?"}t=${Date.now()}`, "_blank", "noopener,noreferrer");
    } catch (e) { setMsg("Помилка: " + (e.message || String(e))); } finally { setBusy(false); }
  };

  const verify = async () => {
    if (!order?.id) { setMsg("Немає рахунку для перевірки."); return; }
    setMsg(""); setBusy(true);
    try {
      const act = await window.license?.activate?.(machineId, order.id);
      if (!act?.ok) {
        if ((act?.error || "").includes("ORDER_NOT_FOUND")) { await clearOrder(); setMsg("Рахунок не знайдено. Створіть новий."); return; }
        throw new Error(act?.error || "ACTIVATE_FAILED");
      }
      if (act.license) {
        const planMeta = PLANS.find(p => p.id === plan) || { limit: 10, mode: "full" };
        const meta = {
          plan, mode: planMeta.mode, tablesLimit: planMeta.limit,
          expiresAt: act.expiresAt || act.validUntil || act.subscriptionUntil
        };
        const saved = await window.license?.applyJwt?.(act.license, meta);
        if (!saved?.ok) throw new Error(saved?.error || "Не вдалося застосувати ліцензію (applyJwt).");
        setMsg("Ліцензію застосовано ✅ Відкриваю головний екран...");
        try { await window.license?.activated?.(); } catch {}
        setTimeout(() => { try { window.location.reload(); } catch {} }, 300);
        try { await onActivated?.(); } catch {}
      } else { setMsg(`Статус: ${act.status || "очікування..."}`); }
    } catch (e) { setMsg("Помилка: " + (e.message || String(e))); } finally { setBusy(false); }
  };

  const invoiceLabel = order?.invoiceId || order?.id || "—";

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-b from-emerald-50 to-slate-50 p-3 select-text">
      <div className="w-full max-w-4xl">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 grid place-items-center font-bold">DB</div>
              <div>
                <div className="text-sm font-semibold">Активація ліцензії</div>
                <div className="text-xs opacity-90">Duna Billiard Club</div>
              </div>
            </div>
            <div className="text-xs">Версія: v{version}</div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div className="text-sm text-slate-700 mb-2">
              Оберіть тариф і створіть рахунок на оплату. Монобанк підтримується.
            </div>

            {/* Plan cards */}
            <div className="grid md:grid-cols-2 gap-3">
              {PLANS.map(p => (
                <label key={p.id} className={`cursor-pointer rounded-xl ring-1 ${plan===p.id ? "ring-emerald-400 bg-emerald-50" : "ring-slate-200 bg-white"} p-4 flex items-center justify-between hover:ring-emerald-300`}>
                  <div>
                    <div className="text-sm font-semibold">{p.title}</div>
                    <div className="text-xs text-slate-600 mt-0.5">{p.note}</div>
                  </div>
                  <input type="radio" className="w-4 h-4" name="plan" checked={plan===p.id} onChange={()=>setPlan(p.id)} />
                </label>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-4 mt-2">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">MACHINE ID</div>
                <input className="w-full h-11 px-3 rounded-lg ring-1 ring-slate-200 text-sm" value={machineId} readOnly />
              </div>
              <div className="hidden md:block" />
            </div>

            <div className="rounded-xl ring-1 ring-emerald-200 bg-emerald-50 p-3">
              <div className="text-sm font-semibold text-emerald-800 mb-1">{order ? "Рахунок створено" : "Рахунок ще не створено"}</div>
              <div className="text-xs text-emerald-800/90 mb-2">Invoice ID: <span className="font-mono">{invoiceLabel}</span></div>

              <div className="flex flex-wrap gap-2">
                {!order ? (
                  <button className="h-10 px-4 rounded-lg bg-emerald-600 text-white hover:brightness-110 disabled:opacity-60 whitespace-nowrap" disabled={busy || !machineId} onClick={createOrder}>
                    Створити рахунок та оплатити
                  </button>
                ) : (
                  <>
                    <a className="h-10 px-4 rounded-lg bg-sky-600 text-white grid place-items-center hover:brightness-110 whitespace-nowrap"
                       href={`${order.link || order.pageUrl || order.paymentLink || order.url}${(order.link || order.pageUrl || order.paymentLink || order.url)?.includes("?") ? "&" : "?"}t=${Date.now()}`}
                       target="_blank" rel="noreferrer">
                      Відкрити оплату
                    </a>
                    <button className="h-10 px-4 rounded-lg bg-emerald-600 text-white hover:brightness-110 disabled:opacity-60 whitespace-nowrap" disabled={busy} onClick={verify}>
                      Я оплатив — перевірити
                    </button>
                    <button className="h-10 px-4 rounded-lg bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 whitespace-nowrap" disabled={busy} onClick={createOrder} title="Створити абсолютно новий рахунок">
                      Створити новий рахунок
                    </button>
                    <button className="h-10 px-4 rounded-lg bg-white text-slate-500 hover:text-slate-700 underline whitespace-nowrap" disabled={busy} onClick={clearOrder} title="Очистити збережений рахунок з пристрою">
                      Очистити рахунок
                    </button>
                  </>
                )}
              </div>
            </div>

            {msg && <div className="text-sm mt-1 text-slate-700">{msg}</div>}
          </div>

          <div className="px-6 py-3 border-t border-slate-200 text-[12px] text-slate-500">
            Підтримка: <a className="underline" href="https://t.me/duna_billiard_support" target="_blank" rel="noreferrer">@duna_billiard_support</a>
          </div>
        </div>
      </div>
    </div>
  );
}
