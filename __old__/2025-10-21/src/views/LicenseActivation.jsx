import React, { useEffect, useState } from "react";
import {
  getMachineId,
  ensureStoredOrderValid,
  getStoredOrder,
  openPayment,
  clearOrderEverywhere,
  tryActivate,
} from "../lib/licenseClient";

const plans = [
  { id: "pro-1y", name: "Pro (1 рік)" },
  { id: "lite-1y", name: "Lite (1 рік)" },
];

export default function LicenseActivation() {
  const [machineId, setMachineId] = useState("");
  const [plan, setPlan] = useState(plans[0].id);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");

  useEffect(() => {
    (async () => {
      setError(""); setInfo("");
      const mid = await getMachineId();
      setMachineId(mid || "");
      const valid = await ensureStoredOrderValid();
      setOrder(valid || null);
    })();
  }, []);

  const handleOpenPayment = async () => {
    setBusy(true); setError(""); setInfo("");
    try {
      const o = await openPayment({ order, plan, machineId });
      setOrder(o || null);
      setInfo("Створено новий рахунок. Вікно оплати відкрито.");
    } catch (e) {
      setError(String(e.message || e));
    } finally { setBusy(false); }
  };

  const handleVerify = async () => {
    if (!order) return;
    setBusy(true); setError(""); setInfo("");
    try {
      const res = await tryActivate(machineId, order);
      if (res?.ok) setInfo("Оплата підтверджена. Ліцензію активовано.");
      else setError(res?.error || "Не вдалося підтвердити оплату");
    } catch (e) {
      const msg = String(e.message || e);
      if (/ORDER_NOT_FOUND|not\s*found/i.test(msg)) {
        setInfo("Рахунок не знайдено — очищено. Створіть новий.");
        await clearOrderEverywhere();
        setOrder(null);
      } else {
        setError(msg);
      }
    } finally { setBusy(false); }
  };

  const handleClear = async () => {
    setBusy(true); setError(""); setInfo("");
    try {
      await clearOrderEverywhere();
      setOrder(null);
      setInfo("Рахунок очищено.");
    } catch (e) {
      setError(String(e.message || e));
    } finally { setBusy(false); }
  };

  const invoiceLabel = order?.invoiceId ? order.invoiceId : (order?.dbId || "—");

  return (
    <div className="mx-auto max-w-xl rounded-2xl shadow-md bg-white/70 backdrop-blur p-4 mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-emerald-800">Активація ліцензії</div>
        <div className="text-xs text-gray-500">Версія: vdev</div>
      </div>

      <p className="text-sm text-gray-700 mb-3">
        Щоб користуватися програмою, активуйте ліцензію. Оплата через Monobank.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-xs text-gray-600">MACHINE ID</label>
          <input
            type="text"
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm bg-white"
            value={machineId}
            readOnly
            placeholder="—"
          />
        </div>
        <div>
          <label className="text-xs text-gray-600">ТАРИФ</label>
          <select
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm bg-white"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 mb-3">
        <div className="text-sm text-emerald-700 font-medium mb-2">
          {order ? "Рахунок створено" : "Рахунок ще не створено"}
        </div>
        <div className="text-xs text-emerald-700">
          {order ? (<><span className="opacity-70">Invoice ID:</span> <span className="font-mono">{invoiceLabel}</span></>) : "Натисніть «Відкрити оплату», щоб згенерувати посилання"}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button onClick={handleOpenPayment} disabled={busy}
            className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
            Відкрити оплату
          </button>
          <button onClick={handleVerify} disabled={busy || !order}
            className="px-3 py-1.5 text-sm rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-50">
            Я оплатив — перевірити
          </button>
          <button onClick={handleClear} disabled={busy}
            className="ml-auto px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            title="Очистити збережений рахунок">
            Очистити рахунок
          </button>
        </div>
      </div>

      {info ? <div className="text-xs text-emerald-700">{info}</div> : null}
      {error ? <div className="text-xs text-red-600">Помилка: {error}</div> : null}

      <div className="text-xs text-gray-500 mt-4">
        Підтримка: <a className="underline" href="https://t.me/duna_billiard_support" target="_blank" rel="noreferrer">@duna_billiard_support</a>
      </div>
    </div>
  );
}
