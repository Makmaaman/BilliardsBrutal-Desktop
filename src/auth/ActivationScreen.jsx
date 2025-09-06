// src/auth/ActivationScreen.jsx
import React, { useEffect, useState } from "react";

// Базова адреса backend з .env (якщо не задано — твій дефолт з файлу)
const API_BASE = (import.meta.env.VITE_LICENSE_SERVER_BASE || "https://billiardsbrutal-desktop-1.onrender.com/").replace(/\/+$/,'/') + "";

export default function ActivationScreen({ onActivated }) {
  const [version, setVersion] = useState("-");
  const [machineId, setMachineId] = useState("");
  const [tier, setTier] = useState("pro");

  const [order, setOrder] = useState(() => {
    try {
      const cached = localStorage.getItem("LS_LICENSE_ORDER_JSON");
      return cached ? JSON.parse(cached) : null; // { id, invoiceId, pageUrl }
    } catch { return null; }
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // версія + machineId
  useEffect(() => {
    try {
      const v = window.versions?.app?.();
      setVersion(v || "dev");
    } catch { setVersion("dev"); }
    (async () => {
      const mid = await window.machine?.id?.();
      setMachineId(mid || "");
    })();
  }, []);

  // кешуємо order
  useEffect(() => {
    try {
      if (order) localStorage.setItem("LS_LICENSE_ORDER_JSON", JSON.stringify(order));
      else localStorage.removeItem("LS_LICENSE_ORDER_JSON");
    } catch {}
  }, [order]);

  async function createOrder() {
    setMsg(""); setBusy(true);
    try {
      if (!machineId) throw new Error("Не вдалося визначити MACHINE ID.");
      const res = await fetch(API_BASE + "api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineId, tier }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Помилка створення замовлення (${res.status})`);
      const ord = { id: data.id, invoiceId: data.invoiceId, pageUrl: data.pageUrl };
      setOrder(ord);
      // відкриємо сторінку Monobank
      if (ord.pageUrl) window.open(ord.pageUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setMsg("Помилка: " + (e.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function refreshOrder() {
    if (!order?.id) return;
    setMsg(""); setBusy(true);
    try {
      const res = await fetch(`${API_BASE}api/orders/${order.id}/refresh`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `REFRESH_FAILED ${res.status}`);

      if (data.ok && data.license) {
        // <<<<<< головне: зберігаємо JWT у Electron (а не у localStorage)
        const saved = await window.license?.applyJwt?.(data.license);
        if (!saved?.ok) throw new Error("Не вдалося застосувати ліцензію (applyJwt).");

        setMsg("Ліцензію застосовано ✅ Оновлюю статус…");
        // невеличка пауза і дернемо статус
        await new Promise(r => setTimeout(r, 300));
        await onActivated?.();
      } else {
        setMsg(`Статус: ${data.status || "очікування"}. Якщо оплатили щойно — натисніть «Я оплатив — перевірити» через кілька секунд.`);
      }
    } catch (e) {
      setMsg("Помилка: " + (e.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  const canCreate = !!machineId && !busy && !order;
  const canCheck  = !!order && !busy;

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-b from-emerald-50 to-slate-50">
      <div className="w-full max-w-3xl p-6">
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
            <div className="text-sm text-slate-700">
              Щоб користуватися програмою, активуйте ліцензію. Оплата через Monobank.
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Machine ID</div>
                <input className="w-full h-10 px-3 rounded-lg ring-1 ring-slate-200" value={machineId} readOnly />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Тариф</div>
                <select className="w-full h-10 px-3 rounded-lg ring-1 ring-slate-200 bg-white" value={tier} onChange={e=>setTier(e.target.value)}>
                  <option value="pro">Pro (1 рік)</option>
                  <option value="lite">Lite (1 рік)</option>
                </select>
              </div>
            </div>

            {!order && (
              <div className="flex items-center gap-3">
                <button
                  className="h-10 px-4 rounded-lg bg-emerald-600 text-white hover:brightness-110 disabled:opacity-60"
                  disabled={!canCreate}
                  onClick={createOrder}
                >
                  Створити рахунок та оплатити
                </button>
                {!machineId && <span className="text-xs text-rose-600">Немає MACHINE ID — перезапустіть застосунок.</span>}
              </div>
            )}

            {order && (
              <>
                <div className="rounded-xl ring-1 ring-emerald-200 bg-emerald-50 p-3">
                  <div className="text-sm text-emerald-800 font-medium">Рахунок створено</div>
                  <div className="text-xs text-emerald-700 mt-1">Invoice ID: {order.invoiceId}</div>
                  <div className="mt-2 flex gap-2">
                    <a
                      className="h-9 px-3 rounded-lg bg-sky-600 text-white grid place-items-center hover:brightness-110"
                      href={order.pageUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Відкрити оплату
                    </a>
                    <button
                      className="h-9 px-3 rounded-lg bg-emerald-600 text-white hover:brightness-110 disabled:opacity-60"
                      disabled={!canCheck}
                      onClick={refreshOrder}
                    >
                      Я оплатив — перевірити
                    </button>
                  </div>
                </div>

                {msg && <div className="text-sm mt-2 text-slate-700">{msg}</div>}
              </>
            )}
          </div>

          <div className="px-6 py-3 border-t border-slate-200 text-[12px] text-slate-500">
            Підтримка: <a className="underline" href="https://t.me/duna_billiard_support" target="_blank" rel="noreferrer">@duna_billiard_support</a>
          </div>
        </div>
      </div>
    </div>
  );
}
