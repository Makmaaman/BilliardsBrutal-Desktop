import React, { useState } from "react";
import ModalShell from "../components/ModalShell";

export default function BonusesModal({ onClose, customers }) {
  const [cid, setCid] = useState(customers?.[0]?.id || "");
  const [amount, setAmount] = useState(0);

  async function addBonuses(sign) {
    const val = Number(amount)||0;
    if (!cid || !val) return;
    try {
      await api("customers:bonus:add", { id: cid, amount: sign * Math.abs(val) });
      alert(sign>0 ? "Бонуси нараховано" : "Бонуси списано");
    } catch (e) {
      alert("Помилка: " + (e?.message || e));
    }
  }

  return (
    <ModalShell title="Бонуси" onClose={onClose} footer={
      <div className="flex justify-between items-center">
        <div className="text-xs text-slate-500">1 бонус = 1 грн при списанні</div>
        <div className="flex gap-2">
          <button className="h-9 px-3 rounded-lg bg-emerald-600 text-white" onClick={()=>addBonuses(+1)}>Нарахувати</button>
          <button className="h-9 px-3 rounded-lg bg-rose-600 text-white" onClick={()=>addBonuses(-1)}>Списати</button>
          <button className="h-9 px-3 rounded-lg bg-slate-800 text-white" onClick={onClose}>Готово</button>
        </div>
      </div>
    }>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Клієнт</label>
          <select className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200" value={cid} onChange={e=>setCid(e.target.value)}>
            {customers.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `(${c.phone})` : ""} — баланс: {c.bonusBalance||0}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Кількість бонусів</label>
          <input type="number" className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200" value={amount} onChange={e=>setAmount(e.target.value)} />
        </div>
      </div>
    </ModalShell>
  );
}

/* =======================
 * Модал «Гравці столу»
 * ======================= */
