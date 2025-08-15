import React, { useRef } from "react";
import { money } from "../utils/format";
import { makeBase } from "../services/esp";

export default function TopBar({ session, tariff, espIP, shift, onOpenMenu }) {
  const ref = useRef(null);
  return (
    <header className="sticky top-0 z-10 border-b border-emerald-100 bg-white/85 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 py-3 grid grid-cols-12 gap-3 items-center">
        <div className="col-span-12 md:col-span-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full grid place-items-center shadow-md"
               style={{ background: "linear-gradient(180deg,#10b981,#065f46)", color:"#fff", fontWeight:700 }}>DB</div>
          <div className="leading-tight">
            <div className="font-semibold text-xl">Duna Billiard Club</div>
            <div className="text-xs text-slate-500">десктоп‑керування столами</div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-5 flex flex-wrap gap-2">
          <div className="px-3 py-1 rounded-full text-xs bg-emerald-50 border border-emerald-200 text-emerald-700">
            Користувач: <b>{session.username}</b> ({session.role})
          </div>
          <div className="px-3 py-1 rounded-full text-xs bg-emerald-50 border border-emerald-200 text-emerald-700">
            Тариф (база): <b>{money(tariff)}/год</b>
          </div>
          <div className="px-3 py-1 rounded-full text-xs bg-emerald-50 border border-emerald-200 text-emerald-700">
            ESP: <b>{makeBase(espIP)}</b>
          </div>
          {shift ? (
            <div className="px-3 py-1 rounded-full text-xs bg-emerald-100 border border-emerald-200 text-emerald-900">
              Зміна відкрита • {new Date(shift.openedAt).toLocaleTimeString()} • {shift.openedBy}
            </div>
          ) : (
            <div className="px-3 py-1 rounded-full text-xs bg-red-50 border border-red-200 text-red-700">
              Зміна закрита — запуск заборонено
            </div>
          )}
        </div>

        <div className="col-span-12 md:col-span-3 flex md:justify-end">
          <button ref={ref} className="px-4 py-2 rounded-xl shadow-sm border text-sm font-medium bg-black text-white border-black"
                  onClick={(e)=>onOpenMenu((ref.current||e.currentTarget).getBoundingClientRect())}>
            Меню
          </button>
        </div>
      </div>
    </header>
  );
}
