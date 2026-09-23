// src/components/TopBar.jsx
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useReservations, RES_STATUSES } from "../hooks/useReservations";
import { useTicker } from "../hooks/useTicker";
import { loadPrinterSettings } from "../utils/printerSettings";
import useOnlineBookings from "../hooks/useOnlineBookings";

/* ========== SVG icons (лаконічні) ========== */
const IconUser = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 20.5C4 17.46 7.13 15 12 15s8 2.46 8 5.5" />
    <circle cx="12" cy="8" r="4" />
  </svg>
);

const IconPlus = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

const IconMinus = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12h14" />
  </svg>
);

const IconMenu = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h10" />
  </svg>
);

/* ========== Допоміжні компоненти ========== */

const AppLogo = () => (
  <motion.div
    className="flex items-center gap-3"
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.5, type: "spring" }}
  >
    <motion.div
      className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-300 to-cyan-400 shadow-[0_0_35px_rgba(45,212,191,0.55)]"
      animate={{
        boxShadow: [
          "0 0 35px rgba(45,212,191,0.55)",
          "0 0 50px rgba(45,212,191,0.8)",
          "0 0 35px rgba(45,212,191,0.55)",
        ],
      }}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      <div className="absolute inset-[3px] rounded-2xl bg-slate-950/90 backdrop-blur-sm" />

      {/* Білярдна куля 8 з анімацією */}
      <motion.div
        className="relative flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 shadow-inner"
        animate={{
          rotate: [0, 360],
          scale: [1, 1.08, 1]
        }}
        transition={{
          rotate: { duration: 20, repeat: Infinity, ease: "linear" },
          scale: { duration: 2.5, repeat: Infinity, ease: "easeInOut" }
        }}
      >
        {/* Біла центральна область */}
        <div className="absolute inset-[3px] rounded-full bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center shadow-lg">
          <span className="text-[10px] font-black text-transparent bg-clip-text bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600" style={{ fontFamily: 'system-ui, -apple-system' }}>
            8
          </span>
        </div>
        {/* Відблиск на кулі */}
        <motion.div
          className="absolute top-[2px] left-[3px] w-2 h-2 rounded-full bg-white/40 blur-[1px]"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
    </motion.div>
    <div className="flex flex-col leading-tight">
      <span className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/90">
        Duna
      </span>
      <span className="text-sm font-semibold text-slate-50 tracking-wide">
        Billiard Club
      </span>
    </div>
  </motion.div>
);

const GlassButton = ({
  children,
  tone = "slate",
  onClick,
  iconOnly = false,
  className = "",
}) => {
  const toneMap = {
    slate:
      "border-slate-600/60 bg-slate-900/60 hover:bg-slate-800/80 text-slate-100 hover:border-slate-500/70",
    emerald:
      "border-emerald-500/60 bg-emerald-950/40 hover:bg-emerald-900/70 text-emerald-50 hover:border-emerald-400/70 hover:shadow-[0_0_20px_rgba(52,211,153,0.3)]",
  };
  const base =
    "inline-flex items-center justify-center gap-1 rounded-2xl border px-3 py-1.5 text-xs md:text-sm font-medium shadow-sm shadow-black/40 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-95 relative overflow-hidden";
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={`${base} ${toneMap[tone] || toneMap.slate} ${
        iconOnly ? "px-2 py-1" : ""
      } ${className}`}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.2 }}
    >
      {/* Анімований блиск при наведенні */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
        initial={{ x: '-100%' }}
        whileHover={{ x: '100%' }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
      />
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
};

const StatusPill = ({
  label,
  value,
  tone = "slate",
  state = "neutral",
  onClick,
  title,
  icon,
}) => {
  const baseMap = {
    slate: "border-slate-700/60 bg-slate-950/50 text-slate-100 hover:bg-slate-900/70 hover:border-slate-600/70",
    emerald: "border-emerald-500/40 bg-emerald-950/40 text-emerald-50 hover:bg-emerald-900/60 hover:border-emerald-400/60 hover:shadow-emerald-500/10",
    amber: "border-amber-400/40 bg-amber-950/30 text-amber-50 hover:bg-amber-900/50 hover:border-amber-300/60 hover:shadow-amber-400/10",
    red: "border-rose-500/40 bg-rose-950/40 text-rose-50 hover:bg-rose-900/60 hover:border-rose-400/60 hover:shadow-rose-500/10",
  };
  const dotMap = {
    neutral: "bg-slate-400 shadow-slate-400/30",
    ok: "bg-emerald-400 shadow-emerald-400/50",
    warn: "bg-amber-400 shadow-amber-400/50 animate-pulse",
    error: "bg-rose-400 shadow-rose-400/50 animate-pulse",
  };
  const base = baseMap[tone] || baseMap.slate;
  const dot = dotMap[state] || dotMap.neutral;

  const cls =
    "group flex h-11 min-w-0 items-center gap-2.5 rounded-2xl border px-3 text-xs md:text-[13px] " +
    "shadow-sm shadow-black/30 backdrop-blur-sm transition-all duration-300 " +
    base +
    (onClick
      ? " cursor-pointer hover:-translate-y-0.5 hover:shadow-lg"
      : "");

  const Inner = (
    <>
      {icon ? (
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/5 text-[13px] leading-none ring-1 ring-white/10">
          {icon}
        </span>
      ) : null}
      <motion.span
        className={"h-2 w-2 shrink-0 rounded-full shadow-lg " + dot}
        animate={
          state === "ok" || state === "warn" || state === "error"
            ? { scale: [1, 1.15, 1] }
            : { scale: 1 }
        }
        transition={{
          duration: 2,
          repeat: state === "ok" || state === "warn" || state === "error" ? Infinity : 0,
          ease: "easeInOut",
        }}
      />
      <div className="flex min-w-0 flex-col justify-center">
        <span className="text-[9px] font-semibold uppercase tracking-[0.2em] opacity-60 leading-none">
          {label}
        </span>
        <span className="mt-0.5 max-w-[190px] truncate font-medium leading-tight">
          {value}
        </span>
      </div>
    </>
  );

  if (typeof onClick === "function") {
    return (
      <motion.button
        type="button"
        layout
        whileHover={{ y: -2, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.2, type: "spring", stiffness: 400 }}
        className={cls}
        onClick={onClick}
        title={title}
      >
        {Inner}
      </motion.button>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cls}
      title={title}
    >
      {Inner}
    </motion.div>
  );
};

const Clock = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const date = now.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
  });

  return (
    <motion.div
      className="relative flex items-center gap-3 rounded-full border border-emerald-400/30 bg-gradient-to-b from-emerald-950/40 via-slate-950/70 to-slate-900/60 px-4 py-2 text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.25)] backdrop-blur-md"
      animate={{ y: [0, -1, 0] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <motion.div
        className="absolute -inset-2 rounded-full bg-emerald-400/10 blur-lg"
        animate={{ opacity: [0.2, 0.5, 0.2] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative flex flex-col items-end leading-none">
        <div className="flex items-baseline gap-1">
          <span
            className="text-[18px] font-semibold tracking-[0.12em] text-emerald-50"
            style={{ fontFamily: '"Orbitron", "Rajdhani", "Trebuchet MS", sans-serif' }}
          >
            {h}
          </span>
          <motion.span
            className="text-[18px] text-emerald-300/80"
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            :
          </motion.span>
          <span
            className="text-[18px] font-semibold tracking-[0.12em] text-emerald-50"
            style={{ fontFamily: '"Orbitron", "Rajdhani", "Trebuchet MS", sans-serif' }}
          >
            {m}
          </span>
          <span className="text-[11px] text-emerald-300/70">:{s}</span>
        </div>
        <span className="text-[10px] tracking-[0.2em] text-emerald-200/70">
          {date}
        </span>
      </div>
    </motion.div>
  );
};

const LicenseWarning = ({ info }) => {
  if (!info) return null;
  const days = info.daysLeft;
  if (days == null) return null;
  if (days > 30) return null;

  let message = "";
  if (!info.ok) {
    message =
      "Ліцензія не активна. Програма може бути заблокована. Перевірте оплату.";
  } else if (days != null) {
    if (days <= 0) {
      message = "Термін дії ліцензії сплив. Програма може бути заблокована.";
    } else {
      const word = days === 1 ? "день" : days < 5 ? "дні" : "днів";
      message = `Ліцензія спливає через ${days} ${word}. Поновіть, щоб не втратити доступ.`;
    }
  }

  return (
    <div className="px-4 pb-2">
      <div className="mx-auto max-w-6xl rounded-2xl border border-amber-500/40 bg-amber-100/90 bg-gradient-to-r from-amber-100 to-amber-50/95 px-3 py-2 text-xs md:text-sm text-amber-900 shadow-sm">
        {message}
      </div>
    </div>
  );
};

/* ========== Основний TopBar ========== */

export default function TopBar({
  user,
  role,
  onOpenMenu,
  onAddTable,
  onRemoveTable,
  espOnline,
  licenseInfo,
  liveBadge,

  // додаткові пропи з App (для дизайну)
  baseRate,
  espIp,
  version,
  onFeedback,

  // відкрити модалку онлайн-бронювань (App має передати handler)
  onOpenOnlineBookings,
}) {
  function handleOpenMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    if (onOpenMenu) onOpenMenu(rect);
  }

  function handleMenuKey(e) {
    if (e.key === "Enter" || e.key === " ") handleOpenMenu(e);
  }

  const userLabel =
    user && role ? `${user} (${role})` : user || role || "Оператор";

  const espState = espOnline == null ? "neutral" : espOnline ? "ok" : "error";
  const espText =
    espOnline == null
      ? "Перевірка ESP…"
      : espOnline
      ? "ESP онлайн"
      : "ESP офлайн";

  const tariffText =
    baseRate != null ? `${Number(baseRate).toFixed(0)} грн/год` : "не задано";

  const shiftText =
    typeof liveBadge === "string"
      ? liveBadge
      : liveBadge
      ? "Активна зміна"
      : "Зміна не відкрита";

  // Принтер: статус на основі налаштувань та наявності драйвера
  const [printerInfo] = useState(() => {
    let text = "Не налаштовано";
    let state = "neutral";
    let tone = "slate";

    try {
      const settings = loadPrinterSettings();
      const ip = settings && settings.ip ? String(settings.ip).trim() : "";

      const hasRaw =
        typeof window !== "undefined" &&
        ((window.printers && typeof window.printers.printRaw === "function") ||
          (window.printer && typeof window.printer.sendRaw === "function"));

      if (!ip) {
        text = "IP не задано";
        state = "warn";
        tone = "amber";
      } else if (!hasRaw) {
        text = `Немає драйвера • ${ip}`;
        state = "warn";
        tone = "amber";
      } else {
        text = `Готовий • ${ip}`;
        state = "ok";
        tone = "emerald";
      }
    } catch (e) {
      text = "Помилка налаштувань";
      state = "error";
      tone = "red";
    }

    return { text, state, tone };
  });

  // ===== ЛОКАЛЬНІ бронювання =====
  const { list: reservations } = useReservations();
  useTicker(true, 30_000);
  const nowTs = Date.now();

  const activeReservations = (reservations || []).filter((r) => {
    if (!r || r.status !== RES_STATUSES.IN_PROGRESS) return false;
    const s = new Date(r.startAt).getTime();
    const e = new Date(r.endAt).getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
    return s <= nowTs && nowTs < e;
  });

  const upcomingSoon = (() => {
    const soonLimit = nowTs + 30 * 60 * 1000; // 30 хвилин
    const booked = (reservations || [])
      .filter((r) => r && r.status === RES_STATUSES.BOOKED)
      .map((r) => {
        const start = new Date(r.startAt).getTime();
        return { ...r, _start: start };
      })
      .filter(
        (r) =>
          Number.isFinite(r._start) &&
          r._start >= nowTs &&
          r._start <= soonLimit
      )
      .sort((a, b) => a._start - b._start);
    return booked[0] || null;
  })();

  let bookingText = "Бронювань немає";
  let bookingState = "neutral";
  let bookingTone = "slate";

  if (activeReservations.length > 0) {
    const count = activeReservations.length;
    bookingText = `${count} активн.`;
    if (upcomingSoon && upcomingSoon._start > nowTs) {
      const t = new Date(upcomingSoon._start).toLocaleTimeString("uk-UA", {
        hour: "2-digit",
        minute: "2-digit",
      });
      bookingText += ` • до ${t}`;
    }
    bookingState = "ok";
    bookingTone = "emerald";
  } else if (upcomingSoon) {
    const t = new Date(upcomingSoon._start).toLocaleTimeString("uk-UA", {
      hour: "2-digit",
      minute: "2-digit",
    });
    bookingText = `Найближча о ${t}`;
    bookingState = "warn";
    bookingTone = "amber";
  } else if ((reservations || []).length > 0) {
    bookingText = "Бронювань зараз немає";
    bookingState = "neutral";
    bookingTone = "slate";
  }

  // ===== ОНЛАЙН бронювання з сервера =====
  const online = useOnlineBookings({ enabled: true });

  const onlineServerUrl = String(online?.serverUrl || "").trim();
  const onlineOk = online?.ok; // null | boolean
  const onlineErr = String(online?.error || "");
  const onlineLoading = !!online?.loading;

  const onlineNewCount = Number(online?.newCount || 0);
  const onlineTotalCount = Number(online?.totalCount || 0);

  let onlineText = "Не налаштовано";
  let onlineState = "warn";
  let onlineTone = "amber";
  let onlineTitle = "Вкажіть URL + Token у Налаштуваннях → Загальні";

  if (onlineServerUrl) {
    // Стани підключення/помилки
    if (onlineOk === null) {
      onlineText = onlineLoading ? "Оновлення…" : "Перевірка…";
      onlineState = "neutral";
      onlineTone = "slate";
      onlineTitle = "Перевіряю підключення до сервера…";
    } else if (onlineOk === false) {
      const low = onlineErr.toLowerCase();
      const tokenProblem =
        low.includes("token") || low.includes("токен") || low.includes("не задано");

      onlineText = tokenProblem ? "Token не задано" : "Сервер офлайн";
      onlineState = tokenProblem ? "warn" : "error";
      onlineTone = tokenProblem ? "amber" : "red";
      onlineTitle = onlineErr ? `Помилка: ${onlineErr}` : "Немає звʼязку з сервером";
    } else {
      // onlineOk === true
      onlineTitle = "Відкрити список онлайн-бронювань";

      if (onlineTotalCount > 0) {
        // ✅ ВИПРАВЛЕННЯ: якщо нових 0, але є в черзі — показуємо це
        if (onlineNewCount > 0) {
          const w =
            onlineNewCount === 1 ? "нове" : onlineNewCount < 5 ? "нові" : "нових";
          onlineText = `${onlineNewCount} ${w} • всього ${onlineTotalCount}`;
        } else {
          onlineText = `${onlineTotalCount} в черзі`;
        }
        onlineState = "warn";
        onlineTone = "amber";
      } else {
        onlineText = "Немає бронювань";
        onlineState = "ok";
        onlineTone = "emerald";
      }
    }
  }

  function handleOpenOnlineBookings() {
    if (typeof onOpenOnlineBookings === "function") onOpenOnlineBookings();
  }

  return (
    <header className="sticky top-0 z-40">
      <div className="px-3 pt-3 pb-1">
        <motion.div
          layout
          className="pointer-events-auto w-full rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-slate-950/95 via-slate-900/95 to-emerald-950/95 px-3 md:px-4 py-2.5 md:py-3 shadow-[0_18px_45px_rgba(0,0,0,0.75),0_0_60px_rgba(52,211,153,0.15)] backdrop-blur-2xl relative overflow-hidden"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, type: "spring" }}
        >
          {/* Анімований фон з білярдною тематикою та текстурою "фетру" */}
          <div className="absolute inset-0 opacity-30">
            {/* Фетрова текстура */}
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage: `
                  repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(16,185,129,0.03) 2px, rgba(16,185,129,0.03) 4px),
                  repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(16,185,129,0.03) 2px, rgba(16,185,129,0.03) 4px)
                `,
              }}
            />
            {/* Анімовані радіальні градієнти */}
            <motion.div
              className="absolute inset-0"
              style={{
                background: `
                  radial-gradient(circle at 10% 20%, rgba(52,211,153,0.18), transparent 28%),
                  radial-gradient(circle at 90% 80%, rgba(34,197,94,0.15), transparent 32%),
                  radial-gradient(circle at 50% 50%, rgba(16,185,129,0.12), transparent 45%)
                `
              }}
              animate={{
                scale: [1, 1.05, 1],
                opacity: [0.8, 1, 0.8]
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          </div>

          {/* Світлова смуга зверху */}
          <motion.div
            className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
            animate={{
              opacity: [0.3, 0.8, 0.3],
              scaleX: [0.8, 1, 0.8]
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />

          {/* Анімовані білярдні кулі у фоні з відблисками */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Зелена куля (ліворуч-верх) */}
            <motion.div
              className="absolute w-10 h-10"
              style={{ top: '8%', left: '12%' }}
              animate={{
                x: [0, 35, -10, 0],
                y: [0, -25, 10, 0],
                rotate: [0, 180, 360]
              }}
              transition={{
                duration: 10,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <div className="w-full h-full rounded-full bg-gradient-to-br from-emerald-300 via-emerald-500 to-emerald-700 opacity-25 shadow-[0_4px_20px_rgba(52,211,153,0.4)]">
                <motion.div
                  className="absolute top-2 left-2 w-3 h-3 rounded-full bg-white/50 blur-sm"
                  animate={{ opacity: [0.4, 0.7, 0.4] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                />
              </div>
            </motion.div>

            {/* Ціанова куля (праворуч-середина) */}
            <motion.div
              className="absolute w-8 h-8"
              style={{ top: '55%', right: '18%' }}
              animate={{
                x: [0, -30, 15, 0],
                y: [0, 20, -10, 0],
                rotate: [0, -180, -360]
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 1.5
              }}
            >
              <div className="w-full h-full rounded-full bg-gradient-to-br from-cyan-300 via-cyan-500 to-cyan-700 opacity-20 shadow-[0_3px_15px_rgba(34,211,238,0.35)]">
                <motion.div
                  className="absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full bg-white/45 blur-[2px]"
                  animate={{ opacity: [0.35, 0.65, 0.35] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
            </motion.div>

            {/* Темно-зелена куля (ліворуч-низ) */}
            <motion.div
              className="absolute w-9 h-9"
              style={{ bottom: '12%', left: '65%' }}
              animate={{
                x: [0, 25, -15, 0],
                y: [0, -18, 8, 0],
                rotate: [0, 270, 360]
              }}
              transition={{
                duration: 9,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 3
              }}
            >
              <div className="w-full h-full rounded-full bg-gradient-to-br from-teal-300 via-teal-500 to-teal-800 opacity-22 shadow-[0_4px_18px_rgba(20,184,166,0.38)]">
                <motion.div
                  className="absolute top-2 left-2 w-2.5 h-2.5 rounded-full bg-white/48 blur-sm"
                  animate={{ opacity: [0.38, 0.68, 0.38] }}
                  transition={{ duration: 2.3, repeat: Infinity }}
                />
              </div>
            </motion.div>

            {/* Жовто-зелена куля (центр-праворуч) */}
            <motion.div
              className="absolute w-7 h-7"
              style={{ top: '30%', right: '40%' }}
              animate={{
                x: [0, -20, 20, 0],
                y: [0, 15, -15, 0],
                rotate: [0, 120, 240, 360]
              }}
              transition={{
                duration: 11,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 2
              }}
            >
              <div className="w-full h-full rounded-full bg-gradient-to-br from-lime-300 via-emerald-400 to-teal-600 opacity-18 shadow-[0_3px_16px_rgba(74,222,128,0.32)]">
                <motion.div
                  className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-white/42 blur-[1.5px]"
                  animate={{ opacity: [0.32, 0.62, 0.32] }}
                  transition={{ duration: 2.2, repeat: Infinity }}
                />
              </div>
            </motion.div>
          </div>
          <div className="relative z-10 flex flex-col gap-3">
            {/* Перший рядок: логотип · користувач | годинник | дії */}
            <div className="flex items-center gap-3">
              {/* Ліва зона */}
              <div className="flex min-w-0 items-center gap-3">
                <AppLogo />
                <div className="hidden sm:flex h-10 items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-950/40 px-3 text-xs md:text-sm text-emerald-100/90 backdrop-blur-sm">
                  <IconUser className="w-4 h-4 text-emerald-300/80" />
                  <span className="truncate max-w-[160px] md:max-w-[220px]">
                    {userLabel}
                  </span>
                  {role === "admin" && (
                    <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/30">
                      admin
                    </span>
                  )}
                </div>
              </div>

              {/* Центр: годинник */}
              <div className="hidden md:flex flex-1 justify-center">
                <Clock />
              </div>
              <div className="flex-1 md:hidden" />

              {/* Права зона: столи, версія, меню */}
              <div className="flex items-center gap-2">
                <div className="hidden md:flex items-center gap-2">
                  <GlassButton tone="emerald" onClick={onAddTable}>
                    <IconPlus className="w-4 h-4" />
                    <span>Стіл</span>
                  </GlassButton>
                  <GlassButton onClick={onRemoveTable}>
                    <IconMinus className="w-4 h-4" />
                    <span>Стіл</span>
                  </GlassButton>
                </div>

                {version && (
                  <span className="hidden lg:inline-flex h-10 items-center rounded-2xl border border-emerald-500/25 bg-emerald-950/40 px-3 text-[11px] font-medium text-emerald-200/70 backdrop-blur-sm">
                    v{version}
                  </span>
                )}

                <div className="mx-1 hidden md:block h-8 w-px bg-gradient-to-b from-transparent via-emerald-500/30 to-transparent" />

                <button
                  type="button"
                  onClick={handleOpenMenu}
                  onKeyDown={handleMenuKey}
                  title="Меню"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-100 shadow-sm shadow-black/40 backdrop-blur-sm transition-all duration-200 hover:bg-emerald-900/60 hover:border-emerald-400/50 hover:shadow-[0_0_18px_rgba(52,211,153,0.25)] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                >
                  <IconMenu className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Другий рядок: статуси */}
            <div className="flex flex-col gap-2 border-t border-emerald-500/15 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  icon="💡"
                  label="ESP / світло"
                  value={espIp ? `${espText} • ${espIp}` : espText}
                  tone="emerald"
                  state={espState}
                />
                <StatusPill
                  icon="💵"
                  label="Тариф"
                  value={tariffText}
                  tone="slate"
                  state={baseRate ? "ok" : "neutral"}
                />
                <StatusPill
                  icon="⏱"
                  label="Зміна"
                  value={shiftText}
                  tone={liveBadge ? "emerald" : "slate"}
                  state={liveBadge ? "ok" : "neutral"}
                />
                <StatusPill
                  icon="🖨"
                  label="Принтер"
                  value={printerInfo.text}
                  tone={printerInfo.tone}
                  state={printerInfo.state}
                />
                <StatusPill
                  icon="📅"
                  label="Бронювання"
                  value={bookingText}
                  tone={bookingTone}
                  state={bookingState}
                />

                {/* ✅ Онлайн бронювання (клікабельне) */}
                <StatusPill
                  icon="🌐"
                  label="Онлайн"
                  value={onlineText}
                  tone={onlineTone}
                  state={onlineState}
                  title={onlineTitle}
                  onClick={onlineServerUrl ? handleOpenOnlineBookings : undefined}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <LicenseWarning info={licenseInfo} />
    </header>
  );
}
