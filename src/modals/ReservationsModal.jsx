// src/modals/ReservationsModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useReservations, RES_STATUSES } from "../hooks/useReservations";
import { fmtDT, validateReservation } from "../utils/reservationUtils";

/**
 * Сучасна модалка бронювання:
 *  • Місячний календар (ліворуч) з лічильниками
 *  • Таймлайн дня з колонками по столах (праворуч)
 *  • Редактор бронювання з автокомплітом клієнтів
 *  • Мігаючі статуси, гаряча клавіша Ctrl/Cmd+S
 *  • Головне: скрізь використовується table.id (а не індекс)
 */
export default function ReservationsModal({ open, onClose, tables = [], customers = [] }) {
  const { list, create, update, cancel, remove } = useReservations();

  // ----------- ДАТА / ВИГЛЯД -----------
  const todayYmd = ymd(new Date());
  const [monthCursor, setMonthCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => todayYmd);

  // Вибір столу для фільтра: "all" або конкретний table.id
  const [filterTable, setFilterTable] = useState("all");
  const pxPerMinute = 0.9; // 54px за годину — компактно

  const dayStart = useMemo(() => new Date(selectedDate + "T00:00:00"), [selectedDate]);
  const dayEnd   = useMemo(() => new Date(selectedDate + "T23:59:59"), [selectedDate]);

  const countsByYmd = useMemo(() => countByDay(list), [list]);

  // ----------- ФІЛЬТРАЦІЯ ДНЯ -----------
  const dayReservations = useMemo(() => {
    const inDay = list.filter((r) => new Date(r.startAt) <= dayEnd && new Date(r.endAt) >= dayStart);
    const filtered = filterTable === "all" ? inDay : inDay.filter((r) => String(r.tableId) === String(filterTable));
    return filtered.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  }, [list, dayStart, dayEnd, filterTable]);

  // ----------- РЕДАКТОР -----------
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  // Помилки валідності для кнопок Save
  const editErrors = useMemo(() => {
    if (!editing) return [];
    const payload = normalizePayload(editing);
    return validateReservation({ ...editing, ...payload }, list, { allowSelf: true }) || [];
  }, [editing, list]);

  // Нове бронювання на клік у сітці часу (отримуємо саме table.id!)
  const onNewAt = (tableId, minuteOfDay) => {
    const start = new Date(dayStart);
    start.setMinutes(minuteOfDay);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 60 хв за замовч.
    setEditing(baseNewReservation({ tableId, start, end }));
  };

  const onEdit = (r) => setEditing({ ...r });

  // Збереження
  async function handleSave() {
    if (!editing || editErrors.length) return;
    const payload = normalizePayload(editing);
    setSaving(true);
    try {
      if (!editing.id) {
        await Promise.resolve(create(payload));
      } else {
        await Promise.resolve(update(editing.id, payload));
      }
      setEditing(null);
      // якщо збережене не на обраний день — переключимо дату, щоб було видно
      const savedDay = ymd(new Date(payload.startAt));
      if (savedDay !== selectedDate) setSelectedDate(savedDay);
    } catch (e) {
      alert("Не вдалося зберегти бронювання: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  function handleCancelReservation(r) {
    if (confirm(`Скасувати бронювання ${r.code || r.id}?`)) cancel(r.id);
  }
  function handleDeleteReservation(r) {
    if (confirm(`Видалити бронювання ${r.code || r.id}? Це незворотно.`)) remove(r.id);
  }

  // Гаряча клавіша Ctrl/Cmd+S
  useEffect(() => {
    function onKey(e) {
      if (!editing) return;
      const isSave = (e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "ы");
      if (isSave) {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, editErrors]);

  if (!open) return null;

  // Корисні допоміжні
  const firstTableId = tables?.[0]?.id ?? 1;
  const currentFilterId = filterTable === "all" ? null : Number(filterTable);

  return (
    <div className="fixed inset-0 z-[12000]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onMouseDown={onClose} />

      {/* Контейнер модалки */}
      <div
        className="relative mx-auto my-6 w-[min(1200px,95vw)] max-h-[90vh] bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden outline-none"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-lg font-semibold">Бронювання столів</div>
            <Legend />
          </div>
          <div className="flex items-center gap-2">
            {editing && (
              <button
                className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-sm disabled:opacity-50"
                disabled={saving || editErrors.length > 0}
                onClick={handleSave}
                title={editErrors.length ? `Виправте: ${editErrors.join("; ")}` : "Зберегти (Ctrl/Cmd+S)"}
              >
                {saving ? "Збереження…" : "Зберегти"}
              </button>
            )}
            <button
              className="h-9 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-sm"
              onClick={() =>
                setEditing(
                  baseNewReservation({
                    tableId: currentFilterId ?? firstTableId,
                    start: dayStart,
                    end: new Date(dayStart.getTime() + 60 * 60 * 1000),
                  })
                )
              }
            >
              + Нове
            </button>
            <button className="h-9 px-3 rounded-xl bg-slate-900 text-white text-sm" onClick={onClose}>
              Закрити
            </button>
          </div>
        </div>

        {/* Тіло: календар + таймлайн */}
        <div className="grid grid-cols-1 md:grid-cols-[320px,1fr] gap-0">
          {/* Календар і фільтри */}
          <div className="border-r border-slate-200">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <button
                className="h-8 w-8 grid place-items-center rounded-lg hover:bg-slate-100"
                onClick={() => setMonthCursor((prev) => addMonths(prev, -1))}
              >
                ‹
              </button>
              <div className="font-medium">
                {monthCursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
              </div>
              <button
                className="h-8 w-8 grid place-items-center rounded-lg hover:bg-slate-100"
                onClick={() => setMonthCursor((prev) => addMonths(prev, +1))}
              >
                ›
              </button>
              <button
                className="ml-auto px-2 py-1 text-xs rounded-lg border hover:bg-slate-50"
                onClick={() => {
                  setMonthCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
                  setSelectedDate(todayYmd);
                }}
              >
                Сьогодні
              </button>
            </div>

            <MonthCalendar
              monthDate={monthCursor}
              selectedYmd={selectedDate}
              setSelectedYmd={setSelectedDate}
              countsByYmd={countsByYmd}
            />

            <div className="px-4 py-3 border-t border-slate-100 space-y-3">
              <label className="text-sm block">
                Стіл
                <select
                  value={filterTable}
                  onChange={(e) => setFilterTable(e.target.value)}
                  className="mt-1 w-full h-9 px-2 rounded-lg ring-1 ring-slate-200"
                >
                  <option value="all">Усі столи</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || `Стіл #${t.id}`}
                    </option>
                  ))}
                </select>
              </label>

              <div className="text-xs text-slate-500">
                Дата: <b>{selectedDate}</b>
              </div>
              <div className="text-xs text-slate-500">
                Броней цього дня: <b>{dayReservations.length}</b>
              </div>
            </div>
          </div>

          {/* Таймлайн дня */}
          <div className="relative">
            <DayTimeline
              dayStart={dayStart}
              dayEnd={dayEnd}
              tables={tables}
              reservations={dayReservations}
              pxPerMinute={pxPerMinute}
              onNewAt={onNewAt}
              onEdit={onEdit}
            />
          </div>
        </div>

        {/* Редактор */}
        {editing && (
          <div className="border-t border-slate-200 bg-slate-50/60">
            <ReservationEditor
              editing={editing}
              setEditing={setEditing}
              tables={tables}
              customers={customers}
              onSave={handleSave}
              saving={saving}
              errors={editErrors}
            />
          </div>
        )}

        {/* Табличка списком */}
        <div className="px-5 py-3 border-t border-slate-200 bg-white">
          <DayList
            reservations={dayReservations}
            tables={tables}
            onEdit={onEdit}
            onCancel={handleCancelReservation}
            onDelete={handleDeleteReservation}
          />
        </div>
      </div>
    </div>
  );
}

/* =========================== КОМПОНЕНТИ =========================== */

function Legend() {
  return (
    <div className="hidden md:flex items-center gap-2 ml-3 text-xs">
      <Badge color="bg-amber-100 text-amber-700 ring-amber-200">Booked</Badge>
      <Badge color="bg-sky-100 text-sky-700 ring-sky-200 animate-pulse">In progress</Badge>
      <Badge color="bg-emerald-100 text-emerald-700 ring-emerald-200">Completed</Badge>
      <Badge color="bg-rose-100 text-rose-700 ring-rose-200">Cancelled</Badge>
      <Badge color="bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200 animate-pulse">Soon</Badge>
    </div>
  );
}
function Badge({ children, color = "bg-slate-100 text-slate-700 ring-slate-200" }) {
  return <span className={`px-2 py-0.5 rounded-lg ring-1 ${color}`}>{children}</span>;
}

function MonthCalendar({ monthDate, selectedYmd, setSelectedYmd, countsByYmd }) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startWeekday = (first.getDay() + 6) % 7; // Пн=0
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(first.getFullYear(), first.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

  return (
    <div className="p-3">
      <div className="grid grid-cols-7 gap-1 text-[11px] text-slate-500 mb-1">
        {weekDays.map((w) => (
          <div key={w} className="text-center py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="h-10" />;
          const ymdKey = ymd(d);
          const isToday = ymdKey === ymd(new Date());
          const isSelected = ymdKey === selectedYmd;
          const count = countsByYmd.get(ymdKey) || 0;
          return (
            <button
              key={i}
              onClick={() => setSelectedYmd(ymdKey)}
              className={
                "h-14 rounded-xl ring-1 w-full flex flex-col items-center justify-center " +
                (isSelected ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200 hover:bg-slate-50")
              }
            >
              <div className="text-sm leading-none">{d.getDate()}</div>
              <div className={`mt-1 text-[10px] ${isSelected ? "text-white/80" : "text-slate-500"}`}>
                {count ? `${count} бр.` : "\u00A0"}
              </div>
              {isToday && !isSelected && (
                <span className="absolute mt-[-2.2rem] ml-[3.2rem] w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayTimeline({ dayStart, dayEnd, tables, reservations, pxPerMinute = 1, onNewAt, onEdit }) {
  const hours = Array.from({ length: 25 }, (_, i) => i); // 0..24
  const containerRef = useRef(null);

  useEffect(() => {
    const isToday = ymd(new Date(dayStart)) === ymd(new Date());
    if (!isToday || !containerRef.current) return;
    const nowMin = minutesSinceDayStart(new Date());
    containerRef.current.scrollTop = Math.max(0, nowMin * pxPerMinute - 120);
  }, [dayStart, pxPerMinute]);

  return (
    <div className="relative" ref={containerRef} style={{ maxHeight: "52vh", overflow: "auto" }}>
      {/* Верхня смуга — назви столів */}
      <div
        className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 grid"
        style={{ gridTemplateColumns: `80px repeat(${Math.max(1, tables.length)}, minmax(180px, 1fr))` }}
      >
        <div className="px-2 py-2 text-xs text-slate-500">Час</div>
        {tables.map((t) => (
          <div key={t.id} className="px-3 py-2 text-sm font-medium">
            {t.name || `Стіл #${t.id}`}
          </div>
        ))}
      </div>

      {/* Сітка часу */}
      <div
        className="relative grid"
        style={{ gridTemplateColumns: `80px repeat(${Math.max(1, tables.length)}, minmax(180px, 1fr))` }}
      >
        {/* Колонка часу */}
        <div className="relative">
          {hours.map((h, idx) => (
            <div key={idx} className="relative" style={{ height: `${60 * pxPerMinute}px` }}>
              <div className="sticky left-0 top-0 translate-y-[-10px] text-[11px] text-slate-500 px-2">
                {String(h).padStart(2, "0")}:00
              </div>
              <div className="absolute right-0 left-0 top-1/2 h-px bg-slate-100" />
            </div>
          ))}
        </div>

        {/* Колонки столів */}
        {tables.map((t) => (
          <div key={t.id} className="relative border-l border-slate-100">
            {/* Кліки для швидкого створення */}
            <ClickableGrid pxPerMinute={pxPerMinute} onPick={(minute) => onNewAt(t.id, minute)} />

            {/* Бронювання у колонці (за table.id) */}
            {reservations
              .filter((r) => String(r.tableId) === String(t.id))
              .map((r) => (
                <EventBlock
                  key={r.id}
                  r={r}
                  dayStart={dayStart}
                  dayEnd={dayEnd}
                  pxPerMinute={pxPerMinute}
                  onEdit={onEdit}
                />
              ))}
          </div>
        ))}
      </div>

      {/* Поточний час — горизонтальна лінія */}
      {ymd(new Date(dayStart)) === ymd(new Date()) && (
        <NowLine dayStart={dayStart} pxPerMinute={pxPerMinute} colCount={Math.max(1, tables.length)} />
      )}
    </div>
  );
}

function ClickableGrid({ pxPerMinute, onPick }) {
  const slots = Array.from({ length: Math.ceil((24 * 60) / 30) }, (_, i) => i * 30);
  return (
    <div className="absolute inset-0">
      {slots.map((m) => (
        <div
          key={m}
          className="absolute inset-x-2 rounded-md hover:bg-emerald-50/60 cursor-crosshair"
          style={{ top: `${m * pxPerMinute}px`, height: `${30 * pxPerMinute}px` }}
          title={`Створити бронювання: ${mmToLabel(m)}–${mmToLabel(m + 60)}`}
          onClick={(e) => {
            e.stopPropagation();
            onPick?.(m);
          }}
        />
      ))}
    </div>
  );
}

function EventBlock({ r, dayStart, dayEnd, pxPerMinute, onEdit }) {
  const start = new Date(Math.max(new Date(r.startAt).getTime(), dayStart.getTime()));
  const end = new Date(Math.min(new Date(r.endAt).getTime(), dayEnd.getTime()));
  const startMin = minutesSinceDayStart(start);
  const endMin = Math.max(startMin + 15, minutesSinceDayStart(end));
  const top = startMin * pxPerMinute;
  const height = Math.max(20, (endMin - startMin) * pxPerMinute);

  const soon = isSoon(r.startAt, 15) && r.status === RES_STATUSES.BOOKED;
  const klass =
    r.status === RES_STATUSES.CANCELLED
      ? "bg-rose-100 ring-1 ring-rose-200 text-rose-800 opacity-70"
      : r.status === RES_STATUSES.COMPLETED
      ? "bg-emerald-100 ring-1 ring-emerald-200 text-emerald-800"
      : r.status === RES_STATUSES.IN_PROGRESS
      ? "bg-sky-100 ring-2 ring-sky-300 text-sky-900 animate-pulse"
      : soon
      ? "bg-fuchsia-100 ring-2 ring-fuchsia-300 text-fuchsia-900 animate-pulse"
      : "bg-amber-100 ring-1 ring-amber-200 text-amber-900";

  const title = `${fmtDT(r.startAt)} — ${fmtDT(r.endAt)}\n${r.note || ""}`;
  const p1 = r.customer1Name || r.customer1Phone || labelFromId(r.customer1Id);
  const p2 = r.customer2Name || r.customer2Phone || labelFromId(r.customer2Id);

  return (
    <button
      className={`absolute left-2 right-2 rounded-md px-2 py-1 text-[12px] text-left shadow-sm ${klass} hover:brightness-95`}
      style={{ top, height }}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onEdit?.(r);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium truncate">{p1 || "—"}</div>
        <div className="text-[10px] opacity-80">
          {timeHM(r.startAt)}–{timeHM(r.endAt)}
        </div>
      </div>
      {p2 && <div className="text-[11px] truncate">{p2}</div>}
      {r.note && <div className="text-[10px] truncate opacity-80">{r.note}</div>}
    </button>
  );
}

function NowLine({ dayStart, pxPerMinute, colCount }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);
  const mm = minutesSinceDayStart(new Date());
  const y = mm * pxPerMinute;
  return (
    <div className="pointer-events-none absolute left-0 right-0" style={{ top: y }}>
      <div className="grid" style={{ gridTemplateColumns: `80px repeat(${colCount}, minmax(180px, 1fr))` }}>
        <div />
        <div className="col-span-full border-t-2 border-emerald-500" />
      </div>
    </div>
  );
}

function DayList({ reservations, tables, onEdit, onCancel, onDelete }) {
  if (!reservations.length) return null;
  const nameById = new Map(tables.map((t) => [String(t.id), t.name || `Стіл #${t.id}`]));
  return (
    <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr className="text-left text-slate-500">
            <th className="px-3 py-2">Код</th>
            <th className="px-3 py-2">Стіл</th>
            <th className="px-3 py-2">Час</th>
            <th className="px-3 py-2">Гравці</th>
            <th className="px-3 py-2">Статус</th>
            <th className="px-3 py-2 text-right">Дії</th>
          </tr>
        </thead>
        <tbody>
          {reservations.map((r) => (
            <tr key={r.id} className="odd:bg-white even:bg-slate-50/40">
              <td className="px-3 py-2">{r.code || r.id}</td>
              <td className="px-3 py-2">{nameById.get(String(r.tableId)) || `Стіл #${r.tableId}`}</td>
              <td className="px-3 py-2">
                {timeHM(r.startAt)}–{timeHM(r.endAt)}
              </td>
              <td className="px-3 py-2">
                <div className="truncate">{r.customer1Name || r.customer1Phone || labelFromId(r.customer1Id) || "—"}</div>
                <div className="truncate">{r.customer2Name || r.customer2Phone || labelFromId(r.customer2Id) || ""}</div>
              </td>
              <td className="px-3 py-2">
                <StatusPill status={r.status} startAt={r.startAt} />
              </td>
              <td className="px-3 py-2 text-right">
                <div className="inline-flex gap-2">
                  <button className="h-8 px-2 rounded-lg border hover:bg-slate-50" onClick={() => onEdit(r)}>
                    Редагувати
                  </button>
                  {r.status !== RES_STATUSES.CANCELLED && (
                    <button className="h-8 px-2 rounded-lg border hover:bg-slate-50" onClick={() => onCancel(r)}>
                      Скасувати
                    </button>
                  )}
                  <button className="h-8 px-2 rounded-lg border hover:bg-slate-50" onClick={() => onDelete(r)}>
                    Видалити
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status, startAt }) {
  const soon = isSoon(startAt, 15) && status === RES_STATUSES.BOOKED;
  const map = {
    [RES_STATUSES.BOOKED]: "bg-amber-100 text-amber-800 ring-amber-200",
    [RES_STATUSES.IN_PROGRESS]: "bg-sky-100 text-sky-800 ring-sky-200 animate-pulse",
    [RES_STATUSES.COMPLETED]: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    [RES_STATUSES.CANCELLED]: "bg-rose-100 text-rose-800 ring-rose-200",
  };
  const cls = soon
    ? "bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200 animate-pulse"
    : map[status] || "bg-slate-100 text-slate-700 ring-slate-200";
  const label = soon
    ? "Скоро"
    : status === RES_STATUSES.BOOKED
    ? "Заброньовано"
    : status === RES_STATUSES.IN_PROGRESS
    ? "Розпочато"
    : status === RES_STATUSES.COMPLETED
    ? "Завершено"
    : status === RES_STATUSES.CANCELLED
    ? "Скасовано"
    : "—";
  return <span className={`px-2 py-0.5 rounded-lg ring-1 ${cls}`}>{label}</span>;
}

function ReservationEditor({ editing, setEditing, tables, customers, onSave, saving, errors }) {
  const presets = [30, 60, 90, 120, 180];

  return (
    <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Ліва колонка */}
      <div className="space-y-3">
        <label className="text-sm block">
          Стіл
          <select
            value={editing.tableId ?? tables?.[0]?.id ?? 1}
            onChange={(e) => setEditing({ ...editing, tableId: Number(e.target.value) })}
            className="mt-1 w-full h-9 px-2 rounded-lg ring-1 ring-slate-200"
          >
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name || `Стіл #${t.id}`}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm block">
          Початок
          <input
            type="datetime-local"
            className="mt-1 w-full h-9 px-2 rounded-lg ring-1 ring-slate-200"
            value={toLocalInput(editing.startAt)}
            onChange={(e) => setEditing({ ...editing, startAt: fromLocalInput(e.target.value) })}
          />
        </label>

        <label className="text-sm block">
          Кінець
          <input
            type="datetime-local"
            className="mt-1 w-full h-9 px-2 rounded-lg ring-1 ring-slate-200"
            value={toLocalInput(editing.endAt)}
            onChange={(e) => setEditing({ ...editing, endAt: fromLocalInput(e.target.value) })}
          />
        </label>

        <div className="flex flex-wrap gap-2 pt-1">
          {presets.map((m) => (
            <button
              key={m}
              className="h-8 px-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs"
              onClick={() => {
                const s = new Date(editing.startAt);
                const e = new Date(s.getTime() + m * 60000);
                setEditing({ ...editing, endAt: e.toISOString() });
              }}
            >
              +{m} хв
            </button>
          ))}
        </div>

        <label className="text-sm block">
          Статус
          <select
            value={editing.status || RES_STATUSES.BOOKED}
            onChange={(e) => setEditing({ ...editing, status: e.target.value })}
            className="mt-1 w-full h-9 px-2 rounded-lg ring-1 ring-slate-200"
          >
            <option value={RES_STATUSES.BOOKED}>Заброньовано</option>
            <option value={RES_STATUSES.IN_PROGRESS}>Розпочато</option>
            <option value={RES_STATUSES.COMPLETED}>Завершено</option>
            <option value={RES_STATUSES.CANCELLED}>Скасовано</option>
          </select>
        </label>

        <label className="text-sm block">
          Нотатка
          <input
            className="mt-1 w-full h-9 px-2 rounded-lg ring-1 ring-slate-200"
            value={editing.note || ""}
            onChange={(e) => setEditing({ ...editing, note: e.target.value })}
            placeholder="Турнір, ДН, коментар…"
          />
        </label>
      </div>

      {/* Середня: Гравець 1 */}
      <div className="space-y-3">
        <div className="text-sm font-medium">Гравець 1</div>
        <CustomerPicker
          customers={customers}
          idValue={editing.customer1Id || ""}
          nameValue={editing.customer1Name || ""}
          phoneValue={editing.customer1Phone || ""}
          onChange={(patch) => setEditing({ ...editing, ...patch })}
          idKey="customer1Id"
          nameKey="customer1Name"
          phoneKey="customer1Phone"
        />
      </div>

      {/* Права: Гравець 2 */}
      <div className="space-y-3">
        <div className="text-sm font-medium">Гравець 2</div>
        <CustomerPicker
          customers={customers}
          idValue={editing.customer2Id || ""}
          nameValue={editing.customer2Name || ""}
          phoneValue={editing.customer2Phone || ""}
          onChange={(patch) => setEditing({ ...editing, ...patch })}
          idKey="customer2Id"
          nameKey="customer2Name"
          phoneKey="customer2Phone"
        />
      </div>

      {/* Sticky-бар дій */}
      <div className="md:col-span-3 flex items-center justify-between gap-2 border-t pt-3">
        <div className="text-xs text-slate-500">
          {errors.length ? (
            <span className="text-rose-600">Потрібно виправити: {errors.join("; ")}</span>
          ) : (
            <span>Готово до збереження (Ctrl/Cmd+S)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="h-9 px-3 rounded-lg border border-slate-300 hover:bg-slate-50" onClick={() => setEditing(null)}>
            Скасувати
          </button>
          <button
            className="h-9 px-4 rounded-lg bg-slate-900 text-white disabled:opacity-50"
            onClick={onSave}
            disabled={saving || errors.length > 0}
            title={errors.length ? `Виправте: ${errors.join("; ")}` : "Зберегти (Ctrl/Cmd+S)"}
          >
            {saving ? "Збереження…" : "Зберегти"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerPicker({ customers, idValue, nameValue, phoneValue, onChange, idKey, nameKey, phoneKey }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handle(e) {
      if (!ref.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const options = useMemo(() => {
    const s = (q || "").toLowerCase().trim();
    if (!s) return customers.slice(0, 50);
    return customers
      .filter((c) => (c.name || "").toLowerCase().includes(s) || (c.phone || "").toLowerCase().includes(s))
      .slice(0, 50);
  }, [q, customers]);

  const pick = (c) => {
    onChange({ [idKey]: c.id, [nameKey]: c.name || "", [phoneKey]: c.phone || "" });
    setQ("");
    setOpen(false);
  };

  return (
    <div className="rounded-xl ring-1 ring-slate-200 bg-white p-3" ref={ref}>
      <label className="text-xs text-slate-500">Пошук у клієнтах</label>
      <input
        className="mt-1 w-full h-9 px-2 rounded-lg ring-1 ring-slate-200"
        placeholder="Ім’я або телефон…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="mt-2 max-h-48 overflow-auto rounded-lg ring-1 ring-slate-200 divide-y divide-slate-100 bg-white">
          {options.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">Нічого не знайдено</div>}
          {options.map((c) => (
            <button key={c.id} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50" onClick={() => pick(c)}>
              <div className="flex items-center justify-between">
                <div className="truncate">
                  {c.name} {c.phone ? `• ${c.phone}` : ""}
                </div>
                <div className="text-xs text-slate-500">бал: {c.bonusBalance || 0}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mt-3">
        <div>
          <label className="block text-xs text-slate-500">ID</label>
          <input
            className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200"
            value={idValue || ""}
            onChange={(e) => onChange({ [idKey]: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Ім’я</label>
          <input
            className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200"
            value={nameValue || ""}
            onChange={(e) => onChange({ [nameKey]: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Телефон</label>
          <input
            className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200"
            value={phoneValue || ""}
            onChange={(e) => onChange({ [phoneKey]: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

/* =========================== УТИЛІТИ =========================== */

function baseNewReservation({ tableId, start = new Date(), end = new Date(Date.now() + 60 * 60 * 1000) }) {
  return {
    id: null,
    code: null,
    tableId: Number(tableId),
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    customer1Id: "",
    customer2Id: "",
    customer1Name: "",
    customer2Name: "",
    customer1Phone: "",
    customer2Phone: "",
    note: "",
    status: RES_STATUSES.BOOKED,
  };
}

function normalizePayload(e) {
  return {
    tableId: Number(e.tableId ?? 0),
    startAt: new Date(e.startAt).toISOString(),
    endAt: new Date(e.endAt).toISOString(),
    customer1Id: e.customer1Id || null,
    customer2Id: e.customer2Id || null,
    customer1Name: e.customer1Name || "",
    customer2Name: e.customer2Name || "",
    customer1Phone: e.customer1Phone || "",
    customer2Phone: e.customer2Phone || "",
    note: e.note || "",
    status: e.status || RES_STATUSES.BOOKED,
  };
}

function ymd(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const da = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
function countByDay(list) {
  const m = new Map();
  for (const r of list) {
    const key = ymd(new Date(r.startAt));
    m.set(key, (m.get(key) || 0) + 1);
  }
  return m;
}
function minutesSinceDayStart(dt) {
  const d = new Date(dt);
  return d.getHours() * 60 + d.getMinutes();
}
function timeHM(dt) {
  const d = new Date(dt);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function mmToLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function toLocalInput(iso) {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${da}T${hh}:${mm}`;
  } catch {
    return "";
  }
}
function fromLocalInput(v) {
  const d = new Date(v);
  return d.toISOString();
}
function isSoon(iso, minutes = 15) {
  const now = Date.now();
  const t = new Date(iso).getTime();
  return t >= now && t - now <= minutes * 60 * 1000;
}
function labelFromId(id) {
  return id ? `ID:${id}` : "";
}
