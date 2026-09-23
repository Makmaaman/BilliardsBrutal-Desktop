// src/components/TableCard.jsx
// Дизайн відновлено з v3.9.2: градієнти, світлові смуги, фетрова текстура,
// анімовані індикатори, знижка на стіл.
import React from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

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

// === локальний запис чека після друку ===
function ymd(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}
function saveReceiptToLocalStorage(entry) {
  const day = ymd(entry.finishedAt || Date.now());
  const key = `stats:day:${day}`;
  let bucket = {};
  try {
    bucket = JSON.parse(localStorage.getItem(key) || "{}");
  } catch {}
  bucket[entry.id] = entry;
  localStorage.setItem(key, JSON.stringify(bucket));
}
async function logReceiptAfterPrint({ tableId, amount, liveMs, players, bonusUsed }) {
  const finishedAt = Date.now();
  const startedAt = Math.max(0, finishedAt - (Number(liveMs) || 0));
  const entry = {
    id: `r_${finishedAt}_${Math.random().toString(36).slice(2, 8)}`,
    tableId,
    tableName: `Стіл ${tableId}`,
    amount: Number(amount || 0),
    startedAt,
    finishedAt,
    intervals: [{ start: startedAt, end: finishedAt }],
    players: Array.isArray(players) ? players.slice(0, 4).map((p) => ({ id: p.id, name: p.name })) : [],
    shiftId: localStorage.getItem("stats:shiftId") || null,
    bonusUsed: !!bonusUsed,
  };
  saveReceiptToLocalStorage(entry);
}

/* ===== спільні класи ===== */
const secondaryBtn =
  "bg-gradient-to-br from-emerald-900/60 to-emerald-950/60 text-emerald-100 border-emerald-500/40 hover:from-emerald-800/70 hover:to-emerald-900/70";

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
  onCloseGameKeepLight,
  onTransfer,

  tables,
  onSetPlayers,
  playerInfo,

  bonusActive,
  onToggleBonus,

  // знижка на стіл (0–100 %)
  discount = 0,
  onSetDiscount,
}) {
  const isOn = !!table?.isOn;

  const playersCount = Array.isArray(playerInfo) ? playerInfo.length : 0;
  const tooManyPlayers = playersCount > 4;
  const canStart = canOperate && !busy && !isOn && !tooManyPlayers;
  const canPause = canOperate && !busy && isOn;

  // Перевірка, чи стіл має час гри (не нульовий)
  const hasPlayTime = liveMs > 0 || (table?.intervals && table.intervals.length > 0);
  const canPrintReceipt = !busy && hasPlayTime;
  const canCloseRound = !busy && hasPlayTime && isOn;

  const transferTargets = (tables || []).filter((t) => t.id !== table.id);

  return (
    <motion.div
      className="h-full"
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, type: "spring", stiffness: 260, damping: 20 }}
      whileHover={{ y: -4, scale: 1.01 }}
    >
      {/* Зовнішня рамка з підсвіткою, що «дихає» коли стіл увімкнений */}
      <motion.div
        className="relative h-full rounded-[24px] border-2 border-emerald-500/40 bg-gradient-to-br from-slate-900/95 via-emerald-950/90 to-slate-900/95 shadow-[0_20px_60px_rgba(0,0,0,0.9),0_0_40px_rgba(16,185,129,0.15)] p-[2px]"
        animate={
          isOn
            ? {
                boxShadow: [
                  "0 20px 60px rgba(0,0,0,0.9), 0 0 50px rgba(52,211,153,0.25)",
                  "0 20px 60px rgba(0,0,0,0.9), 0 0 70px rgba(52,211,153,0.4)",
                  "0 20px 60px rgba(0,0,0,0.9), 0 0 50px rgba(52,211,153,0.25)",
                ],
                borderColor: ["rgba(52,211,153,0.5)", "rgba(52,211,153,0.7)", "rgba(52,211,153,0.5)"],
              }
            : {}
        }
        transition={isOn ? { duration: 2.5, repeat: Infinity, ease: "easeInOut" } : {}}
      >
        {/* Світлова смуга зверху */}
        <div className="absolute top-0 left-4 right-4 h-[2px] bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent rounded-t-full pointer-events-none" />

        {/* Фетрова текстура */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[22px] opacity-30"
          style={{
            backgroundImage: `
              repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(52,211,153,0.03) 2px, rgba(52,211,153,0.03) 4px),
              repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(52,211,153,0.03) 2px, rgba(52,211,153,0.03) 4px)
            `,
          }}
        />

        <div className="relative z-10 flex h-full flex-col rounded-[22px] bg-gradient-to-br from-emerald-900/80 via-slate-900/70 to-emerald-950/80 px-4 pt-3 pb-4 text-emerald-50 shadow-[inset_0_2px_20px_rgba(0,0,0,0.4)] backdrop-blur-sm overflow-visible">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 pb-3 mb-3 border-b border-emerald-500/20">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600/40 to-emerald-800/40 border border-emerald-500/40 flex items-center justify-center shadow-lg">
                <span className="text-2xl">🎱</span>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-400/80 font-semibold">стіл</div>
                <div className="text-2xl font-bold tracking-tight text-emerald-50">№{table?.id}</div>
                {relayChannel != null && (
                  <div className="text-[10px] text-emerald-300/60">
                    Реле: <span className="font-mono text-emerald-200/80">{relayChannel}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              {/* Статус столу */}
              <motion.div
                className="inline-flex items-center gap-2 rounded-xl border-2 px-3 py-1.5 shadow-lg"
                animate={{
                  backgroundColor: isOn ? "rgba(6,95,70,0.8)" : "rgba(15,23,42,0.8)",
                  borderColor: isOn ? "rgba(52,211,153,0.6)" : "rgba(52,211,153,0.3)",
                }}
                transition={{ duration: 0.25 }}
              >
                <motion.span
                  className="h-3 w-3 rounded-full"
                  animate={{
                    backgroundColor: isOn ? "#4ADE80" : "#0f766e",
                    boxShadow: isOn ? "0 0 12px rgba(74,222,128,0.8)" : "none",
                  }}
                  transition={{ duration: 0.25 }}
                />
                <span className="text-[11px] font-bold uppercase tracking-[0.12em]">{isOn ? "УВІМК." : "ВИМК."}</span>
              </motion.div>
              {busy && (
                <div className="rounded-xl border-2 border-amber-400/50 bg-gradient-to-r from-amber-500/20 to-amber-600/20 px-3 py-1 text-[11px] font-semibold text-amber-200 shadow-lg animate-pulse">
                  Операція...
                </div>
              )}
            </div>
          </div>

          {/* Бонуси + Гравці + Знижка */}
          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              onClick={onToggleBonus}
              className={[
                "h-10 px-5 rounded-xl text-[13px] font-bold inline-flex items-center justify-center gap-2",
                "border-2 transition-all duration-300 relative overflow-hidden shadow-lg",
                bonusActive
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-400 text-white border-emerald-300/70 shadow-emerald-500/40"
                  : secondaryBtn,
              ].join(" ")}
              title="Грати за бонуси"
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              animate={
                bonusActive
                  ? {
                      boxShadow: [
                        "0 4px 20px rgba(52,211,153,0.4)",
                        "0 4px 30px rgba(52,211,153,0.6)",
                        "0 4px 20px rgba(52,211,153,0.4)",
                      ],
                    }
                  : {}
              }
              transition={{ duration: 0.2 }}
            >
              <motion.span
                animate={bonusActive ? { rotate: [0, -10, 10, -10, 0] } : {}}
                transition={bonusActive ? { duration: 0.5, repeat: Infinity, repeatDelay: 2 } : {}}
              >
                🎁
              </motion.span>
              За бонуси
            </motion.button>

            <div className="flex flex-col gap-1">
              <motion.button
                onClick={() => onSetPlayers?.(table.id)}
                className={[
                  "h-10 px-5 rounded-xl text-[13px] font-semibold inline-flex items-center justify-center gap-2",
                  "border-2 transition-all duration-300 shadow-md hover:shadow-lg",
                  secondaryBtn,
                  tooManyPlayers ? "!border-rose-500/70 animate-pulse" : "",
                ].join(" ")}
                title="Оберіть до 4 гравців (необовʼязково)"
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.97 }}
              >
                <span>👥</span> Гравці
              </motion.button>
              {tooManyPlayers && (
                <motion.span
                  className="text-[11px] text-rose-300 font-medium"
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  Макс. 4 гравців
                </motion.span>
              )}
            </div>

            <DiscountControl discount={discount} onSetDiscount={onSetDiscount} />
          </div>

          {/* Бейджі гравців */}
          <div className="mt-3 flex min-h-[32px] flex-wrap items-center gap-2">
            {Array.isArray(playerInfo) && playerInfo.length ? (
              playerInfo.slice(0, 4).map((p, index) => (
                <motion.span
                  key={p.id}
                  className="inline-flex max-w-[220px] items-center gap-2 truncate rounded-xl bg-gradient-to-r from-emerald-900/70 to-emerald-800/70 px-3 py-1.5 text-[12px] text-emerald-50 border border-emerald-500/40 shadow-md"
                  title={`${p.name}${p.balance != null ? ` — бонус ${p.balance}` : ""}`}
                  initial={{ opacity: 0, scale: 0.8, x: -10 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  whileHover={{ scale: 1.05 }}
                >
                  <motion.span
                    className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <span className="truncate font-medium">{p.name}</span>
                  {p.balance != null && (
                    <span className="text-[11px] text-emerald-300/80">🎁 {(Number(p.balance) || 0).toFixed(2)}</span>
                  )}
                </motion.span>
              ))
            ) : (
              <motion.span
                className="text-[12px] text-emerald-400/60 italic"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                Гравці не вибрані
              </motion.span>
            )}
          </div>

          {/* Метрики */}
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <MetricBox label="Час гри" value={fmtMs(liveMs)} variant="time" isOn={isOn} />
            <MetricBox
              label={discount > 0 ? `Нараховано (-${discount}%)` : "Нараховано"}
              value={fmtMoney(cost)}
              variant="money"
              hasDiscount={discount > 0}
            />
          </div>

          {/* Основні дії */}
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <motion.button
              className={[
                "h-11 rounded-xl text-[14px] font-bold inline-flex items-center justify-center gap-2",
                "border-2 transition-all duration-300 relative overflow-hidden shadow-lg",
                canStart
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-400 text-white border-emerald-300/70 shadow-emerald-500/40 hover:shadow-emerald-500/60"
                  : canPause
                    ? "bg-gradient-to-r from-amber-500 to-amber-400 text-slate-900 border-amber-300/70 shadow-amber-500/40 hover:shadow-amber-500/60"
                    : "bg-emerald-950/50 text-emerald-600 border-emerald-800/50 cursor-not-allowed",
              ].join(" ")}
              onClick={() => (isOn ? onPause?.(table.id) : onLightOn?.(table.id))}
              disabled={!(canStart || canPause)}
              whileHover={canStart || canPause ? { scale: 1.02, y: -2 } : {}}
              whileTap={canStart || canPause ? { scale: 0.98 } : {}}
              transition={{ duration: 0.2 }}
            >
              {(canStart || canPause) && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
              )}
              <span className="text-[18px] relative z-10">{isOn ? "⏸" : "▶️"}</span>
              <span className="relative z-10">{isOn ? "Пауза / Стоп" : "Старт гри"}</span>
            </motion.button>

            <motion.button
              className={[
                "h-11 rounded-xl text-[14px] font-semibold inline-flex items-center justify-center gap-2",
                "border-2 transition-all duration-300 shadow-md",
                busy || !hasPlayTime
                  ? "bg-emerald-950/40 text-emerald-600 border-emerald-800/50 cursor-not-allowed"
                  : secondaryBtn + " hover:shadow-lg",
              ].join(" ")}
              onClick={() => onReset?.(table.id)}
              disabled={!!busy || !hasPlayTime}
              whileHover={!busy && hasPlayTime ? { scale: 1.02, y: -2 } : {}}
              whileTap={!busy && hasPlayTime ? { scale: 0.98 } : {}}
              transition={{ duration: 0.2 }}
            >
              ⏹ Скинути
            </motion.button>
          </div>

          {/* Додаткові дії */}
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <motion.button
              className={[
                "h-10 rounded-xl px-4 text-[13px] font-semibold inline-flex items-center justify-center gap-2 transition-all duration-300 border-2 shadow-md",
                canPrintReceipt
                  ? secondaryBtn + " hover:shadow-lg cursor-pointer"
                  : "bg-emerald-950/30 text-emerald-600/50 border-emerald-800/30 cursor-not-allowed",
              ].join(" ")}
              onClick={async () => {
                if (!canPrintReceipt) return;
                await onPrintReset?.(table.id);
                try {
                  await logReceiptAfterPrint({
                    tableId: table.id,
                    amount: cost,
                    liveMs,
                    players: playerInfo,
                    bonusUsed: bonusActive,
                  });
                } catch (e) {
                  console.warn("Не вдалось записати чек у статистику:", e);
                }
              }}
              disabled={!canPrintReceipt}
              whileHover={canPrintReceipt ? { scale: 1.02, y: -1 } : {}}
              whileTap={canPrintReceipt ? { scale: 0.98 } : {}}
              transition={{ duration: 0.2 }}
            >
              🧾 Чек + Скинути
            </motion.button>

            <motion.button
              className={[
                "min-h-10 rounded-xl px-4 py-2 text-[13px] leading-tight font-semibold inline-flex items-center justify-center gap-2 transition-all duration-300 border-2 text-center shadow-md",
                canCloseRound
                  ? secondaryBtn + " hover:shadow-lg cursor-pointer"
                  : "bg-emerald-950/30 text-emerald-600/50 border-emerald-800/30 cursor-not-allowed",
              ].join(" ")}
              onClick={() => onCloseGameKeepLight?.(table.id)}
              disabled={!canCloseRound}
              whileHover={canCloseRound ? { scale: 1.02, y: -1 } : {}}
              whileTap={canCloseRound ? { scale: 0.98 } : {}}
              transition={{ duration: 0.2 }}
            >
              <span className="text-[16px]">🔒</span>
              <span className="flex flex-col items-center leading-none">
                <span className="text-[12px] font-bold">Закрити</span>
                <span className="text-[10px] text-emerald-300/60">без світла</span>
              </span>
            </motion.button>
          </div>

          {/* Перенесення */}
          <div className="mt-3">
            <TransferMenu targets={transferTargets} onChoose={(toId) => onTransfer?.(table.id, toId)} />
          </div>

          <div className="flex-1" />
        </div>
      </motion.div>
    </motion.div>
  );
}

/* Кнопка «Знижка» з випадаючою панеллю пресетів (0–100 %) */
function DiscountControl({ discount = 0, onSetDiscount }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const active = discount > 0;
  const presets = [0, 5, 10, 15, 20, 25, 30, 50];

  React.useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <motion.button
        onClick={() => setOpen((v) => !v)}
        className={[
          "h-10 px-4 rounded-xl text-[13px] font-semibold inline-flex items-center justify-center gap-2",
          "border-2 transition-all duration-300 shadow-md",
          active
            ? "bg-gradient-to-r from-amber-500/80 to-amber-400/80 text-slate-900 border-amber-300/70 shadow-amber-500/30"
            : secondaryBtn + " hover:shadow-lg",
        ].join(" ")}
        title="Встановити знижку на стіл"
        whileHover={{ scale: 1.03, y: -1 }}
        whileTap={{ scale: 0.97 }}
      >
        <span>🏷️</span>
        {active ? `-${discount}%` : "Знижка"}
      </motion.button>

      {open && (
        <motion.div
          className="absolute top-full left-0 mt-2 z-50 min-w-[200px] rounded-xl border-2 border-emerald-500/50 bg-gradient-to-br from-slate-900/98 via-emerald-950/95 to-slate-900/98 shadow-[0_16px_40px_rgba(0,0,0,0.8),0_0_30px_rgba(16,185,129,0.15)] backdrop-blur-xl overflow-hidden"
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.2 }}
        >
          <div className="px-4 pt-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/80 border-b-2 border-emerald-500/30 bg-gradient-to-r from-emerald-900/60 to-emerald-950/60">
            Знижка на стіл
          </div>
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {presets.map((p) => (
                <motion.button
                  key={p}
                  onClick={() => {
                    onSetDiscount?.(p);
                    setOpen(false);
                  }}
                  className={[
                    "h-9 rounded-lg text-[12px] font-bold transition-all duration-200 border-2",
                    discount === p
                      ? "bg-gradient-to-r from-emerald-500 to-emerald-400 text-white border-emerald-300/70"
                      : "bg-emerald-950/50 text-emerald-200 border-emerald-600/40 hover:bg-emerald-800/60 hover:border-emerald-500/60",
                  ].join(" ")}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {p === 0 ? "—" : `${p}%`}
                </motion.button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={discount}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  onSetDiscount?.(v);
                }}
                className="flex-1 h-9 rounded-lg bg-emerald-950/60 border-2 border-emerald-500/40 px-3 text-[13px] text-emerald-50 font-semibold focus:outline-none focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/30"
                placeholder="0-100"
              />
              <span className="text-emerald-300/80 font-bold">%</span>
            </div>
            {active && (
              <motion.div
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[12px]"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <span>🏷️</span>
                <span>
                  Активна знижка: <strong>{discount}%</strong>
                </span>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

/* Картка метрики: час гри (з індикатором) або нарахована сума */
function MetricBox({ label, value, variant, isOn, hasDiscount = false }) {
  if (variant === "time") {
    return (
      <motion.div
        className="flex min-h-[80px] items-center gap-3 rounded-xl bg-gradient-to-br from-emerald-900/50 via-slate-900/50 to-emerald-950/50 px-4 py-3 border-2 border-emerald-500/30 shadow-[inset_0_2px_15px_rgba(0,0,0,0.3)] relative overflow-hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {isOn && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-emerald-500/15 via-emerald-400/10 to-transparent"
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
        )}
        <div className="flex flex-col gap-1 relative z-10 flex-1">
          <div className="text-[11px] font-semibold text-emerald-300/80 uppercase tracking-wide">{label}</div>
          <motion.div
            className="text-2xl font-bold tracking-wide select-none text-emerald-50"
            animate={isOn ? { scale: [1, 1.03, 1] } : { scale: 1 }}
            transition={{ duration: 2.2, repeat: isOn ? Infinity : 0, ease: "easeInOut" }}
          >
            {value}
          </motion.div>
        </div>
        <div className="relative z-10 shrink-0">
          <motion.div
            className={`h-3 w-3 rounded-full ${isOn ? "bg-emerald-400" : "bg-emerald-700"}`}
            animate={
              isOn
                ? { boxShadow: ["0 0 0 0 rgba(52,211,153,0.6)", "0 0 0 8px rgba(52,211,153,0)"], scale: [1, 1.2, 1] }
                : {}
            }
            transition={isOn ? { duration: 1.5, repeat: Infinity } : {}}
          />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className={[
        "flex min-h-[80px] flex-col justify-between rounded-xl px-4 py-3 border-2 shadow-[inset_0_2px_15px_rgba(0,0,0,0.3)] relative overflow-hidden",
        hasDiscount
          ? "bg-gradient-to-br from-amber-900/40 via-slate-900/50 to-amber-950/40 border-amber-500/40"
          : "bg-gradient-to-br from-emerald-900/50 via-slate-900/50 to-emerald-950/50 border-emerald-500/30",
      ].join(" ")}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      whileHover={{ scale: 1.02, boxShadow: "0 8px 25px rgba(0,0,0,0.4)" }}
    >
      {hasDiscount && (
        <motion.div
          className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-amber-500/80 text-slate-900 text-[10px] font-bold"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          🏷️
        </motion.div>
      )}
      <div
        className={[
          "text-[11px] font-semibold uppercase tracking-wide",
          hasDiscount ? "text-amber-300/80" : "text-emerald-300/80",
        ].join(" ")}
      >
        {label}
      </div>
      <div className="text-2xl font-bold tracking-wide select-none text-emerald-50">{value}</div>
    </motion.div>
  );
}

/* Меню «Перенести гру…» — випадаючий список через портал (не обрізається картками) */
function TransferMenu({ targets, onChoose }) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef(null);
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const [pos, setPos] = React.useState({ top: 0, left: 0, width: 0 });

  function updatePos() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 8, left: r.left, width: r.width });
  }

  React.useEffect(() => {
    const onDown = (e) => {
      if (!wrapRef.current) return;
      const inWrap = wrapRef.current.contains(e.target);
      const inMenu = menuRef.current && menuRef.current.contains(e.target);
      if (!inWrap && !inMenu) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updatePos();
    const onChange = () => updatePos();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [open]);

  return (
    <div className="relative z-50" ref={wrapRef}>
      <button
        className="inline-flex h-10 w-full items-center justify-between rounded-xl bg-gradient-to-br from-emerald-900/60 to-emerald-950/60 px-4 text-[13px] font-semibold text-emerald-100 border-2 border-emerald-500/40 hover:from-emerald-800/70 hover:to-emerald-900/70 hover:shadow-lg transition-all shadow-md"
        onClick={() => {
          updatePos();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        ref={btnRef}
      >
        <span>Перенести гру…</span>
        <span className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[10000] rounded-xl border-2 border-emerald-500/50 bg-gradient-to-br from-slate-900/98 via-emerald-950/95 to-slate-900/98 shadow-[0_24px_60px_rgba(0,0,0,0.85),0_0_40px_rgba(16,185,129,0.2)] backdrop-blur-xl overflow-hidden"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            <div className="px-4 pt-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/80 border-b-2 border-emerald-500/30 bg-gradient-to-r from-emerald-900/60 to-emerald-950/60">
              На інший стіл
            </div>
            <ul className="max-h-48 space-y-1 overflow-y-auto px-2 py-2">
              {targets && targets.length ? (
                targets
                  .filter((t) => !t?.isOn)
                  .map((t) => (
                    <li key={t.id}>
                      <button
                        className="w-full rounded-xl px-4 py-2.5 text-left text-sm font-medium text-emerald-100 bg-emerald-950/40 hover:bg-gradient-to-r hover:from-emerald-800/60 hover:to-emerald-700/60 border-2 border-transparent hover:border-emerald-500/50 transition-all duration-200 shadow-sm hover:shadow-md"
                        onClick={() => {
                          setOpen(false);
                          onChoose?.(t.id);
                        }}
                      >
                        🎱 на Стіл {t.id}
                      </button>
                    </li>
                  ))
              ) : (
                <li className="px-4 py-3 text-sm text-emerald-400/60 italic text-center">Немає вільних столів</li>
              )}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
