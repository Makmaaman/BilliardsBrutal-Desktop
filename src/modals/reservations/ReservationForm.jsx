
// src/modals/reservations/ReservationForm.jsx
import React, { useEffect, useMemo, useState } from "react";
import ModalShell from "../../components/ModalShell";
import { api } from "../../lib/api";
import CustomerSelect from "../../components/CustomerSelect";
import { validateReservation } from "../../utils/reservationUtils";

export default function ReservationForm({
  open,
  onClose,
  initial = null,
  tables = [],
  list = [],
  onSave,
  onDelete,
}) {
  const [tableId, setTableId] = useState(initial?.tableId ?? 0);
  const [customer1Id, setCustomer1Id] = useState(initial?.customer1Id ?? initial?.customerId ?? "");
  const [customer2Id, setCustomer2Id] = useState(initial?.customer2Id ?? "");
  const [startAt, setStartAt] = useState(toLocal(initial?.startAt || new Date()));
  const [endAt, setEndAt] = useState(toLocal(initial?.endAt || addMinutes(new Date(), 60)));
  const [notes, setNotes] = useState(initial?.notes || "");
  const isEdit = !!initial?.id;
  const [err, setErr] = useState("");

  useEffect(() => { setErr(""); }, [tableId, customer1Id, customer2Id, startAt, endAt]);

  async function handleSave() {
    const payload = {
      ...(initial||{}),
      tableId: Number(tableId),
      customer1Id: customer1Id || null,
      customer2Id: customer2Id || null,
      startAt: new Date(startAt).toISOString(),
      endAt:   new Date(endAt).toISOString(),
      notes: (notes||"").trim(),
      status: initial?.status || "booked",
    };
    const errors = validateReservation(payload, list, { allowSelf: !!initial?.id });
    if (errors.length) { setErr(errors.join("\\n")); return; }
    try {
      const c1 = payload.customer1Id ? await api("customers:byId", { id: payload.customer1Id }) : null;
      const c2 = payload.customer2Id ? await api("customers:byId", { id: payload.customer2Id }) : null;
      payload.customer1Name = c1?.name || null;
      payload.customer2Name = c2?.name || null;
    } catch {}
    onSave?.(payload);
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={isEdit ? "Редагувати бронювання" : "Нове бронювання"}
      maxWidth={720}
      maxHeightVh={86}
      footer={
        <div className="flex items-center justify-between">
          <div className="text-sm text-rose-600 whitespace-pre-line">{err}</div>
          <div className="flex items-center gap-2">
            {isEdit && (
              <button className="h-9 px-4 rounded-lg bg-rose-600 text-white hover:bg-rose-700" onClick={()=>onDelete?.(initial)}>
                Видалити
              </button>
            )}
            <button className="h-9 px-4 rounded-lg bg-slate-200" onClick={onClose}>Скасувати</button>
            <button className="h-9 px-4 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700" onClick={handleSave}>Зберегти</button>
          </div>
        </div>
      }
    >
      <div className="grid md:grid-cols-2 gap-4">
        {/* LEFT: clients */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">Клієнт 1</label>
            <CustomerSelect value={customer1Id} onChange={setCustomer1Id} />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium">Клієнт 2 (необов'язково)</label>
            <CustomerSelect value={customer2Id} onChange={setCustomer2Id} placeholder="Додати другого клієнта" />
          </div>
        </div>

        {/* RIGHT: table & times */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">Стіл</label>
            <select
              className="h-10 w-full px-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
              value={tableId}
              onChange={(e)=>setTableId(Number(e.target.value))}
            >
              {(tables||[]).map(t => (
                <option key={t.id} value={t.id}>{t.name || `Стіл ${t.id+1}`}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium">Початок</label>
              <input
                type="datetime-local"
                className="h-10 w-full px-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                value={startAt}
                onChange={(e)=>setStartAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Кінець</label>
              <input
                type="datetime-local"
                className="h-10 w-full px-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                value={endAt}
                onChange={(e)=>setEndAt(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* NOTES */}
        <div className="md:col-span-2 space-y-2">
          <label className="block text-sm font-medium">Нотатки</label>
          <textarea
            className="w-full min-h-[80px] px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            value={notes}
            onChange={(e)=>setNotes(e.target.value)}
            placeholder="Додаткова інформація (необов'язково)…"
          />
        </div>
      </div>
    </ModalShell>
  );
}

function toLocal(dateInput) {
  const d = new Date(dateInput);
  const tzOffset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tzOffset * 60000);
  return local.toISOString().slice(0,16);
}
function addMinutes(d, mins) {
  return new Date(new Date(d).getTime() + mins*60000);
}
