// src/components/ReservationsTicker.jsx
// Відновлено за v3.9.2: компактний віджет бронювань у правому нижньому куті,
// звукові сповіщення (за 10 хв — сигнал, за 5 хв — модалка з повторним звуком),
// підтвердження старту гри для заброньованого столу.
import React from "react";
import { createPortal } from "react-dom";
import { useReservations, RES_STATUSES } from "../hooks/useReservations";
import { useTicker } from "../hooks/useTicker";

const UI_RES_TICKER_COLLAPSED = "UI_RES_TICKER_COLLAPSED_V2";
const RES_NOTIFY_STATE = "RES_NOTIFY_STATE_V3";
const SOUND_NOTIFY_MS = 10 * 60_000; // за 10 хв — короткий сигнал
const MODAL_NOTIFY_MS = 5 * 60_000; // за 5 хв — модалка
const START_REPROMPT_MS = 10 * 60_000; // повторне питання «стіл вже грає?»
const MODAL_SOUND_REPEAT_MS = 5000; // повтор сигналу, поки модалку не закрито

function loadNotifyState() {
  try {
    const raw = localStorage.getItem(RES_NOTIFY_STATE);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function saveNotifyState(state) {
  try {
    localStorage.setItem(RES_NOTIFY_STATE, JSON.stringify(state || {}));
  } catch {}
}

/* ---------- іконки ---------- */
const svgBase = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" };
const IconClock = () => (
  <svg {...svgBase} width="16" height="16" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconBell = () => (
  <svg {...svgBase} width="18" height="18" strokeWidth="2">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
const IconChevronDown = () => (
  <svg {...svgBase} width="14" height="14" strokeWidth="2.5">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const IconChevronUp = () => (
  <svg {...svgBase} width="14" height="14" strokeWidth="2.5">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);
const IconCalendar = () => (
  <svg {...svgBase} width="14" height="14" strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const fmtCountdown = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
const fmtTime = (ts) => new Date(ts).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
const namesOf = (r) => [r?.customer1Name, r?.customer2Name].filter(Boolean).join(" & ") || "Без імені";

/* ---------- Модалка «Бронювання через 5 хв» ---------- */
function UpcomingModal({ reservation, tableName, onOk, onReschedule, onCancel, timeLeft }) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-[420px] max-w-[95vw] animate-in zoom-in-95 fade-in">
        <div className="rounded-[28px] border border-amber-400/30 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 shadow-[0_25px_80px_rgba(0,0,0,0.7),0_0_40px_rgba(251,191,36,0.15)] overflow-hidden">
          <div className="relative px-6 pt-6 pb-4">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500" />
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 flex items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 ring-2 ring-amber-400/30 animate-pulse">
                <IconBell />
              </div>
              <div>
                <h3 className="text-lg font-bold text-amber-100">Бронювання через 5 хв</h3>
                <p className="text-sm text-amber-200/70">Підготуйте стіл для гостей</p>
              </div>
            </div>
          </div>
          <div className="px-6 pb-4">
            <div className="rounded-2xl border border-amber-400/20 bg-amber-950/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-amber-100">
                  <span className="text-xl">🎱</span>
                  <span className="font-semibold">{tableName}</span>
                </div>
                <div className="flex items-center gap-1.5 text-amber-300 font-mono text-lg font-bold">
                  <IconClock />
                  {fmtCountdown(timeLeft)}
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-amber-100/60">Клієнт:</span>
                  <span className="text-amber-100 font-medium">{namesOf(reservation)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-amber-100/60">Час:</span>
                  <span className="text-amber-100 font-medium">
                    {fmtTime(reservation.startAt)} — {fmtTime(reservation.endAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="px-6 pb-6">
            <div className="flex gap-3">
              <button
                onClick={onOk}
                className="flex-1 h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-500/30 hover:from-emerald-500 hover:to-emerald-400 transition-all active:scale-[0.98]"
              >
                Ок
              </button>
              <button
                onClick={onReschedule}
                className="flex-1 h-12 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-200 font-semibold text-sm hover:bg-amber-500/30 hover:text-amber-100 transition-all active:scale-[0.98]"
              >
                Перенести
              </button>
              <button
                onClick={onCancel}
                className="flex-1 h-12 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-200 font-semibold text-sm hover:bg-rose-500/30 hover:text-rose-100 transition-all active:scale-[0.98]"
              >
                Відхилити
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function ReservationsTicker({
  tables = [],
  onOpenReservations,
  onRescheduleReservation,
  soonWithinMins = 30,
}) {
  useTicker(true, 1000);

  // перерендер при зміні бронювань
  const [, bump] = React.useState(0);
  React.useEffect(() => {
    const onChanged = () => bump((v) => v + 1);
    window.addEventListener("reservations:changed", onChanged);
    return () => window.removeEventListener("reservations:changed", onChanged);
  }, []);

  const { list = [], cancel } = useReservations();
  const [notifyState, setNotifyState] = React.useState(() => loadNotifyState());
  const [modal, setModal] = React.useState(null); // { reservation, tableName, timeLeft }
  const audioCtxRef = React.useRef(null);
  const modalSoundTimerRef = React.useRef(null);

  /* ---------- звуки ---------- */
  const playPreSound = React.useCallback(() => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const t0 = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      const beep = (at, freq) => {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.setValueAtTime(freq, at);
        osc.connect(gain);
        gain.gain.setValueAtTime(0.001, at);
        gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
        osc.start(at);
        osc.stop(at + 0.2);
      };
      beep(t0, 880);
      beep(t0 + 0.28, 740);
      beep(t0 + 0.56, 880);
    } catch {}
  }, []);

  const playModalSound = React.useCallback(() => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const t0 = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      const tone = (at, freq, dur = 0.12) => {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, at);
        osc.connect(gain);
        gain.gain.setValueAtTime(0.001, at);
        gain.gain.exponentialRampToValueAtTime(0.4, at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, at + dur - 0.02);
        osc.start(at);
        osc.stop(at + dur);
      };
      tone(t0, 660, 0.1);
      tone(t0 + 0.12, 880, 0.1);
      tone(t0 + 0.24, 1100, 0.1);
      tone(t0 + 0.36, 880, 0.1);
      tone(t0 + 0.48, 1100, 0.15);
      tone(t0 + 0.7, 1320, 0.2);
    } catch {}
  }, []);

  const stopModalSound = React.useCallback(() => {
    if (modalSoundTimerRef.current) {
      clearInterval(modalSoundTimerRef.current);
      modalSoundTimerRef.current = null;
    }
  }, []);

  const startModalSound = React.useCallback(() => {
    stopModalSound();
    playModalSound();
    modalSoundTimerRef.current = setInterval(() => playModalSound(), MODAL_SOUND_REPEAT_MS);
  }, [playModalSound, stopModalSound]);

  React.useEffect(() => () => stopModalSound(), [stopModalSound]);
  React.useEffect(() => {
    saveNotifyState(notifyState);
  }, [notifyState]);

  const now = Date.now();
  const safe = React.useMemo(() => (Array.isArray(list) ? list.filter(Boolean) : []), [list]);

  const tableNameOf = (tableId) => {
    const t = (tables || []).find((x) => Number(x?.id) === Number(tableId));
    return t && t.name ? t.name : `Стіл №${(tableId ?? 0) + 1}`;
  };

  const endOfDay = (() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  })();
  const soonHorizon = now + soonWithinMins * 60_000;

  // Йдуть зараз
  const ongoing = React.useMemo(
    () =>
      safe
        .filter((r) => r && r.status !== RES_STATUSES.CANCELLED)
        .filter((r) => {
          const s = new Date(r.startAt).getTime();
          const e = new Date(r.endAt).getTime();
          if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
          return r.status === RES_STATUSES.IN_PROGRESS || (s <= now && now < e);
        })
        .sort((a, b) => new Date(a.endAt) - new Date(b.endAt)),
    [safe, now]
  );

  // Почнуться протягом soonWithinMins
  const upcoming = React.useMemo(
    () =>
      safe
        .filter((r) => r && r.status === RES_STATUSES.BOOKED)
        .filter((r) => {
          const s = new Date(r.startAt).getTime();
          return Number.isFinite(s) && s > now && s <= soonHorizon;
        })
        .sort((a, b) => new Date(a.startAt) - new Date(b.startAt)),
    [safe, now, soonWithinMins]
  );

  // Почнуться пізніше сьогодні
  const laterToday = React.useMemo(
    () =>
      safe
        .filter((r) => r && r.status === RES_STATUSES.BOOKED)
        .filter((r) => {
          const s = new Date(r.startAt).getTime();
          return Number.isFinite(s) && s > soonHorizon && s <= endOfDay;
        })
        .sort((a, b) => new Date(a.startAt) - new Date(b.startAt)),
    [safe, now, soonWithinMins, soonHorizon, endOfDay]
  );

  const total = ongoing.length + upcoming.length + laterToday.length;

  const [collapsed, setCollapsed] = React.useState(() => {
    try {
      return localStorage.getItem(UI_RES_TICKER_COLLAPSED) === "1";
    } catch {
      return false;
    }
  });
  React.useEffect(() => {
    try {
      localStorage.setItem(UI_RES_TICKER_COLLAPSED, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  /* ---------- сповіщення: 10 хв — звук, 5 хв — модалка, старт — питання ---------- */
  React.useEffect(() => {
    setNotifyState((prev) => {
      let changed = false;
      const next = { ...(prev || {}) };
      const activeIds = new Set();

      safe.forEach((r) => {
        if (!r || r.status === RES_STATUSES.CANCELLED || r.status === RES_STATUSES.COMPLETED) return;
        const startMs = new Date(r.startAt).getTime();
        const endMs = new Date(r.endAt).getTime();
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || now > endMs + 60_000) return;

        const id = String(r.id);
        activeIds.add(id);
        const entry = next[id] || {};

        // за 10 хв — короткий сигнал
        const soundAt = startMs - SOUND_NOTIFY_MS;
        if (now >= soundAt && now < startMs - MODAL_NOTIFY_MS && !entry.soundNotifiedAt) {
          next[id] = { ...entry, soundNotifiedAt: now };
          changed = true;
          playPreSound();
        }

        // за 5 хв — модалка
        const modalAt = startMs - MODAL_NOTIFY_MS;
        if (now >= modalAt && now < startMs && !entry.modalShownAt) {
          next[id] = { ...entry, modalShownAt: now };
          changed = true;
          startModalSound();
          setModal({ reservation: r, tableName: tableNameOf(r.tableId), timeLeft: startMs - now });
        }

        // старт — «стіл вже грає?»
        const nextPromptAt = typeof entry.nextStartPromptAt === "number" ? entry.nextStartPromptAt : startMs;
        if (
          !entry.startAcknowledged &&
          now >= startMs &&
          now < endMs &&
          now >= nextPromptAt &&
          entry.lastStartPromptAt !== nextPromptAt
        ) {
          next[id] = { ...entry, lastStartPromptAt: nextPromptAt };
          changed = true;
          playPreSound();
        }
      });

      Object.keys(next).forEach((id) => {
        if (!activeIds.has(id)) {
          delete next[id];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [safe, now, playPreSound, startModalSound, tables]);

  // оновлення таймера в модалці / автозакриття після старту
  React.useEffect(() => {
    if (!modal) return;
    const left = new Date(modal.reservation.startAt).getTime() - now;
    if (left <= 0) setModal(null);
    else if (Math.abs(left - modal.timeLeft) > 500) setModal((m) => (m ? { ...m, timeLeft: left } : null));
  }, [modal, now]);

  const alerts = React.useMemo(() => {
    const out = [];
    safe.forEach((r) => {
      if (!r || r.status === RES_STATUSES.CANCELLED || r.status === RES_STATUSES.COMPLETED) return;
      const startMs = new Date(r.startAt).getTime();
      const endMs = new Date(r.endAt).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
      const entry = notifyState[String(r.id)] || {};

      // «Скоро» показуємо у віджеті лише після закриття модалки
      if (now >= startMs - MODAL_NOTIFY_MS && now < startMs && entry.modalDismissed) {
        out.push({ type: "pre", r, startMs, endMs });
      }
      const nextPromptAt = typeof entry.nextStartPromptAt === "number" ? entry.nextStartPromptAt : startMs;
      if (!entry.startAcknowledged && now >= startMs && now < endMs && now >= nextPromptAt) {
        out.push({ type: "start", r, startMs, endMs });
      }
    });
    return out.sort((a, b) => a.startMs - b.startMs);
  }, [safe, now, notifyState]);

  /* ---------- дії модалки ---------- */
  const modalOk = () => {
    stopModalSound();
    if (modal) {
      const id = String(modal.reservation.id);
      setNotifyState((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), modalDismissed: true } }));
    }
    setModal(null);
  };
  const modalReschedule = () => {
    stopModalSound();
    if (modal && typeof onRescheduleReservation === "function") onRescheduleReservation(modal.reservation.id);
    modalOk();
  };
  const modalCancel = () => {
    stopModalSound();
    if (modal && typeof cancel === "function") cancel(modal.reservation.id);
    setModal(null);
  };

  if (!total && alerts.length === 0 && !modal) return null;

  const summaryParts = [];
  if (ongoing.length) summaryParts.push(`Йде: ${ongoing.length}`);
  if (upcoming.length) summaryParts.push(`Скоро: ${upcoming.length}`);
  if (laterToday.length) summaryParts.push(`Пізніше: ${laterToday.length}`);
  const summaryText = summaryParts.join(" • ");

  /* ---------- дії у віджеті ---------- */
  const handleStartYes = (id) => {
    const key = String(id);
    setNotifyState((prev) => {
      const next = { ...(prev || {}) };
      next[key] = { ...(next[key] || {}), startAcknowledged: true };
      return next;
    });
  };
  const handleStartNo = (id) => {
    const key = String(id);
    const nextAt = Date.now() + START_REPROMPT_MS;
    setNotifyState((prev) => {
      const next = { ...(prev || {}) };
      next[key] = { ...(next[key] || {}), nextStartPromptAt: nextAt, lastStartPromptAt: null };
      return next;
    });
  };
  const handleReschedule = (id) => {
    if (typeof onRescheduleReservation === "function") onRescheduleReservation(id);
  };
  const handleCancel = (id) => {
    if (typeof cancel === "function") cancel(id);
  };

  return (
    <>
      {modal && (
        <UpcomingModal
          reservation={modal.reservation}
          tableName={modal.tableName}
          timeLeft={modal.timeLeft}
          onOk={modalOk}
          onReschedule={modalReschedule}
          onCancel={modalCancel}
        />
      )}

      <div className="fixed right-4 bottom-4 z-30 w-[340px] max-w-[88vw]">
        <div className="rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-[#0a1f1a] via-[#0d2818] to-[#0a1a14] shadow-[0_20px_60px_rgba(0,0,0,0.8),0_0_30px_rgba(16,185,129,0.15),inset_0_1px_0_rgba(52,211,153,0.1)] overflow-hidden">
          {/* фетрова текстура */}
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              backgroundImage: `
                repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(52,211,153,0.03) 2px, rgba(52,211,153,0.03) 4px),
                repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(52,211,153,0.03) 2px, rgba(52,211,153,0.03) 4px)
              `,
            }}
          />

          {/* Шапка */}
          <div
            className="relative px-3 py-2.5 cursor-pointer hover:bg-emerald-800/20 transition-colors border-b border-emerald-500/20"
            onClick={() => setCollapsed((v) => !v)}
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="relative h-8 w-8 flex items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600/40 to-emerald-700/30 text-emerald-300 ring-1 ring-emerald-400/40 shadow-lg shadow-emerald-900/50">
                  <IconCalendar />
                  {total > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 h-4 w-4 flex items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white shadow-lg shadow-emerald-500/50 ring-2 ring-emerald-900">
                      {total}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-100 tracking-wide">Бронювання</span>
                    <span className="text-[10px] text-emerald-300/70 font-medium">{summaryText}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <div
                  className="h-6 w-6 flex items-center justify-center rounded-lg bg-emerald-800/40 text-emerald-300 hover:bg-emerald-700/50 hover:text-emerald-200 transition-colors"
                  title={collapsed ? "Розгорнути" : "Згорнути"}
                >
                  {collapsed ? <IconChevronUp /> : <IconChevronDown />}
                </div>
              </div>
            </div>
          </div>

          {/* Сповіщення */}
          {alerts.length > 0 && (
            <div className="relative px-3 py-2 space-y-1.5">
              {alerts.map((alert) => {
                const r = alert.r;
                const id = String(r.id);
                const isStart = alert.type === "start";
                const startLeft = alert.startMs - now;
                return (
                  <div
                    key={`${alert.type}-${id}`}
                    className={`rounded-xl border-2 p-2.5 ${
                      isStart
                        ? "border-emerald-500/50 bg-gradient-to-r from-emerald-900/60 to-emerald-800/40"
                        : "border-amber-500/50 bg-gradient-to-r from-amber-900/60 to-amber-800/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold shadow-sm ${
                            isStart ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                          }`}
                        >
                          {isStart ? "Старт" : "Скоро"}
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-100 truncate">{tableNameOf(r.tableId)}</span>
                        <span className="text-[10px] text-emerald-200/70 truncate">{namesOf(r)}</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded shrink-0">
                        {isStart ? fmtTime(alert.startMs) : fmtCountdown(startLeft)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {isStart && (
                        <>
                          <button
                            className="h-6 px-3 rounded-lg bg-emerald-500 text-white text-[10px] font-bold hover:bg-emerald-400 transition-colors shadow-md shadow-emerald-900/50"
                            onClick={() => handleStartYes(id)}
                          >
                            Так
                          </button>
                          <button
                            className="h-6 px-3 rounded-lg bg-emerald-800/60 text-emerald-100 border border-emerald-600/40 text-[10px] font-medium hover:bg-emerald-700/60 transition-colors"
                            onClick={() => handleStartNo(id)}
                          >
                            Ні
                          </button>
                        </>
                      )}
                      <button
                        className="h-6 px-3 rounded-lg bg-amber-600/30 text-amber-200 border border-amber-500/40 text-[10px] font-medium hover:bg-amber-600/50 transition-colors"
                        onClick={() => handleReschedule(id)}
                      >
                        Перенести
                      </button>
                      <button
                        className="h-6 px-3 rounded-lg bg-rose-600/30 text-rose-200 border border-rose-500/40 text-[10px] font-medium hover:bg-rose-600/50 transition-colors"
                        onClick={() => handleCancel(id)}
                      >
                        Скасувати
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Списки */}
          {!collapsed && (
            <div className="relative px-3 pb-3 space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
              {ongoing.length > 0 && (
                <Block title="Зараз грають" tone="emerald">
                  {ongoing.slice(0, 3).map((r) => {
                    const left = new Date(r.endAt).getTime() - now;
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-2 py-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[11px] font-semibold text-emerald-100 truncate">{namesOf(r)}</span>
                          <span className="text-[10px] text-emerald-300/70">{tableNameOf(r.tableId)}</span>
                        </div>
                        <span className="font-mono text-[10px] text-emerald-200 bg-emerald-600/40 px-1.5 py-0.5 rounded shrink-0">
                          {fmtCountdown(left)}
                        </span>
                      </div>
                    );
                  })}
                  {ongoing.length > 3 && (
                    <div className="text-[10px] text-emerald-400/80 font-medium">+{ongoing.length - 3} ще</div>
                  )}
                </Block>
              )}

              {upcoming.length > 0 && (
                <Block title={`Скоро (${soonWithinMins} хв)`} tone="sky">
                  {upcoming.slice(0, 3).map((r) => {
                    const left = new Date(r.startAt).getTime() - now;
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-2 py-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[11px] font-semibold text-sky-100 truncate">{namesOf(r)}</span>
                          <span className="text-[10px] text-sky-300/70">{tableNameOf(r.tableId)}</span>
                        </div>
                        <span className="font-mono text-[10px] text-sky-200 bg-sky-600/40 px-1.5 py-0.5 rounded shrink-0">
                          {fmtCountdown(left)}
                        </span>
                      </div>
                    );
                  })}
                  {upcoming.length > 3 && (
                    <div className="text-[10px] text-sky-400/80 font-medium">+{upcoming.length - 3} ще</div>
                  )}
                </Block>
              )}

              {laterToday.length > 0 && (
                <Block title="Пізніше" tone="slate">
                  {laterToday.slice(0, 2).map((r) => {
                    const d = new Date(r.startAt);
                    const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-2 py-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[11px] font-semibold text-slate-200 truncate">{namesOf(r)}</span>
                          <span className="text-[10px] text-slate-400/70">{tableNameOf(r.tableId)}</span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-300 bg-slate-600/40 px-1.5 py-0.5 rounded shrink-0">
                          {hhmm}
                        </span>
                      </div>
                    );
                  })}
                  {laterToday.length > 2 && (
                    <div className="text-[10px] text-slate-400/80 font-medium">+{laterToday.length - 2} ще</div>
                  )}
                </Block>
              )}

              <button
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600/40 hover:bg-emerald-500/50 text-emerald-100 px-3 py-2.5 text-[11px] font-bold transition-colors border border-emerald-500/40 shadow-md shadow-emerald-900/30"
                onClick={onOpenReservations}
              >
                <IconCalendar />
                Всі бронювання
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Block({ title, children, tone = "slate" }) {
  const border = tone === "emerald" ? "border-emerald-500/20" : tone === "sky" ? "border-sky-500/20" : "border-slate-500/20";
  const text = tone === "emerald" ? "text-emerald-400" : tone === "sky" ? "text-sky-400" : "text-slate-400";
  return (
    <div className={`rounded-lg border ${border} bg-black/20 p-2`}>
      <div className={`text-[10px] font-semibold ${text} mb-1 uppercase tracking-wide`}>{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
