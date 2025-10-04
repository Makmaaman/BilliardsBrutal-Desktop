
// src/components/CustomerSelect.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";

export default function CustomerSelect({ value, onChange, placeholder="Виберіть клієнта" }) {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    api("customers:list").then((arr) => setList(Array.isArray(arr) ? arr : []));
  }, []);

  useEffect(() => {
    const onDoc = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selected = useMemo(() => (list||[]).find(c => c.id === value) || null, [list, value]);

  const filtered = useMemo(() => {
    const qq = (q||"").trim().toLowerCase();
    if (!qq) return list.slice(0, 20);
    return (list||[]).filter(c => {
      return (c.name||"").toLowerCase().includes(qq) || (c.phone||"").toLowerCase().includes(qq);
    }).slice(0, 20);
  }, [list, q]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={()=> setOpen(v=>!v)}
        className="h-10 w-full px-3 rounded-xl border border-slate-300 bg-white text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
      >
        {selected ? <span className="font-medium">{selected.name}</span> : <span className="text-slate-500">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute z-[70] mt-2 w-full rounded-xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              className="h-9 w-full px-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
              placeholder="Пошук за ім'ям або телефоном…"
              value={q}
              onChange={(e)=>setQ(e.target.value)}
            />
          </div>
          <div className="max-h-64 overflow-auto">
            {(filtered.length ? filtered : [{id:"_no", name:"Нічого не знайдено"}]).map(c => (
              <button
                key={c.id}
                type="button"
                onClick={()=>{ if (c.id !== "_no"){ onChange?.(c.id); setOpen(false);} }}
                className="w-full px-3 py-2 text-left hover:bg-emerald-50"
                disabled={c.id==="_no"}
              >
                <div className="text-sm font-medium">{c.name}</div>
                {c.phone && <div className="text-xs text-slate-500">{c.phone}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
