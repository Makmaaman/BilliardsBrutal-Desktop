import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

// Іконки, вбудовані як SVG-компоненти
const IconUser = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
);
const IconPlus = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14"/><path d="M12 5v14"/></svg>
);
const IconMinus = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14"/></svg>
);
const IconInfo = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
);
const AppLogo = () => (
    <div className="flex items-center gap-2 text-white font-sans">
      <span className="text-2xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white to-slate-300">
        DUNA
      </span>
    </div>
);

const Clock = () => {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
      const timerId = setInterval(() => setTime(new Date()), 1000);
      return () => clearInterval(timerId);
    }, []);
  
    return (
      <div className="text-right text-white pl-4 sm:pl-6 border-l border-white/10 hidden sm:flex items-center">
        <div>
          <div className="text-2xl font-light leading-none tracking-wider">
            {time.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-xs text-slate-300 opacity-75 leading-none mt-1 text-center">
            {time.toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
        </div>
      </div>
    );
};


function fmtPlan(info) {
  if (!info) return "—";
  if (typeof info === "string") return info;
  const mode = info.mode || (info.tier && /m$/i.test(info.tier) ? "sub" : undefined);
  const plan = info.plan || info.tier || "—";
  const lim = info.tablesLimit ? ` • до ${info.tablesLimit}` : "";
  const exp = info.daysLeft != null ? ` • ${info.daysLeft} дн.` : (info.expiresAt ? " • до " + new Date(info.expiresAt).toLocaleDateString("uk-UA") : "");
  const prefix = mode === "sub" ? "Підписка" : "Повна";
  return `${prefix}: ${plan}${lim}${exp}`;
}

const LicenseWarning = ({ info }) => {
  if (!info || info.ok) return null;
  const days = info.daysLeft;
  if (days == null || days > 7) return null;
  const message = days <= 0 ? "Термін дії ліцензії/підписки сплив." : `Ліцензія спливає через ${days} ${days === 1 ? "день" : "днів"}.`;

  return (
    <div className="px-3 py-2 text-center text-xs bg-amber-100 text-amber-800">
      {message} Будь ласка, поновіть її в налаштуваннях.
    </div>
  );
};

function toText(v, fallback = "—") {
  if (v == null) return fallback;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (v instanceof Date) return v.toLocaleString("uk-UA");
  if (typeof v === "object") {
    try { return fmtPlan(v); } catch {}
  }
  try { return JSON.stringify(v); } catch { return fallback; }
}

const TopBarStatusChips = ({ espOnline, licenseInfo, shiftStatus }) => {
    return (
        <div className="items-center gap-2 hidden lg:flex">
             <GlassChip icon={<div className={`w-2 h-2 rounded-full ${espOnline === null ? 'bg-yellow-400' : espOnline ? 'bg-emerald-400' : 'bg-rose-400'}`} />}>
                {espOnline === null ? 'Перевірка...' : espOnline ? 'ESP онлайн' : 'ESP офлайн'}
            </GlassChip>
            <GlassChip icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}>
                {fmtPlan(licenseInfo)}
            </GlassChip>
            {shiftStatus && (
                <GlassChip icon={<IconInfo className="w-4 w-4 text-cyan-300" />}>
                    {toText(shiftStatus)}
                </GlassChip>
            )}
        </div>
    );
};

function GlassChip({ icon, children }) {
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/20 border border-white/10 text-slate-200 text-xs shadow-inner">
            {icon}
            <span className="truncate">{children}</span>
        </div>
    );
}

function GlassButton({ tone, onClick, children, id, dataRole }) {
  const colors = {
    emerald: "bg-emerald-500 hover:bg-emerald-400 border-emerald-400/50 text-white font-semibold shadow-lg shadow-emerald-500/20",
    ghost: "bg-white/5 hover:bg-white/10 border-white/20 text-slate-200 hover:text-white",
  };
  return (
    <button
      id={id}
      data-role={dataRole}
      onClick={onClick}
      className={`flex items-center justify-center gap-2 h-10 px-4 rounded-xl border backdrop-blur-sm transition-all duration-200 text-sm font-medium ${colors[tone] || colors.ghost}`}
    >
      {children}
    </button>
  );
}


export default function TopBar({
  user,
  role,
  onOpenMenu,
  onAddTable,
  onRemoveTable,
  espOnline,
  licenseInfo,
  liveBadge,
}) {

  function openMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    if (onOpenMenu) {
      onOpenMenu(rect);
    }
  }

  function onMenuKey(e){
    if (e.key === 'Enter' || e.key === ' ') {
      openMenu(e);
    }
  }

  return (
    <header className="sticky top-0 z-50">
      <div className="bg-gradient-to-b from-green-900/90 to-teal-900/90 backdrop-blur-lg border-b border-white/10 shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center h-16 gap-4">
            
            <AppLogo />
            
            <div className="flex items-center gap-2 text-white border-l border-white/10 pl-4 ml-2">
              <IconUser className="w-5 h-5 text-slate-400" />
              <div className="text-sm font-medium hidden md:block">{user} ({role})</div>
            </div>

            <TopBarStatusChips espOnline={espOnline} licenseInfo={licenseInfo} shiftStatus={liveBadge} />
            
            <div className="flex-grow" />

            <div className="flex items-center gap-2">
                <div className="hidden md:flex items-center gap-2">
                    <GlassButton tone="emerald" onClick={onAddTable}>
                        <IconPlus className="w-4 h-4" />
                        <span className="whitespace-nowrap">Додати стіл</span>
                    </GlassButton>
                    <GlassButton tone="emerald" onClick={onRemoveTable}>
                        <IconMinus className="w-4 h-4" />
                        <span className="whitespace-nowrap">Прибрати стіл</span>
                    </GlassButton>
                </div>

                <div className="flex md:hidden items-center gap-2">
                    <GlassButton tone="emerald" onClick={onAddTable}>
                        <IconPlus className="w-5 h-5" />
                    </GlassButton>
                </div>

                <GlassButton
                  id="app-menu-btn"
                  data-role="app-menu-button"
                  tone="ghost"
                  onClick={openMenu}
                >
                  <span className="sr-only">Меню</span>
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" aria-label="Відкрити меню" role="button" aria-haspopup="menu" tabIndex={0} onKeyDown={onMenuKey}>
                    <path strokeWidth="1.8" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </GlassButton>
            </div>
            
            <Clock />

          </div>
        </div>
      </div>
      <LicenseWarning info={licenseInfo} />
    </header>
  );
}

