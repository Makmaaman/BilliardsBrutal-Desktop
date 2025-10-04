// src/components/TopBar.jsx
import React from "react";

/** Універсальний чіп */
function Chip({ icon, tone = "slate", children }) {
  const toneMap = {
    slate: "bg-white text-slate-800 ring-slate-200",
    green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    blue:  "bg-sky-50 text-sky-800 ring-sky-200",
    gold:  "bg-amber-50 text-amber-800 ring-amber-200",
    red:   "bg-rose-50 text-rose-800 ring-rose-200",
  };
  return (
    <span className={`inline-flex items-center gap-2 h-8 px-3 rounded-full ring-1 shadow-sm ${toneMap[tone]}`}>
      {icon && <span className="text-base leading-none">{icon}</span>}
      <span className="text-sm">{children}</span>
    </span>
  );
}

export default function TopBar({
  user, role, version, baseRate,
  espIp, espOnline = true, licenseInfo,
  liveBadge,
  onOpenMenu, onAddTable, onRemoveTable, onFeedback
}) {
  return (
    <header className="sticky top-0 z-40 bg-white/75 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 py-2">
        <div className="flex flex-wrap md:flex-nowrap items-center gap-3">
          {/* Ліва частина */}
          <div className="flex-1 min-w-[280px]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-600 text-white grid place-items-center font-semibold">DB</div>
              <div>
                <div className="font-semibold leading-tight">Duna Billiard Club</div>
                {liveBadge && <div className="text-[11px] text-emerald-700 leading-tight">{liveBadge}</div>}
              </div>
            </div>

            {/* Статуси */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Chip icon="👤">Користувач: <b className="font-medium">{user}</b> ({role})</Chip>
              <Chip icon="🏷️">Версія: <b className="font-medium">{(version||"")}</b></Chip>
              <Chip icon="🧩" tone={espOnline ? "green" : "red"}>
                ESP: <b className="font-medium">{espIp}</b> • {espOnline ? "online" : "offline"}
              </Chip>
              <Chip icon="🔒" tone="gold">Ліцензія: {licenseInfo?.tier || "—"}</Chip>
              <Chip icon="💰" tone="blue">Тариф (база): <b className="font-medium">₴{Number(baseRate||0).toFixed(2)}/год</b></Chip>
            </div>
          </div>

          {/* Праворуч — дії */}
          <div className="ml-auto flex items-center gap-2">
            <button className="h-9 px-3 rounded-lg bg-sky-600 text-white hover:brightness-110" onClick={onFeedback}>Відгук</button>
            <button className="h-9 px-3 rounded-lg bg-emerald-600 text-white hover:brightness-110" onClick={onAddTable}>+ Стіл</button>
            <button className="h-9 px-3 rounded-lg bg-rose-600 text-white hover:brightness-110" onClick={onRemoveTable}>− Стіл</button>
            <button
              className="h-9 px-3 rounded-lg bg-slate-900 text-white hover:brightness-110"
              onClick={(e)=> onOpenMenu?.(e.currentTarget.getBoundingClientRect())}
            >
              ☰ Меню
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
