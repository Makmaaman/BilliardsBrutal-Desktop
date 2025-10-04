import React from "react";
import ModalShell from "../components/ModalShell";
import Kpi from "../components/Kpi";
import { fmtDur, money } from "../utils/format";

export default function ShiftModal({ onClose, shift, openShift, closeShift, stats, summarize }) {
  const nowTotals = shift ? summarize(stats.filter(r => r.shiftId === shift.id)) : null;
  return (
    <ModalShell title="Зміна" onClose={onClose} footer={
      <div className="flex justify-end gap-2">
        {!shift && <button className="h-9 px-4 rounded-lg bg-emerald-600 text-white" onClick={openShift}>Відкрити зміну</button>}
        {shift && <button className="h-9 px-4 rounded-lg bg-rose-600 text-white" onClick={closeShift}>Закрити зміну</button>}
        <button className="h-9 px-4 rounded-lg bg-slate-800 text-white" onClick={onClose}>Готово</button>
      </div>
    }>
      {!shift ? (
        <div className="text-sm text-slate-600">Зміна не відкрита.</div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl ring-1 ring-slate-200 px-4 py-3 bg-white">
            <div className="text-sm"><b>ID:</b> {shift.id}</div>
            <div className="text-sm"><b>Відкрито:</b> {new Date(shift.openedAt).toLocaleString()} • {shift.openedBy}</div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <Kpi title="Нараховано (поточна зміна)" value={money(nowTotals.totalAmount)} />
            <Kpi title="Час (поточна зміна)" value={fmtDur(nowTotals.totalMs)} />
            <Kpi title="Ігор (поточна зміна)" value={nowTotals.count} />
          </div>
        </div>
      )}
    </ModalShell>
  );
}

/* =======================
 * Модал «Тарифи» + бонуси
 * ======================= */
