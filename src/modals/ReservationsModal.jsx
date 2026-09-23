// src/modals/ReservationsModal.jsx
// Дизайн відновлено з v3.9.2: таймлайн у смарагдовій темі, навігація по днях,
// клік по таймлайну створює бронювання, швидке бронювання, список на день.
import React, { useEffect, useMemo, useRef, useState } from "react";
import ModalShell from "../components/ModalShell";
import { useReservations } from "../hooks/useReservations";
import { getMonthMatrix, isSameDay } from "./reservations/reservationUtils";
import ReservationForm from "./reservations/ReservationForm";
import "../styles/reservations.css";

/* -------------------- helpers -------------------- */

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

const DAY_MIN_START = 0;
const DAY_MIN_END = 24 * 60;
const CELL_MINUTES = 30; // крок сітки
const CELL_PX = 56; // ширина однієї клітинки по часу
const QUICK_DURATIONS = [30, 60, 90, 120, 180];
const QUICK_START_MIN = 19 * 60; // швидке бронювання — від 19:00

function minutesBetween(dayStart, date) {
  return Math.round((date.getTime() - dayStart.getTime()) / 60000);
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function formatTimeRange(start, end) {
  const opts = { hour: "2-digit", minute: "2-digit" };
  return start.toLocaleTimeString("uk-UA", opts) + " — " + end.toLocaleTimeString("uk-UA", opts);
}
function fmtDuration(m) {
  return m >= 60 ? `${m / 60} год` : `${m} хв`;
}

/* -------------------- іконки -------------------- */
const svg14 = {
  width: "14",
  height: "14",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
const IconPrev = () => (
  <svg {...svg14} width="16" height="16" strokeWidth="2.5">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const IconNext = () => (
  <svg {...svg14} width="16" height="16" strokeWidth="2.5">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const IconCalendar = () => (
  <svg {...svg14}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const IconSearch = () => (
  <svg {...svg14}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const IconClock = () => (
  <svg {...svg14}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconTable = ({ className }) => (
  <svg {...svg14} className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18" />
    <path d="M9 21V9" />
  </svg>
);
const IconPlus = () => (
  <svg {...svg14} strokeWidth="2.5">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const navBtnCls =
  "h-9 w-9 rounded-xl border border-emerald-500/30 bg-emerald-950/50 flex items-center justify-center text-emerald-300 hover:bg-emerald-900/60 hover:text-emerald-200 transition-all";
const monthBtnCls =
  "h-8 w-8 rounded-lg border border-emerald-500/40 bg-gradient-to-br from-emerald-900/60 to-emerald-950/60 flex items-center justify-center text-emerald-300 hover:from-emerald-800/70 hover:to-emerald-900/70 hover:text-emerald-200 transition-all shadow-md";
const panelCls =
  "rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-slate-900/90 via-emerald-950/60 to-slate-900/90 shadow-[inset_0_2px_15px_rgba(0,0,0,0.3)]";

export default function ReservationsModal({
  open,
  onClose,
  tables = [],
  clients = [],
  editorReservationId = null,
  onConsumeEditorRequest,
}) {
  const { list, create, update, remove, syncOnline } = useReservations();

  const [nowTick, setNowTick] = useState(Date.now());
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [tableFilter, setTableFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState({ open: false, initial: null });
  const lastEditorIdRef = useRef(null);

  // оновлюємо "зараз" раз у хвилину — для лінії "зараз" на таймлайні
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const now = new Date(nowTick);
  const dayStart = useMemo(() => startOfDay(selectedDate), [selectedDate]);
  const dayEnd = useMemo(() => endOfDay(selectedDate), [selectedDate]);

  // при відкритті модалки тягнемо онлайн-броні
  useEffect(() => {
    if (open && typeof syncOnline === "function") syncOnline();
  }, [open, syncOnline]);

  // відкрити редактор конкретної броні за запитом ззовні (напр., з тикера)
  useEffect(() => {
    if (!open || !editorReservationId) return;
    if (lastEditorIdRef.current === editorReservationId) return;
    const found = (list || []).find((r) => r && r.id === editorReservationId);
    if (!found) return;
    setEditor({ open: true, initial: found });
    lastEditorIdRef.current = editorReservationId;
    if (typeof onConsumeEditorRequest === "function") onConsumeEditorRequest();
  }, [open, editorReservationId, list, onConsumeEditorRequest]);

  useEffect(() => {
    if (!open || !editorReservationId) lastEditorIdRef.current = null;
  }, [open, editorReservationId]);

  // нормалізуємо записи + фільтр по дню та пошуку
  const dayReservations = useMemo(() => {
    const qq = query.trim().toLowerCase();
    return (list || [])
      .map((r) => ({ ...r, _start: new Date(r.startAt), _end: new Date(r.endAt) }))
      .filter((r) => r._start < dayEnd && r._end > dayStart)
      .filter((r) => {
        if (!qq) return true;
        const code = (r.code || String(r.id || "")).toLowerCase();
        const name = (r.customer1Name || r.customerName || "").toLowerCase();
        const notes = (r.note || r.notes || "").toLowerCase();
        return code.includes(qq) || name.includes(qq) || notes.includes(qq);
      });
  }, [list, dayStart, dayEnd, query]);

  // мапа: tableId -> масив бронювань
  const byTable = useMemo(() => {
    const map = new Map();
    for (const r of dayReservations) {
      const key = r.tableId ?? 0;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return map;
  }, [dayReservations]);

  const filteredForSidebar = useMemo(() => {
    if (tableFilter === "all") return dayReservations;
    const id = Number(tableFilter);
    return dayReservations.filter((r) => Number(r.tableId) === id);
  }, [dayReservations, tableFilter]);

  const filterTable =
    tableFilter === "all" ? null : (tables || []).find((t) => String(t.id) === String(tableFilter)) || null;

  /* -------------------- редактор -------------------- */
  function openEditorAt(tableId, startMin, durationMin) {
    const base = startOfDay(selectedDate);
    const start = new Date(base.getTime() + startMin * 60000);
    const end = new Date(start.getTime() + durationMin * 60000);
    setEditor({ open: true, initial: { tableId, startAt: start, endAt: end } });
  }
  function quickBook(durationMin) {
    const tableId = filterTable?.id || (tables[0] ? tables[0].id : 0);
    openEditorAt(tableId, QUICK_START_MIN, durationMin);
  }
  function handleSave(payload) {
    if (payload.id) update(payload.id, payload);
    else create(payload);
    setEditor({ open: false, initial: null });
  }
  function handleDelete(payload) {
    remove(payload.id);
    setEditor({ open: false, initial: null });
  }

  /* -------------------- календар / навігація -------------------- */
  const monthMatrix = useMemo(() => getMonthMatrix(selectedDate), [selectedDate]);
  function prevDay() {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(startOfDay(d));
  }
  function nextDay() {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(startOfDay(d));
  }
  function goToday() {
    setSelectedDate(startOfDay(new Date()));
  }
  function shiftMonth(delta) {
    const d = new Date(selectedDate);
    d.setMonth(d.getMonth() + delta);
    setSelectedDate(startOfDay(d));
  }

  const dateLabel = selectedDate.toLocaleDateString("uk-UA", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const isToday = isSameDay(selectedDate, now);

  /* -------------------- таймлайн -------------------- */
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const cellsCount = (DAY_MIN_END - DAY_MIN_START) / CELL_MINUTES;
  const timelineWidth = cellsCount * CELL_PX;
  const nowLeft =
    (((isToday ? clamp(minutesBetween(dayStart, now), DAY_MIN_START, DAY_MIN_END) : 0) - DAY_MIN_START) /
      CELL_MINUTES) *
    CELL_PX;

  function handleTimelineClick(e, tableId) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const minutes = DAY_MIN_START + (x / timelineWidth) * (DAY_MIN_END - DAY_MIN_START);
    const snapped = Math.round(minutes / CELL_MINUTES) * CELL_MINUTES;
    openEditorAt(tableId, snapped, 60);
  }

  return (
    <>
      <ModalShell
        open={open}
        onClose={onClose}
        title="Бронювання"
        containerStyle={{ width: "1320px", maxWidth: "95vw", height: "860px", maxHeight: "90vh" }}
      >
        <div className="flex flex-col h-full gap-4">
          {/* Верхня панель: навігація по днях + фільтр + пошук */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <button className={navBtnCls} onClick={prevDay} title="Попередній день">
                  <IconPrev />
                </button>
                <button className={navBtnCls} onClick={nextDay} title="Наступний день">
                  <IconNext />
                </button>
              </div>
              <div className="text-sm font-semibold text-emerald-100 capitalize">{dateLabel}</div>
              <button
                className={`h-8 px-4 rounded-xl text-xs font-semibold transition-all ${
                  isToday
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                    : "border border-emerald-500/30 bg-emerald-950/50 text-emerald-300 hover:bg-emerald-900/60"
                }`}
                onClick={goToday}
              >
                Сьогодні
              </button>
              <div className="text-[11px] text-emerald-400/60 ml-2">Клік по таймлайну — створити бронювання</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <IconTable className="text-emerald-400" />
                <select
                  className="h-9 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/60 text-emerald-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                >
                  <option value="all">Всі столи</option>
                  {(tables || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || `Стіл №${t.id}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <input
                  className="h-9 w-56 pl-10 pr-3 rounded-xl border border-emerald-500/30 bg-emerald-950/60 text-emerald-100 text-sm placeholder-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  placeholder="Пошук..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400/60 pointer-events-none">
                  <IconSearch />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-1 min-h-0 gap-4">
            {/* Таймлайн */}
            <div className="flex-1 min-w-0">
              <div className="h-full rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-slate-900/90 via-emerald-950/60 to-slate-900/90 shadow-[inset_0_2px_20px_rgba(0,0,0,0.4),0_4px_20px_rgba(0,0,0,0.3)] overflow-hidden">
                <div className="w-full h-full overflow-x-auto overflow-y-auto custom-scrollbar">
                  <div className="inline-block align-top min-h-[280px]" style={{ minWidth: timelineWidth + 140 }}>
                    {/* Шапка з годинами */}
                    <div className="flex border-b-2 border-emerald-500/30 sticky top-0 z-10 bg-gradient-to-r from-emerald-900/90 via-slate-900/95 to-emerald-900/90 backdrop-blur-md shadow-lg">
                      <div className="w-36 shrink-0 px-4 py-3 text-[11px] font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-2">
                        <IconTable className="text-emerald-400" />
                        Стіл
                      </div>
                      <div className="relative flex" style={{ width: timelineWidth }}>
                        {hours.map((h) => (
                          <div
                            key={h}
                            style={{ width: CELL_PX * (60 / CELL_MINUTES) }}
                            className="text-center py-3 text-[11px] font-semibold text-emerald-200/80 border-l border-emerald-500/20 first:border-l-0"
                          >
                            {String(h).padStart(2, "0")}:00
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Рядки столів */}
                    {(tables || []).map((t, idx) => {
                      if (tableFilter !== "all" && String(tableFilter) !== String(t.id)) return null;
                      const rows = byTable.get(t.id) || [];
                      return (
                        <div
                          key={t.id}
                          className={`flex border-b border-emerald-500/20 transition-all duration-200 group ${
                            idx % 2 === 0
                              ? "bg-gradient-to-r from-slate-900/60 via-emerald-950/40 to-slate-900/60"
                              : "bg-gradient-to-r from-emerald-950/50 via-slate-900/50 to-emerald-950/50"
                          } hover:from-emerald-900/40 hover:via-emerald-800/30 hover:to-emerald-900/40`}
                        >
                          <div className="w-36 shrink-0 px-3 py-2 flex items-center gap-3 border-r border-emerald-500/20 bg-gradient-to-r from-emerald-900/40 to-transparent">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600/40 to-emerald-800/40 border border-emerald-500/30 flex items-center justify-center shadow-inner">
                              <span className="text-base">🎱</span>
                            </div>
                            <span className="text-sm font-semibold text-emerald-100 group-hover:text-emerald-50 transition-colors">
                              {t.name || `Стіл №${t.id}`}
                            </span>
                          </div>
                          <div
                            className="relative h-14 cursor-crosshair group-hover:bg-emerald-500/5 transition-colors"
                            style={{ width: timelineWidth }}
                            onClick={(e) => handleTimelineClick(e, t.id)}
                          >
                            {/* сітка */}
                            <div className="absolute inset-0 flex pointer-events-none">
                              {Array.from({ length: cellsCount }, (_, i) => (
                                <div
                                  key={i}
                                  style={{ width: CELL_PX }}
                                  className={`h-full border-l ${
                                    i % 2 === 0 ? "border-emerald-400/20" : "border-emerald-500/10"
                                  } ${i === 0 ? "border-l-transparent" : ""}`}
                                />
                              ))}
                            </div>

                            {/* лінія «зараз» */}
                            {isToday && (
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-gradient-to-b from-rose-500 via-rose-400 to-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] pointer-events-none z-10"
                                style={{ left: nowLeft }}
                              >
                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-rose-500 shadow-lg" />
                              </div>
                            )}

                            {/* бронювання */}
                            {rows.map((r) => {
                              const sMin = clamp(minutesBetween(dayStart, r._start), DAY_MIN_START, DAY_MIN_END);
                              const eMin = clamp(minutesBetween(dayStart, r._end), DAY_MIN_START, DAY_MIN_END);
                              const left = ((sMin - DAY_MIN_START) / CELL_MINUTES) * CELL_PX;
                              const width = Math.max(24, ((eMin - sMin) / CELL_MINUTES) * CELL_PX);
                              const isOnline = r.source === "online";
                              const isPast = r._end < now;
                              const isActive = r._start <= now && now < r._end;
                              const cls = isPast
                                ? "bg-gradient-to-r from-slate-700/70 to-slate-600/70 border border-slate-500/40 text-slate-200 shadow-md"
                                : isActive
                                  ? "bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 border-2 border-emerald-300/70 text-white shadow-[0_4px_20px_rgba(52,211,153,0.5)] animate-pulse"
                                  : isOnline
                                    ? "bg-gradient-to-r from-sky-600 via-sky-500 to-sky-600 border border-sky-400/60 text-white shadow-[0_4px_16px_rgba(56,189,248,0.4)]"
                                    : "bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 border border-amber-400/60 text-white shadow-[0_4px_16px_rgba(245,158,11,0.4)]";
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  className={`absolute top-[6px] h-[42px] rounded-xl flex items-center gap-2 px-3 overflow-hidden transition-all duration-200 hover:scale-[1.03] hover:z-20 ${cls}`}
                                  style={{ left, width }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditor({ open: true, initial: r });
                                  }}
                                >
                                  <span className="truncate text-[11px] font-semibold drop-shadow-sm">
                                    {r.customer1Name || r.customerName || "Без імені"}
                                  </span>
                                  {isOnline && (
                                    <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-white/25 text-[9px] font-bold uppercase shadow-inner">
                                      Online
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Права колонка */}
            <div className="w-[340px] shrink-0 flex flex-col gap-3">
              {/* Календар */}
              <div className={`${panelCls} p-4`}>
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-emerald-500/20">
                  <div className="text-sm font-bold text-emerald-100 capitalize tracking-wide">
                    {selectedDate.toLocaleString("uk-UA", { month: "long", year: "numeric" })}
                  </div>
                  <div className="flex gap-1">
                    <button className={monthBtnCls} onClick={() => shiftMonth(-1)}>
                      <IconPrev />
                    </button>
                    <button className={monthBtnCls} onClick={() => shiftMonth(1)}>
                      <IconNext />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 text-[11px] text-emerald-300/70 mb-2 font-semibold">
                  {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((d) => (
                    <div key={d} className="h-7 flex items-center justify-center">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {monthMatrix.map((d, i) => {
                    const selected = isSameDay(d, selectedDate);
                    const today = isSameDay(d, now);
                    const inMonth = d.getMonth() === selectedDate.getMonth();
                    const hasUpcoming = (list || []).some((r) => {
                      const s = new Date(r.startAt);
                      const e = new Date(r.endAt);
                      return isSameDay(s, d) && e >= now;
                    });
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`h-8 w-8 mx-auto rounded-lg flex items-center justify-center text-xs font-semibold transition-all relative ${
                          selected
                            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-[0_4px_12px_rgba(52,211,153,0.5)]"
                            : today
                              ? "border-2 border-emerald-400 text-emerald-200 bg-emerald-900/30"
                              : inMonth
                                ? "text-emerald-100 hover:bg-emerald-800/50"
                                : "text-emerald-600/50 hover:bg-emerald-900/30"
                        }`}
                        onClick={() => setSelectedDate(startOfDay(d))}
                      >
                        {d.getDate()}
                        {hasUpcoming && !selected && (
                          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Список на день */}
              <div className={`${panelCls} p-4 flex-1 min-h-[160px] flex flex-col`}>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-emerald-500/20">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <IconCalendar />
                    <span className="text-xs font-bold uppercase tracking-wider">Бронювання на день</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-600/40 to-emerald-500/40 text-emerald-200 text-[11px] font-bold border border-emerald-500/30 shadow-inner">
                    {filteredForSidebar.length}
                  </span>
                </div>
                <div className="text-[11px] text-emerald-300/60 mb-3">
                  {isToday ? "Сьогодні • " : ""}
                  {selectedDate.toLocaleDateString("uk-UA", { weekday: "short", day: "2-digit", month: "2-digit" })}
                  {" • "}
                  {filterTable ? filterTable.name || `Стіл №${filterTable.id}` : "Всі столи"}
                </div>
                <div className="flex-1 min-h-0 overflow-auto space-y-2 custom-scrollbar">
                  {filteredForSidebar.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-emerald-500/50 py-8">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span className="text-xs mt-3 font-medium">Немає бронювань на цей день</span>
                    </div>
                  )}
                  {filteredForSidebar.map((r) => {
                    const isOnline = r.source === "online";
                    const isPast = r._end < now;
                    const isActive = r._start <= now && now < r._end;
                    const tableName =
                      tables.find((t) => Number(t.id) === Number(r.tableId))?.name || `Стіл №${r.tableId}`;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`w-full text-left rounded-xl border-2 p-3 transition-all duration-200 hover:scale-[1.02] ${
                          isPast
                            ? "border-slate-600/40 bg-gradient-to-r from-slate-800/50 to-slate-700/50 hover:from-slate-700/60 hover:to-slate-600/60"
                            : isActive
                              ? "border-emerald-400/50 bg-gradient-to-r from-emerald-900/50 to-emerald-800/50 shadow-[0_0_15px_rgba(52,211,153,0.2)]"
                              : "border-emerald-500/30 bg-gradient-to-r from-emerald-950/50 to-slate-900/50 hover:from-emerald-900/40 hover:to-emerald-800/40"
                        }`}
                        onClick={() => setEditor({ open: true, initial: r })}
                      >
                        <div className="flex justify-between gap-2 mb-2">
                          <div className="font-bold text-emerald-50 text-sm truncate">
                            {r.customer1Name || r.customerName || "Без імені"}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-emerald-200/80 shrink-0 bg-emerald-900/40 px-2 py-0.5 rounded-md">
                            <IconClock />
                            {formatTimeRange(r._start, r._end)}
                          </div>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <div className="flex items-center gap-2">
                            {(r.note || r.notes) && (
                              <span className="text-[11px] text-emerald-300/60 truncate max-w-[140px]">
                                {(r.note || r.notes).slice(0, 40)}
                              </span>
                            )}
                            {isOnline && (
                              <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-sky-600/40 to-sky-500/40 text-sky-200 border border-sky-400/40 text-[10px] font-bold shadow-inner">
                                ONLINE
                              </span>
                            )}
                            {isActive && (
                              <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-500/50 to-emerald-400/50 text-emerald-100 text-[10px] font-bold animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]">
                                ЗАРАЗ
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-emerald-300/70 shrink-0 font-medium">{tableName}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Швидке бронювання */}
              <div className={`${panelCls} p-4`}>
                <div className="flex items-center gap-2 text-emerald-300 mb-3 pb-2 border-b border-emerald-500/20">
                  <IconPlus />
                  <span className="text-xs font-bold uppercase tracking-wider">Швидке бронювання</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_DURATIONS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="h-10 px-5 rounded-xl bg-gradient-to-br from-emerald-600/30 to-emerald-700/30 border border-emerald-500/40 text-emerald-100 hover:from-emerald-500/40 hover:to-emerald-600/40 hover:text-white hover:border-emerald-400/50 text-xs font-bold transition-all shadow-md hover:shadow-lg"
                      onClick={() => quickBook(m)}
                    >
                      {fmtDuration(m)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </ModalShell>

      {editor.open && (
        <ReservationForm
          open={editor.open}
          onClose={() => setEditor({ open: false, initial: null })}
          initial={editor.initial}
          tables={tables}
          list={list}
          onSave={handleSave}
          onDelete={handleDelete}
          clients={clients}
        />
      )}
    </>
  );
}
