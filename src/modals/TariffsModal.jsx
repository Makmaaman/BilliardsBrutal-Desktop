import React, { useState } from "react";
import ModalShell from "../components/ModalShell";

export default function TariffsModal({
  onClose,
  rules, setRules,
  baseRate, setBaseRate,
  bonusEarnMode, setBonusEarnMode,
  bonusPerHour, setBonusPerHour,
  bonusEarnPct, setBonusEarnPct
}) {

  function cloneRule(r) {
    return { days:[...(r.days||[])], from:r.from||"00:00", to:r.to||"24:00", rate:Number(r.rate||0) };
  }

  const [localRules, setLocalRules] = useState(() => rules.map(cloneRule));
  const [base, setBase] = useState(baseRate ?? 200);
  const [err, setErr] = useState("");

  function addRule(preset) {
    const r = preset ?? { days:[1,2,3,4,5], from:"10:00", to:"18:00", rate: base || 200 };
    setLocalRules(v => [...v, cloneRule(r)]);
  }
  function removeRule(idx) { setLocalRules(v => v.filter((_,i)=>i!==idx)); }
  function updateRule(idx, patch) { setLocalRules(v => v.map((r,i)=> i===idx ? { ...r, ...patch } : r)); }
  function toggleDay(idx, day) {
    setLocalRules(v => v.map((r,i)=> {
      if (i!==idx) return r;
      const has = r.days.includes(day);
      return { ...r, days: has ? r.days.filter(d=>d!==day) : [...r.days, day].sort() };
    }));
  }

  function validateAll() {
    for (const r of localRules) {
      if (!r.days || r.days.length===0) return "У кожного правила мають бути обрані дні.";
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.from)) return `Невірний час "з" — ${r.from}`;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.to)) return `Невірний час "до" — ${r.to}`;
      if (isNaN(Number(r.rate)) || Number(r.rate) <= 0) return `Ставка має бути > 0`;
    }
    if (isNaN(Number(base)) || Number(base) <= 0) return "Базова ставка має бути > 0";

    if (bonusEarnMode === "per_hour") {
      if (isNaN(Number(bonusPerHour)) || Number(bonusPerHour) < 0) return "«Грн/год» має бути числом ≥ 0";
    } else {
      if (isNaN(Number(bonusEarnPct)) || Number(bonusEarnPct) < 0) return "Відсоток має бути числом ≥ 0";
    }
    return "";
  }

  function save() {
    const msg = validateAll();
    if (msg) { setErr(msg); return; }
    setRules(localRules.map(cloneRule));
    setBaseRate(Number(base));
    onClose();
  }

  function applyWeekdayWeekendPreset() {
    const w = { days:[1,2,3,4,5], from:"10:00", to:"18:00", rate: Math.max(1, Math.round(base*0.8)) };
    const w2 = { days:[1,2,3,4,5], from:"18:00", to:"02:00", rate: Math.round(base*1.2) };
    const we = { days:[0,6], from:"00:00", to:"24:00", rate: Math.round(base*1.2) };
    setLocalRules([w, w2, we]);
  }
  function applyFlatAllDay() { setLocalRules([{ days:[0,1,2,3,4,5,6], from:"00:00", to:"24:00", rate: Number(base) }]); }

  return (
    <ModalShell title="Тарифи" onClose={onClose} footer={
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <button className="h-9 px-3 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" onClick={applyFlatAllDay}>Цілий день = базова</button>
          <button className="h-9 px-3 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" onClick={applyWeekdayWeekendPreset}>Будні/Вечір/Вихідні</button>
        </div>
        <div className="flex gap-2">
          <button className="h-9 px-4 rounded-lg bg-emerald-600 text-white" onClick={save}>Зберегти</button>
          <button className="h-9 px-4 rounded-lg bg-slate-800 text-white" onClick={onClose}>Закрити</button>
        </div>
      </div>
    }>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl ring-1 ring-slate-200 bg-white p-3">
          <div className="text-sm font-medium mb-2">Базова ставка</div>
          <div className="flex items-center gap-2">
            <input type="number" className="w-32 h-9 px-2 rounded-lg ring-1 ring-slate-200" value={base ?? 0} onChange={e=>setBase(Number(e.target.value)||0)}/>
            <span className="text-sm text-slate-600">/ год</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">Для підказок у пресетах.</div>
        </div>

        <div className="md:col-span-2 flex items-end justify-end">
          <button className="h-9 px-3 rounded-lg bg-sky-600 text-white hover:brightness-110" onClick={()=>addRule()}>
            Додати правило
          </button>
        </div>
      </div>

      {err && <div className="mt-3 text-sm text-rose-600">{err}</div>}

      <div className="mt-4 grid gap-3">
        {localRules.map((r, idx) => (
          <div key={idx} className="rounded-xl ring-1 ring-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm text-slate-600 w-full md:w-auto">Дні:</div>
              <DayPicker value={r.days} onToggle={(d)=>toggleDay(idx,d)} />
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">З</label>
                <input className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200" value={r.from || ""} onChange={e=>updateRule(idx, { from: e.target.value })} placeholder="HH:mm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">До</label>
                <input className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200" value={r.to || ""} onChange={e=>updateRule(idx, { to: e.target.value })} placeholder="HH:mm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Ставка</label>
                <input type="number" className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200" value={r.rate ?? 0} onChange={e=>updateRule(idx, { rate: Number(e.target.value) })}/>
              </div>
              <div className="flex items-end">
                <button className="w-full h-9 rounded-lg bg-rose-600 text-white" onClick={()=>removeRule(idx)}>Видалити правило</button>
              </div>
            </div>
          </div>
        ))}
        {localRules.length === 0 && (
          <div className="text-sm text-slate-600">Правил немає. Додайте через «Додати правило» або використайте пресет.</div>
        )}
      </div>

      {/* НОВЕ: Бонуси за час / відсотком */}
      <div className="mt-6 rounded-xl ring-1 ring-slate-200 bg-white p-3">
        <div className="text-sm font-medium mb-2">Нарахування бонусів</div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="bem"
              value="per_hour"
              checked={bonusEarnMode === "per_hour"}
              onChange={()=>setBonusEarnMode("per_hour")}
            />
            За часом гри
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="bem"
              value="percent"
              checked={bonusEarnMode === "percent"}
              onChange={()=>setBonusEarnMode("percent")}
            />
            Відсоток від нетто
          </label>

          {bonusEarnMode === "per_hour" ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Грн за 1 годину:</span>
              <input
                type="number"
                className="w-28 h-9 px-2 rounded-lg ring-1 ring-slate-200"
                value={bonusPerHour ?? 0}
                onChange={e=>setBonusPerHour(Number(e.target.value)||0)}
                step="0.25"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Відсоток:</span>
              <input
                type="number"
                className="w-20 h-9 px-2 rounded-lg ring-1 ring-slate-200"
                value={bonusEarnPct ?? 0}
                onChange={e=>setBonusEarnPct(Number(e.target.value)||0)}
                step="0.5"
              />
              <span className="text-sm text-slate-600">%</span>
            </div>
          )}
        </div>
        <div className="text-xs text-slate-500 mt-2">
          Нарахування відбувається під час «Скинути/Чек+Скинути». Якщо увімкнено «🎁 За бонуси», спочатку списується баланс гравців, потім нараховується.
        </div>
      </div>
    </ModalShell>
  );
}

function DayPicker({ value, onToggle }) {
  const days = [
    { d:1, t:"Пн" }, { d:2, t:"Вт" }, { d:3, t:"Ср" },
    { d:4, t:"Чт" }, { d:5, t:"Пт" }, { d:6, t:"Сб" }, { d:0, t:"Нд" },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {days.map(({d,t}) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            className={`h-8 px-3 rounded-full text-sm ring-1 ${on ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-slate-700 ring-slate-200"}`}
            onClick={()=>onToggle(d)}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

/* =======================
 * Модал «Користувачі»
 * ======================= */
