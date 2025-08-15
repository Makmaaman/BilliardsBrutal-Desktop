import React from "react";
import SideDrawer from "../components/SideDrawer";
import { money, fmtDur } from "../utils/format";

export default function ShiftDrawer({ open, onClose, shift, openShift, closeShift, shifts }) {
  if (!open) return null;
  const btn = "px-4 py-2 rounded-xl shadow-sm border text-sm font-medium bg-black text-white border-black";

  return (
    <SideDrawer title="Керування зміною" onClose={onClose}>
      <div className="space-y-4">
        {shift ? (
          <>
            <div className="text-sm">Поточна зміна відкрита {new Date(shift.openedAt).toLocaleString()} користувачем <b>{shift.openedBy}</b>.</div>
            <button className={btn} onClick={closeShift}>Закрити зміну (Z‑звіт)</button>
          </>
        ) : (
          <>
            <div className="text-sm text-red-600">Зміна закрита — запуск часу заблоковано.</div>
            <button className={btn} onClick={openShift}>Відкрити зміну</button>
          </>
        )}

        <div className="mt-6">
          <div className="text-sm font-semibold mb-2">Історія змін</div>
          {shifts.length === 0 && <div className="text-xs text-slate-500">Поки порожньо.</div>}
          {shifts.map(s => (
            <div key={s.id} className="border border-slate-200 rounded-xl p-3 mb-2">
              <div className="text-sm">ID: <b>{s.id}</b></div>
              <div className="text-xs text-slate-600">Від: {new Date(s.openedAt).toLocaleString()} — До: {new Date(s.closedAt).toLocaleString()} — Відкрив: {s.openedBy}</div>
              <div className="text-xs mt-2">Разом: {money(s.totals.totalAmount)} • Час: {fmtDur(s.totals.totalMs)} • Ігор: {s.totals.count}</div>
            </div>
          ))}
        </div>
      </div>
    </SideDrawer>
  );
}
