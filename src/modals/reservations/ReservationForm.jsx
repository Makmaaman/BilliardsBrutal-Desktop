// src/modals/reservations/ReservationForm.jsx
// Дизайн відновлено з v3.9.2 (смарагдова тема, пресети тривалості, бейдж «Online»).
import React, { useEffect, useState } from "react";
import ModalShell from "../../components/ModalShell";
import { api } from "../../lib/api";
import CustomerSelect from "../../components/CustomerSelect";
import { validateReservation } from "../../utils/reservationUtils";

/* ---------- іконки (16px, stroke=currentColor) ---------- */
const svgProps = {
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
const IconUser = () => (
  <svg {...svgProps}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const IconUsers = () => (
  <svg {...svgProps}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconTable = () => (
  <svg {...svgProps}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18" />
    <path d="M9 21V9" />
  </svg>
);
const IconClock = () => (
  <svg {...svgProps}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconNote = () => (
  <svg {...svgProps}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);
const IconTrash = () => (
  <svg {...svgProps}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);
const IconSave = () => (
  <svg {...svgProps}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);
const IconX = () => (
  <svg {...svgProps}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconAlert = () => (
  <svg {...svgProps}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const fieldCls =
  "h-11 w-full px-4 rounded-xl border border-emerald-500/30 bg-emerald-950/60 text-emerald-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50";
const DURATION_PRESETS = [30, 60, 90, 120, 180];

export default function ReservationForm({
  open,
  onClose,
  initial = null,
  tables = [],
  list = [],
  onSave,
  onDelete,
}) {
  const isEdit = !!initial?.id;
  const isOnline = initial?.source === "online";

  const [tableId, setTableId] = useState(initial?.tableId ?? 0);
  const [customer1Id, setCustomer1Id] = useState(initial?.customer1Id ?? initial?.customerId ?? "");
  const [customer2Id, setCustomer2Id] = useState(initial?.customer2Id ?? "");
  const [startAt, setStartAt] = useState(toLocal(initial?.startAt || new Date()));
  const [endAt, setEndAt] = useState(toLocal(initial?.endAt || addMinutes(new Date(), 60)));
  const [notes, setNotes] = useState(initial?.notes || "");
  const [err, setErr] = useState("");

  // Скидаємо форму при зміні initial (коли відкриваємо іншу бронь)
  useEffect(() => {
    if (!initial) return;
    setTableId(initial.tableId ?? 0);
    setCustomer1Id(initial.customer1Id ?? initial.customerId ?? "");
    setCustomer2Id(initial.customer2Id ?? "");
    setStartAt(toLocal(initial.startAt || new Date()));
    setEndAt(toLocal(initial.endAt || addMinutes(initial.startAt || new Date(), 60)));
    setNotes(initial.notes || "");
    setErr("");
  }, [initial]);

  // Очищення помилок при зміні полів
  useEffect(() => {
    setErr("");
  }, [tableId, customer1Id, customer2Id, startAt, endAt, notes]);

  async function handleSave() {
    const payload = {
      ...(initial || {}),
      tableId: Number(tableId),
      customer1Id: customer1Id || null,
      customer2Id: customer2Id || null,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      notes: (notes || "").trim(),
      status: initial?.status || "booked",
    };

    const errors = validateReservation(payload, list);
    if (errors.length) {
      setErr(errors.join("\n"));
      return;
    }

    // Підтягуємо імена/телефон клієнтів для відображення в списку
    try {
      const c1 = payload.customer1Id ? await api("customers:byId", { id: payload.customer1Id }) : null;
      const c2 = payload.customer2Id ? await api("customers:byId", { id: payload.customer2Id }) : null;
      payload.customer1Name = c1?.name || null;
      payload.customer2Name = c2?.name || null;
      payload.phone = c1?.phone || c2?.phone || payload.phone || "";
    } catch (e) {
      console.error("Failed to load customers by id", e);
    }

    onSave?.(payload);
  }

  function handleCancel() {
    onClose?.();
  }

  function handleDeleteClick() {
    if (isEdit && onDelete && initial) onDelete(initial);
  }

  function applyDuration(mins) {
    const s = new Date(startAt);
    setEndAt(toLocal(new Date(s.getTime() + mins * 60000)));
  }

  const durationMin = Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={isEdit ? "Редагувати бронювання" : "Нове бронювання"}
      containerStyle={{ width: "680px", maxWidth: "95vw", height: "auto", maxHeight: "90vh" }}
      footer={
        <div className="flex items-center justify-between gap-4">
          {err ? (
            <div className="flex items-start gap-2 text-rose-300 text-sm flex-1">
              <IconAlert />
              <span className="whitespace-pre-line">{err}</span>
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <div className="flex items-center gap-2 shrink-0">
            {isEdit && (
              <button
                type="button"
                className="h-10 px-4 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-300 text-sm font-semibold flex items-center gap-2 hover:bg-rose-500/30 hover:text-rose-200 transition-all"
                onClick={handleDeleteClick}
              >
                <IconTrash />
                Видалити
              </button>
            )}
            <button
              type="button"
              className="h-10 px-4 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-200 text-sm font-medium flex items-center gap-2 hover:bg-emerald-900/60 transition-all"
              onClick={handleCancel}
            >
              <IconX />
              Скасувати
            </button>
            <button
              type="button"
              className="h-10 px-5 rounded-xl bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition-all"
              onClick={handleSave}
            >
              <IconSave />
              Зберегти
            </button>
          </div>
        </div>
      }
    >
      {isOnline && (
        <div className="mb-4 p-3 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center gap-3">
          <span className="px-3 py-1 rounded-full bg-sky-500/30 text-sky-200 text-xs font-bold uppercase">Online</span>
          <span className="text-sky-200 text-sm">Це онлайн-бронювання. Зміни будуть синхронізовані з системою.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ліва колонка: клієнти + нотатки */}
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
              <IconUser />
              Клієнт
            </label>
            <CustomerSelect value={customer1Id} onChange={setCustomer1Id} />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-emerald-300/80">
              <IconUsers />
              Другий клієнт
              <span className="text-emerald-500/60 text-xs">(необов'язково)</span>
            </label>
            <CustomerSelect value={customer2Id} onChange={setCustomer2Id} placeholder="Додати другого клієнта" />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-emerald-300/80">
              <IconNote />
              Нотатки
            </label>
            <textarea
              className="w-full min-h-[100px] px-4 py-3 rounded-xl border border-emerald-500/30 bg-emerald-950/60 text-emerald-100 text-sm placeholder-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Коментар до бронювання (турнір, день народження...)"
            />
          </div>
        </div>

        {/* Права колонка: стіл + час */}
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
              <IconTable />
              Стіл
            </label>
            <select className={fieldCls} value={tableId} onChange={(e) => setTableId(Number(e.target.value))}>
              {(tables || []).map((t) => (
                <option key={t.id} value={t.id}>
                  🎱 {t.name || `Стіл №${t.id}`}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
              <IconClock />
              Початок
            </label>
            <input type="datetime-local" className={fieldCls} value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
              <IconClock />
              Кінець
            </label>
            <input
              type="datetime-local"
              className={fieldCls}
              value={endAt}
              min={startAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-emerald-400/70 uppercase tracking-wide">Тривалість</label>
            <div className="flex flex-wrap gap-2">
              {DURATION_PRESETS.map((m) => {
                const active = durationMin === m;
                return (
                  <button
                    key={m}
                    type="button"
                    className={`h-9 px-4 rounded-xl text-xs font-semibold transition-all ${
                      active
                        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                        : "bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/30"
                    }`}
                    onClick={() => applyDuration(m)}
                  >
                    {m >= 60 ? `${m / 60} год` : `${m} хв`}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-400/70">Загальна тривалість:</span>
              <span className="text-sm font-semibold text-emerald-200">
                {durationMin >= 60
                  ? `${Math.floor(durationMin / 60)} год ${durationMin % 60 > 0 ? `${durationMin % 60} хв` : ""}`
                  : `${durationMin} хв`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

/* ---------- helpers ---------- */
function toLocal(dateInput) {
  const d = new Date(dateInput);
  const tzOffset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tzOffset * 60000);
  return local.toISOString().slice(0, 16);
}

function addMinutes(d, mins) {
  return new Date(new Date(d).getTime() + mins * 60000);
}
