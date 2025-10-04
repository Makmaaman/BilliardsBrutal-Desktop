import React from "react";
import SideDrawer from "../components/SideDrawer";

export default function TariffsDrawer({ open, onClose, rules, setRules, defaultRules }) {
  if (!open) return null;
  const btn = "px-4 py-2 rounded-xl shadow-sm border text-sm font-medium bg-white text-black border-slate-300";

  return (
    <SideDrawer title="Тарифи за днями і часом" onClose={onClose}>
      <div className="text-xs text-slate-500 mb-3">Оберіть дні, інтервал (24:00 дозволено), ставку грн/год.</div>
      {(rules || []).map((r, idx) => (
        <div key={idx} className="flex flex-wrap items-center gap-2 mb-2">
          <input type="text" className="w-24 rounded-xl border border-slate-300 px-2 py-1"
                 value={r.from} onChange={e => setRules(rs => rs.map((x,i)=> i===idx? {...x, from:e.target.value}:x))}
                 placeholder="10:00" />
          <span>–</span>
          <input type="text" className="w-24 rounded-xl border border-slate-300 px-2 py-1"
                 value={r.to} onChange={e => setRules(rs => rs.map((x,i)=> i===idx? {...x, to:e.target.value}:x))}
                 placeholder="18:00" />
          <input type="number" className="w-24 rounded-xl border border-slate-300 px-2 py-1"
                 value={r.rate} onChange={e => setRules(rs => rs.map((x,i)=> i===idx? {...x, rate:Number(e.target.value)||0}:x))}
                 placeholder="200" />
          <select multiple className="rounded-xl border border-slate-300 px-2 py-1"
                  value={r.days} onChange={e=>{
                    const arr = Array.from(e.target.selectedOptions).map(o=>Number(o.value));
                    setRules(rs => rs.map((x,i)=> i===idx? {...x, days:arr}:x));
                  }}>
            {['Нд','Пн','Вт','Ср','Чт','Пт','Сб'].map((d,i)=><option key={i} value={i}>{d}</option>)}
          </select>
          <button className={btn} onClick={()=> setRules(rs => rs.filter((_,i)=>i!==idx))}>Видалити</button>
        </div>
      ))}
      <div className="flex gap-2 mt-3">
        <button className={btn} onClick={()=> setRules(rs => [...rs, {days:[1,2,3,4,5], from:'10:00', to:'18:00', rate:200}])}>Додати правило</button>
        <button className={btn} onClick={()=> setRules(defaultRules)}>Скинути до дефолтних</button>
      </div>
    </SideDrawer>
  );
}
