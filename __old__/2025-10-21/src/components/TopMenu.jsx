// src/components/TopMenu.jsx
import React from "react";
import "./topbar.css";

/**
 * Скляне контекстне меню у стилі нового TopBar.
 * ВАЖЛИВО: без жодної рольової фільтрації — всі пункти, як і було раніше.
 * Якщо якийсь onXxx не передано — пункт все одно видно, просто нічого не зробить.
 */
export default function TopMenu({
  open, x, y, onClose,
  // role,  // ігноруємо, щоб не змінювати логіку видимості
  info,  // { espOnline, espIp, tablesActive, shiftBadge }
  onStats, onShift,
  onCustomers, onPromos, onReservations,
  onUsers, onTariffs, onSettings, onUpdates,
  onLicense, onLogout
}){
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      <div
        className="tb-menu absolute origin-top-right"
        style={{ top: y, left: x, transform: "translateX(-100%)" }}
        onClick={(e)=>e.stopPropagation()}
      >
        <span className="tb-menu-caret" aria-hidden />

        {/* Інфопанель (не впливає на логіку меню) */}
        {info && (
          <div className="tb-menu-info">
            <InfoPill
              icon="⚡"
              label={info.espOnline === true ? "онлайн" : (info.espOnline === false ? "офлайн" : "перевірка…")}
              sub={info.espIp || "—"}
              tone={info.espOnline === true ? "green" : (info.espOnline === false ? "red" : "blue")}
            />
            <InfoPill icon="🎱" label={`${Number(info.tablesActive||0)}`} sub="активних столів" tone="amber" />
            {info.shiftBadge && <InfoPill icon="🛈" label={info.shiftBadge} sub="стан" />}
          </div>
        )}

        {/* БЕЗ ролей — показуємо все */}
        <MenuItem icon="📈" label="Статистика" onClick={()=>{ onClose?.(); onStats?.(); }} />
        <MenuItem icon="🕒" label="Зміна" onClick={()=>{ onClose?.(); onShift?.(); }} />

        <div className="tb-menu-sep" />

        <MenuItem icon="👥" label="Клієнти" onClick={()=>{ onClose?.(); onCustomers?.(); }} />
        <MenuItem icon="🏷️" label="Акції/Знижки" onClick={()=>{ onClose?.(); onPromos?.(); }} />
        <MenuItem icon="📅" label="Бронювання" onClick={()=>{ onClose?.(); onReservations?.(); }} />
        <MenuItem icon="🧑‍🤝‍🧑" label="Користувачі" onClick={()=>{ onClose?.(); onUsers?.(); }} />

        <div className="tb-menu-sep" />

        <MenuItem icon="⚙️" label="Налаштування" onClick={()=>{ onClose?.(); onSettings?.(); }} />
        <MenuItem icon="🧩" label="Тарифи" onClick={()=>{ onClose?.(); onTariffs?.(); }} />
        <MenuItem icon="⬇️" label="Оновлення" onClick={()=>{ onClose?.(); onUpdates?.(); }} />
        <MenuItem icon="🔑" label="Ліцензія" onClick={()=>{ onClose?.(); onLicense?.(); }} />

        <div className="tb-menu-sep" />

        <MenuItem icon="🚪" label="Вийти" danger onClick={()=>{ onClose?.(); onLogout?.(); }} />
      </div>
    </div>
  );
}

function MenuItem({ icon, label, danger=false, onClick }){
  return (
    <button
      className={`tb-menu-item ${danger ? "tb-menu-item-danger" : ""}`}
      onClick={onClick}
    >
      <span className="tb-menu-ico" aria-hidden>{icon}</span>
      <span className="tb-menu-label">{label}</span>
    </button>
  );
}

function InfoPill({ icon, label, sub, tone="default" }){
  return (
    <span className={`tb-pill ${tone !== "default" ? `tb-pill-${tone}` : ""}`}>
      <span className="tb-pill-ico">{icon}</span>
      <span className="tb-pill-lines">
        <span className="tb-pill-main">{label}</span>
        {sub && <span className="tb-pill-sub">{sub}</span>}
      </span>
    </span>
  );
}
