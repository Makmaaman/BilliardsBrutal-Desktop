// src/components/TopBar.jsx
import React from "react";

/* ---------- маленькі утиліти ---------- */
function StatusDot({ ok }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
        ok ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,.9)]" : "bg-rose-400"
      }`}
    />
  );
}

function Icon({ name, className = "w-3.5 h-3.5" }) {
  const common = { width: 16, height: 16, className };
  switch (name) {
    case "user":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-5 0-9 2.5-9 5.5A1.5 1.5 0 0 0 4.5 21h15A1.5 1.5 0 0 0 21 19.5C21 16.5 17 14 12 14Z"/>
        </svg>
      );
    case "rate":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 11h18v2H3zm0-6h18v2H3zm0 12h18v2H3z"/>
        </svg>
      );
    case "esp":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3a9 9 0 0 0-9 9h2a7 7 0 1 1 7 7v2a9 9 0 0 0 0-18Zm0 4a5 5 0 0 0-5 5h2a3 3 0 1 1 3 3v2a5 5 0 0 0 0-10Z"/>
        </svg>
      );
    case "shield":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm0 18c-3.2-1-6-4.6-6-9V6.3l6-2.2 6 2.2V11c0 4.4-2.8 8-6 9Z"/>
        </svg>
      );
    case "tag":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 11V3H13L3 13l8 8 10-10ZM7.5 8A1.5 1.5 0 1 1 9 6.5 1.5 1.5 0 0 1 7.5 8Z"/>
        </svg>
      );
    case "clock":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 11h-4V7h2v4h2Z"/>
        </svg>
      );
    case "menu":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 7h16a1 1 0 1 0 0-2H4a1 1 0 1 0 0 2Zm0 6h16a1 1 0 1 0 0-2H4a1 1 0 1 0 0 2Zm0 6h16a1 1 0 1 0 0-2H4a1 1 0 1 0 0 2Z"/>
        </svg>
      );
    default:
      return null;
  }
}

/* ---------- чіп ---------- */
function Chip({
  children,
  tone = "default",      // default | ok | warn | bad
  icon = null,
  glow = false,
  nowrap = true,
  pulse = false,
  title,
}) {
  const toneMap = {
    default: "bg-white/70 ring-slate-200 text-slate-700",
    ok: "bg-emerald-50 ring-emerald-200 text-emerald-700",
    warn: "bg-amber-50 ring-amber-200 text-amber-700",
    bad: "bg-rose-50 ring-rose-200 text-rose-700",
  };
  return (
    <span
      title={title}
      className={[
        "h-8 px-3 inline-flex items-center rounded-full ring-1 text-[12px] select-none",
        "shadow-sm transition-transform duration-200 hover:-translate-y-0.5",
        toneMap[tone],
        nowrap ? "whitespace-nowrap" : ""
      ].join(" ")}
      style={glow ? { boxShadow: "0 0 0 3px rgba(16,185,129,.08) inset" } : undefined}
    >
      {icon && <span className="mr-1.5 text-current"><Icon name={icon} /></span>}
      {pulse && <span className="mr-1.5"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span></span>}
      {children}
    </span>
  );
}

/* ---------- головний бар ---------- */
export default function TopBar({
  user = "admin",
  role = "admin",
  baseRate = 250,
  espIp = "",
  espOnline = true,           // опційно: підсвітити статус ESP
  licenseInfo = null,         // { ok: true, tier: 'pro', expiresAt: ... }
  version = "0.0.0",
  liveBadge = "",             // «Зміна відкрита • 24.08.2025 12:44»
  onOpenMenu,
  onAddTable,
  onRemoveTable,
  onFeedback,                 // відкрити модал зворотного звʼязку
}) {
  return (
    <header className="sticky top-0 z-30">
      {/* напівпрозорий фон із легким градієнтом і склом */}
      <div className="bg-white/60 backdrop-blur-md border-b border-white/40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Ліворуч: логотип + назва */}
            <div className="flex items-center gap-3 mr-2">
              <div className="w-8 h-8 rounded-full bg-emerald-700 text-white text-xs font-bold grid place-items-center shadow-sm">
                DB
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">Duna Billiard Club</div>
                <div className="text-[11px] text-slate-500">десктоп-керування столами</div>
              </div>
            </div>

            {/* Центр: чіпи. Вони обмежені в рядку і красиво переносяться */}
            <div className="flex-1 min-w-[280px]">
              <div className="flex flex-wrap items-center gap-2">
                <Chip icon="user" title="Поточний користувач">
                  Користувач: <b className="ml-1">{user}</b> ({role})
                </Chip>

                <Chip icon="rate" title="Базовий тариф">
                  Тариф (база): <b className="ml-1">₴{baseRate}.00/год</b>
                </Chip>

                <Chip icon="esp" tone={espOnline ? "default" : "bad"} title={`ESP ${espOnline ? "online" : "offline"}`} glow={espOnline}>
                  <StatusDot ok={espOnline} />
                  ESP:{" "}
                  {espIp ? (
                    <a
                      className="underline decoration-dotted underline-offset-2 hover:no-underline ml-1"
                      href={`http://${espIp}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {espIp}
                    </a>
                  ) : (
                    <span className="ml-1 opacity-70">не вказано</span>
                  )}
                </Chip>

                <Chip icon="shield" tone={licenseInfo?.ok ? "ok" : "bad"} title="Статус ліцензії" glow={!!licenseInfo?.ok}>
                  Ліцензія: {licenseInfo?.ok ? (licenseInfo?.tier || "OK") : "немає"}
                </Chip>

                <Chip icon="tag" title="Версія застосунку">
                  Версія: v{version}
                </Chip>

                {liveBadge ? (
                  <Chip icon="clock" tone="ok" pulse title="Зміна відкрита">
                    {liveBadge}
                  </Chip>
                ) : (
                  <Chip icon="clock" tone="warn" title="Зміна закрита">Зміна закрита</Chip>
                )}
              </div>
            </div>

            {/* Праворуч: кнопки з однаковою висотою та мʼякими ховерами */}
            <div className="flex items-center gap-2">
              <button
                onClick={onFeedback || (window?.ui?.openFeedback ?? (()=>{}))}
                className="px-3 h-9 rounded-full bg-sky-600 text-white text-sm shadow-md hover:brightness-110 active:translate-y-px transition"
                title="Надіслати відгук"
              >
                Відгук
              </button>

              <button
                onClick={onAddTable}
                className="px-3 h-9 rounded-full bg-gradient-to-b from-emerald-600 to-emerald-700 text-white text-sm shadow-md hover:brightness-110 active:translate-y-px transition"
                title="Додати стіл"
              >
                + Стіл
              </button>

              <button
                onClick={onRemoveTable}
                className="px-3 h-9 rounded-full bg-gradient-to-b from-rose-500 to-rose-600 text-white text-sm shadow-md hover:brightness-110 active:translate-y-px transition"
                title="Видалити останній неактивний стіл"
              >
                − Стіл
              </button>

              <button
                onClick={(e)=> onOpenMenu?.(e.currentTarget.getBoundingClientRect())}
                className="pl-2 pr-3 h-9 rounded-full bg-white/80 ring-1 ring-slate-200 text-slate-700 hover:bg-white flex items-center gap-2 shadow-sm transition"
                title="Меню"
              >
                <Icon name="menu" className="w-4 h-4" />
                <span className="text-sm">Меню</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* тонка лінія-підсвітка під баром (приємний акцент) */}
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-emerald-300/40 to-transparent" />
    </header>
  );
}
