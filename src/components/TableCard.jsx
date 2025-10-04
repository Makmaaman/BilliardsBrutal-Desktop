// src/components/TableCard.jsx
import React from "react";

/* ===== helpers ===== */
const fmtMoney = (n) => {
  const v = Number(n || 0);
  try {
    return new Intl.NumberFormat("uk-UA", {
      style: "currency",
      currency: "UAH",
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `₴${v.toFixed(2)}`;
  }
};
const fmtMs = (ms) => {
  const t = Math.max(0, Number(ms) || 0);
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export default function TableCard({
  table,
  relayChannel,
  cost,
  liveMs,

  canOperate,
  busy,

  onLightOn,
  onPause,
  onReset,
  onPrintReset,
  onTransfer,

  tables,
  onSetPlayers,
  playerInfo,

  bonusActive,
  onToggleBonus,
}) {
  const isOn = !!table?.isOn;
  const canStart =
  canOperate && !busy && !isOn &&
  (!bonusActive || (Array.isArray(playerInfo) && playerInfo.length > 0));
  const canPause = canOperate && !busy && isOn;

  const transferTargets = (tables || []).filter((t) => t.id !== table.id);

  return (
    <div className="h-full rounded-[22px] ring-2 ring-[#8a4f24]/70 bg-[#3a2419] p-2 shadow-lg">
      <div className="felt-bg h-full flex flex-col rounded-[18px] px-4 pt-3 pb-4 text-white/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,.05)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-white/60">стіл</div>
            <div className="text-2xl font-semibold drop-shadow-sm">Стіл {table?.id}</div>
          </div>

          <div className="flex items-center gap-2 text-[13px]">
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${
                isOn ? "bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,.15)]" : "bg-slate-400"
              }`}
              aria-hidden
            />
            <span className="uppercase tracking-wide opacity-80">{isOn ? "УВІМК." : "ВИМК."}</span>
          </div>
        </div>

        {/* Chips */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={onToggleBonus}
            className={`h-10 px-4 rounded-xl font-medium text-[14px] inline-flex items-center justify-center gap-2 ring-1 shadow-md transition
              ${
                bonusActive
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white ring-emerald-500/30"
                  : "bg-white/15 hover:bg-white/20 text-white ring-white/15"
              }`}
            
            title="Грати за бонуси"
          >
            <span className="mr-1.5">🎁</span> За бонуси
          </button>

          <button
            onClick={() => onSetPlayers?.(table.id)}
            className="h-10 px-4 rounded-xl text-[14px] bg-white/15 hover:bg-white/20 text-white ring-1 ring-white/15 shadow-md inline-flex items-center justify-center gap-2 transition"
          >
            <span className="mr-1.5">👥</span> Гравці
          </button>
        </div>

        {/* Players */}
        <div className="mt-3 flex flex-wrap items-center gap-2 min-h-[28px]">
          {Array.isArray(playerInfo) && playerInfo.length ? (
            playerInfo.slice(0, 2).map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-2 max-w-[220px] truncate px-3 h-7 rounded-full text-[12px] bg-white/10 ring-1 ring-white/15 shadow-sm"
                title={`${p.name} — баланс ${p.balance || 0}`}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="truncate">{p.name}</span>
                <span className="text-[11px] opacity-75">{(p.balance || 0).toFixed(2)}</span>
              </span>
            ))
          ) : (
            <span className="text-[12px] opacity-70">Гравці не вибрані</span>
          )}
        </div>

        {/* Metrics */}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <MetricBox label="Час" value={fmtMs(liveMs)} />
          <MetricBox label="Нараховано" value={fmtMoney(cost)} />
        </div>

        {/* Main actions */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            className={`h-11 rounded-xl font-medium shadow-lg ring-1 transition text-[15px] inline-flex items-center justify-center gap-2
              ${
                canStart
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white ring-emerald-500/30"
                  : canPause
                  ? "bg-amber-600 hover:bg-amber-500 text-white ring-amber-500/30"
                  : "bg-white/10 text-white/60 ring-white/10 cursor-not-allowed"
              }`}
            onClick={() => (isOn ? onPause?.(table.id) : onLightOn?.(table.id))}
            disabled={!canStart && !canPause}
            title={canOperate ? "" : "Спочатку відкрийте зміну"}
          >
            {isOn ? "⏸︎ Пауза" : "▶︎ Старт"}
          </button>

          <button
            className={`h-11 rounded-xl font-medium shadow-lg ring-1 transition text-[15px] inline-flex items-center justify-center gap-2
              ${
                busy
                  ? "bg-white/10 text-white/60 ring-white/10 cursor-not-allowed"
                  : "bg-white/15 hover:bg-white/20 text-white ring-white/20"
              }`}
            onClick={() => onReset?.(table.id)}
            disabled={!!busy}
          >
            ⏹ Скинути
          </button>
        </div>

        {/* Extra actions */}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            className="h-10 rounded-xl text-[14px] bg-white/12 hover:bg-white/16 text-white ring-1 ring-white/15 shadow-md transition inline-flex items-center justify-center gap-2"
            onClick={() => onPrintReset?.(table.id)}
          >
            🧾 Чек + Скинути
          </button>

          {/* КАСТОМНИЙ ДРОПДАУН ЗАМІСТЬ SELECT */}
          <TransferMenu
            targets={transferTargets}
            onChoose={(toId) => onTransfer?.(table.id, toId)}
          />
        </div>

        {/* Spacer to push footer down */}
        <div className="flex-1" />

        {/* Footer */}
        <div className="pt-2 text-[12px] opacity-70">Канал реле: {relayChannel ?? "—"}</div>
      </div>
    </div>
  );
}

function MetricBox({ label, value }) {
  return (
    <div className="rounded-[14px] bg-black/10 ring-1 ring-white/10 shadow-inner px-4 py-3 min-h-[92px] flex flex-col justify-between">
      <div className="text-[12px] opacity-70">{label}</div>
      <div className="text-2xl font-semibold tracking-wide select-none">{value}</div>
    </div>
  );
}

/* ========= Dropdown «Перенести гру…» ========= */
function TransferMenu({ targets, onChoose }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        className="h-10 w-full rounded-xl text-[14px] bg-white/12 hover:bg-white/16 text-white ring-1 ring-white/15 shadow-md transition px-3 inline-flex items-center justify-between"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>Перенести гру…</span>
        <span className={`transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-lg bg-[#0c3b33]/95 text-white ring-1 ring-white/15 shadow-xl backdrop-blur-md">
          <ul className="py-1 max-h-56 overflow-y-auto">
            {targets.length ? (
              targets.map((t) => (
                <li key={t.id}>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-white/10"
                    onClick={() => {
                      setOpen(false);
                      onChoose(t.id);
                    }}
                  >
                    на Стіл {t.id}
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-2 text-sm opacity-70">Немає інших столів</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
