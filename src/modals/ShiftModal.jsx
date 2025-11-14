import React, { useMemo } from "react";
import ModalShell from "../components/ModalShell";
import Kpi from "../components/Kpi";
import { fmtDur, money } from "../utils/format";

export default function ShiftModal({
  onClose,
  shift,
  openShift,
  closeShift,
  stats,
  summarize,
}) {
  // Усі записи (чеки) поточної зміни
  const shiftRecords = useMemo(
    () => (shift ? (stats || []).filter(r => r.shiftId === shift.id) : []),
    [shift, stats]
  );

  // Підсумки зміни
  const nowTotals = useMemo(
    () => (shift ? summarize(shiftRecords) : null),
    [shift, shiftRecords, summarize]
  );

  // Розбиття за способом оплати
  const pay = useMemo(() => {
    let cash = 0, card = 0;
    for (const r of shiftRecords) {
      const amt = Number(r?.amount || 0);
      if (r?.paymentMethod === "cash") cash += amt;
      else if (r?.paymentMethod === "card") card += amt;
    }
    return { cash, card, total: cash + card };
  }, [shiftRecords]);

  const totalAmount = Number(nowTotals?.totalAmount || 0);
  const totalMs     = Number(nowTotals?.totalMs || 0);
  const totalGames  = Number(nowTotals?.count || 0);

  return (
    <ModalShell
      title="Зміна"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          {!shift && (
            <button
              className="h-9 px-4 rounded-lg bg-emerald-600 text-white"
              onClick={openShift}
            >
              Відкрити зміну
            </button>
          )}
          {shift && (
            <button
              className="h-9 px-4 rounded-lg bg-rose-600 text-white"
              onClick={closeShift}
            >
              Закрити зміну
            </button>
          )}
          <button className="h-9 px-4 rounded-lg bg-slate-800 text-white" onClick={onClose}>
            Готово
          </button>
        </div>
      }
    >
      {!shift ? (
        <div className="text-sm text-slate-600">Зміна не відкрита.</div>
      ) : (
        <div className="space-y-3">
          {/* Шапка зміни */}
          <div className="rounded-xl ring-1 ring-slate-200 px-4 py-3 bg-white">
            <div className="text-sm">
              <b>ID:</b> {shift.id}
            </div>
            <div className="text-sm">
              <b>Відкрито:</b>{" "}
              {new Date(shift.openedAt).toLocaleString()} • {shift.openedBy}
            </div>
          </div>

          {/* KPI: додані Готівка/Карта */}
          <div className="grid md:grid-cols-5 gap-3">
            <Kpi title="Нараховано (поточна зміна)" value={money(totalAmount)} />
            <Kpi title="Готівка" value={money(pay.cash)} />
            <Kpi title="Карта" value={money(pay.card)} />
            <Kpi title="Час (поточна зміна)" value={fmtDur(totalMs)} />
            <Kpi title="Ігор (поточна зміна)" value={String(totalGames)} />
          </div>
        </div>
      )}
    </ModalShell>
  );
}

/* =======================
 * Модал «Тарифи» + бонуси
 * ======================= */
