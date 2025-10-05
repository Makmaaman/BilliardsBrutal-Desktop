// src/components/TopBar.jsx
import React, { useMemo } from "react";

/**
 * Новий TopBar — «скло + світлові акценти» у стилі програми.
 * ⚠️ Функціонал і пропси збережені: user, role, baseRate, espIp, espOnline,
 *    licenseInfo, version, liveBadge, onOpenMenu, onAddTable, onRemoveTable, onFeedback.
 * Без зовнішніх залежностей — лише Tailwind + кастомні keyframes (див. index.css).
 */

function cx(...args){return args.filter(Boolean).join(" ");}

/** Маленький «чіп-статус» */
function Chip({ icon, tone = "slate", children, pulse=false }) {
  const t = {
    slate: "bg-white/90 text-slate-800 ring-slate-200/80",
    green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    blue:  "bg-sky-50 text-sky-800 ring-sky-200",
    gold:  "bg-amber-50 text-amber-800 ring-amber-200",
    red:   "bg-rose-50 text-rose-800 ring-rose-200",
  }[tone] || "bg-white/90 text-slate-800 ring-slate-200/80";

  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 h-8 px-3 rounded-full ring-1 shadow-sm",
        "backdrop-blur-sm transition-transform duration-300 ease-out hover:scale-[1.02]",
        pulse && "chip-pulse",
        t
      )}
    >
      {icon && <span className="text-base leading-none">{icon}</span>}
      <span className="text-sm">{children}</span>
    </span>
  );
}

/** Брендинг з круглим логотипом «DB» — залишаємо як було */
function Brand({ liveBadge }){
  return (
    <div className="flex items-center gap-3">
      <div className={cx(
        "relative w-10 h-10 rounded-full grid place-items-center",
        "bg-emerald-600 text-white font-semibold shadow-md ring-2 ring-emerald-300/50"
      )}>
        <span>DB</span>
        {liveBadge && <span className="absolute inset-0 rounded-full ring-2 ring-emerald-400/40 animate-softPulse" />}
      </div>
      <div className="leading-tight">
        <div className="font-semibold tracking-tight">Duna Billiard Club</div>
        {liveBadge && (
          <div className="text-[11px] text-emerald-700/90 mt-0.5 marquee">
            <span className="marquee__inner">{liveBadge}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TopBar({
  user,
  role,
  baseRate,
  espIp,
  espOnline,
  licenseInfo,
  version,
  liveBadge,
  onOpenMenu,
  onAddTable,
  onRemoveTable,
  onFeedback,
}) {

  const rateText = useMemo(()=>`₴${Number(baseRate||0).toFixed(2)}/год`, [baseRate]);
  const espTone = espOnline ? "green" : "red";

  return (
    <header className="sticky top-0 z-50">
      {/* Світлова плавна лінія нагорі */}
      <div className="h-[3px] w-full bg-gradient-to-r from-emerald-400 via-sky-400 to-emerald-400 animate-gradientSlide" />

      <div
        className={cx(
          "backdrop-blur-md bg-white/70",
          "shadow-[0_8px_24px_rgba(0,0,0,0.08)] ring-1 ring-black/5"
        )}
      >
        <div className="mx-auto max-w-[1400px] px-3 sm:px-5">
          <div className="h-16 flex items-center gap-4">
            {/* Ліворуч — бренд */}
            <Brand liveBadge={liveBadge} />

            {/* Центр — статуси */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex flex-wrap items-center gap-2 animate-staggerIn">
                <Chip icon="👤">
                  Користувач: <b className="font-medium">{user || "—"}</b> {role ? <>({role})</> : null}
                </Chip>
                <Chip icon="🏷️">Версія: <b className="font-medium">{version || "—"}</b></Chip>
                <Chip icon="🧩" tone={espTone} pulse={!!espOnline}>
                  ESP: <b className="font-medium">{espIp || "—"}</b> • {espOnline ? "online" : "offline"}
                </Chip>
                <Chip icon="🔒" tone="gold">Ліцензія: {licenseInfo?.tier || "—"}</Chip>
                <Chip icon="💰" tone="blue">
                  Тариф (база): <b className="font-medium">{rateText}</b>
                </Chip>
              </div>
            </div>

            {/* Праворуч — дії */}
            <div className="ml-auto flex items-center gap-2">
              <button
                className="tb-btn bg-sky-600 hover:brightness-110"
                onClick={onFeedback}
                title="Відгук / підтримка"
              >💬 Відгук</button>

              <button
                className="tb-btn bg-emerald-600 hover:brightness-110"
                onClick={onAddTable}
                title="Додати стіл"
              >+ Стіл</button>

              <button
                className="tb-btn bg-rose-600 hover:brightness-110"
                onClick={onRemoveTable}
                title="Зняти стіл"
              >− Стіл</button>

              <button
                className="tb-btn bg-slate-900 hover:brightness-110 menu-wiggle"
                onClick={(e)=> onOpenMenu?.(e.currentTarget.getBoundingClientRect())}
                title="Головне меню"
              >☰ Меню</button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
