import React, { useMemo, useState } from "react";
import ModalShell from "../components/ModalShell";
import { fmtDur, money } from "../utils/format";

/**
 * openShift(openingBalance)  — async; openingBalance — початковий залишок готівки (грн)
 * closeShift(collectionAmount) — async; collectionAmount — сума інкасації (грн)
 * checkboxEnabled — чи ввімкнено Checkbox ПРРО (показує поля залишку/інкасації)
 */
export default function ShiftModal({
  onClose,
  shift,
  openShift,
  closeShift,
  stats,
  summarize,
  checkboxEnabled = false,
}) {
  const [screen, setScreen] = useState("main"); // main | pre-open | pre-close
  const [openingBalance, setOpeningBalance] = useState("");
  const [collection, setCollection] = useState("");
  const [busy, setBusy] = useState(false);

  // Усі записи (чеки) поточної зміни
  const shiftRecords = useMemo(
    () => (shift ? (stats || []).filter((r) => r.shiftId === shift.id) : []),
    [shift, stats]
  );

  // Підсумки зміни
  const nowTotals = useMemo(
    () => (shift ? summarize(shiftRecords) : null),
    [shift, shiftRecords, summarize]
  );

  // Розбиття за способом оплати
  const pay = useMemo(() => {
    let cash = 0,
      card = 0;
    for (const r of shiftRecords) {
      const amt = Number(r?.amount || 0);
      if (r?.paymentMethod === "cash") cash += amt;
      else if (r?.paymentMethod === "card") card += amt;
    }
    return { cash, card, total: cash + card };
  }, [shiftRecords]);

  const totalAmount = Number(nowTotals?.totalAmount || 0);
  const totalMs = Number(nowTotals?.totalMs || 0);
  const totalGames = Number(nowTotals?.count || 0);

  const openedAtStr = shift ? new Date(shift.openedAt).toLocaleString() : "";

  async function doOpen() {
    setBusy(true);
    try {
      await openShift(Number(openingBalance) || 0);
      setScreen("main");
      setOpeningBalance("");
    } finally {
      setBusy(false);
    }
  }

  async function doClose() {
    setBusy(true);
    try {
      await closeShift(Number(collection) || 0);
      setScreen("main");
      setCollection("");
    } finally {
      setBusy(false);
    }
  }

  /* ---------- Екран: відкриття зміни ---------- */
  if (screen === "pre-open") {
    return (
      <ModalShell
        title="Відкриття зміни"
        onClose={onClose}
        containerStyle={{ width: "480px", maxWidth: "92vw" }}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button
              className="h-9 px-4 rounded-full bg-slate-700 text-white text-sm hover:bg-slate-600"
              onClick={() => setScreen("main")}
              disabled={busy}
            >
              Назад
            </button>
            <button
              className="h-9 px-5 rounded-full bg-emerald-600 text-white text-sm font-semibold shadow-[0_8px_20px_rgba(5,150,105,0.5)] hover:bg-emerald-500 disabled:opacity-40"
              onClick={doOpen}
              disabled={busy}
            >
              {busy ? "Відкриваю…" : "Відкрити зміну"}
            </button>
          </div>
        }
      >
        <div className="space-y-5 px-1">
          {checkboxEnabled ? (
            <>
              <div className="p-4 rounded-2xl bg-emerald-900/30 border border-emerald-500/30 text-sm text-emerald-100/80">
                Вкажіть суму готівки, що вже знаходиться в касі на початок зміни. Це буде зареєстровано в Checkbox як{" "}
                <span className="text-emerald-300 font-medium">службове внесення</span>.
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-emerald-200/80 block">Початковий залишок готівки в касі</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-10 px-3 pr-12 rounded-xl bg-slate-800 border border-emerald-500/30 text-emerald-100 text-sm focus:outline-none focus:border-emerald-400"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") doOpen();
                    }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-200/50 text-sm">грн</span>
                </div>
                <p className="text-xs text-emerald-200/40">Залиште 0, якщо каса пуста</p>
              </div>
            </>
          ) : (
            <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-600/40 text-sm text-emerald-100/70 text-center">
              Готові відкрити нову зміну?
            </div>
          )}
        </div>
      </ModalShell>
    );
  }

  /* ---------- Екран: закриття зміни ---------- */
  if (screen === "pre-close") {
    return (
      <ModalShell
        title="Закриття зміни"
        onClose={onClose}
        containerStyle={{ width: "480px", maxWidth: "92vw" }}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button
              className="h-9 px-4 rounded-full bg-slate-700 text-white text-sm hover:bg-slate-600"
              onClick={() => setScreen("main")}
              disabled={busy}
            >
              Назад
            </button>
            <button
              className="h-9 px-5 rounded-full bg-rose-600 text-white text-sm font-semibold shadow-[0_8px_20px_rgba(220,38,38,0.4)] hover:bg-rose-500 disabled:opacity-40"
              onClick={doClose}
              disabled={busy}
            >
              {busy ? "Закриваю…" : "Закрити зміну"}
            </button>
          </div>
        }
      >
        <div className="space-y-5 px-1">
          <div className="grid grid-cols-3 gap-3">
            <StatChip label="Готівка за зміну" value={money(pay.cash)} color="emerald" />
            <StatChip label="Карта за зміну" value={money(pay.card)} color="blue" />
            <StatChip label="Всього" value={money(totalAmount)} color="violet" />
          </div>
          {checkboxEnabled && (
            <>
              <div className="p-4 rounded-2xl bg-amber-900/20 border border-amber-500/20 text-sm text-amber-100/80">
                Вкажіть суму готівки для вилучення з каси (інкасація). Буде зареєстровано в Checkbox як{" "}
                <span className="text-amber-300 font-medium">службова видача</span>.
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-emerald-200/80 block">Сума інкасації (вилучення готівки)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={collection}
                    onChange={(e) => setCollection(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-10 px-3 pr-12 rounded-xl bg-slate-800 border border-amber-500/30 text-emerald-100 text-sm focus:outline-none focus:border-amber-400"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") doClose();
                    }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-200/50 text-sm">грн</span>
                </div>
                <p className="text-xs text-emerald-200/40">Залиште 0, якщо інкасація не потрібна</p>
              </div>
            </>
          )}
        </div>
      </ModalShell>
    );
  }

  /* ---------- Головний екран ---------- */
  return (
    <ModalShell
      title="Зміна"
      onClose={onClose}
      containerStyle={{ width: "820px", maxWidth: "92vw", height: "640px", maxHeight: "84vh" }}
      footer={
        <div className="flex justify-between w-full items-center">
          <div className="text-xs text-emerald-200/80">
            {shift ? `Поточна зміна від ${openedAtStr}` : "Зміна зараз не відкрита."}
          </div>
          <div className="flex gap-2">
            {!shift && (
              <button
                className="h-9 px-4 rounded-full bg-emerald-600 text-white text-sm font-semibold shadow-[0_10px_24px_rgba(5,150,105,0.6)] hover:bg-emerald-500"
                onClick={() => setScreen("pre-open")}
              >
                Відкрити зміну
              </button>
            )}
            {shift && (
              <button
                className="h-9 px-4 rounded-full bg-rose-600 text-white text-sm font-semibold shadow-[0_10px_24px_rgba(220,38,38,0.5)] hover:bg-rose-500"
                onClick={() => setScreen("pre-close")}
              >
                Закрити зміну
              </button>
            )}
            <button
              className="h-9 px-4 rounded-full bg-slate-700 text-white text-sm hover:bg-slate-600"
              onClick={onClose}
            >
              Готово
            </button>
          </div>
        </div>
      }
    >
      {!shift ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-full max-w-md rounded-3xl border border-dashed border-emerald-500/40 bg-slate-800/50 px-5 py-6 text-center shadow-sm">
            <div className="text-sm font-medium text-emerald-100">Зміна не відкрита</div>
            <div className="mt-2 text-xs text-emerald-200/70">
              Відкрийте зміну, щоб почати збирати статистику по чекам та оплатам за столи.
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Шапка зміни */}
          <div className="relative overflow-hidden rounded-3xl border border-emerald-800/70 bg-gradient-to-br from-emerald-900 via-emerald-950 to-slate-950 px-5 py-4 text-emerald-50 shadow-[0_20px_50px_rgba(15,23,42,0.85)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0_0,rgba(52,211,153,0.25),transparent_55%),radial-gradient(circle_at_120%_120%,rgba(15,23,42,0.9),transparent_60%)]" />
            <div className="relative z-10 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/90">Поточна зміна</div>
                <div className="mt-1 text-lg font-semibold tracking-tight">ID: {shift.id}</div>
                <div className="mt-1 text-xs text-emerald-100/90">
                  Відкрито: <span className="font-medium">{openedAtStr}</span>
                  {shift.openedBy ? <> • {shift.openedBy}</> : null}
                </div>
                {shift.checkboxShiftId && (
                  <div className="mt-0.5 text-xs text-emerald-200/60">
                    Checkbox: {String(shift.checkboxShiftId).slice(0, 8)}…
                  </div>
                )}
              </div>
              <div className="mt-2 md:mt-0 flex flex-col items-start md:items-end gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-100 ring-1 ring-emerald-400/60">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.6)]" />
                  Активна зміна
                </span>
                <div className="text-[11px] text-emerald-100/85">
                  Операцій: <span className="font-semibold">{totalGames}</span>
                </div>
              </div>
            </div>
          </div>

          {/* KPI */}
          <div className="grid md:grid-cols-5 gap-3">
            <MetricCard label="Нараховано" value={money(totalAmount)} highlight />
            <MetricCard label="Готівка" value={money(pay.cash)} />
            <MetricCard label="Карта" value={money(pay.card)} />
            <MetricCard label="Час" value={fmtDur(totalMs)} />
            <MetricCard label="Ігор" value={String(totalGames)} />
          </div>

          {shift.openingBalance > 0 && (
            <div className="text-xs text-emerald-200/60 px-1">
              Початковий залишок:{" "}
              <span className="font-medium text-emerald-200/80">{money(shift.openingBalance)}</span>
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
}

/* Маленька картка KPI зі зрозумілими, контрастними кольорами */
function MetricCard({ label, value, highlight = false }) {
  return (
    <div
      className={[
        "h-full rounded-2xl px-4 py-3 shadow-sm transition-all",
        highlight
          ? "bg-gradient-to-br from-emerald-600 to-emerald-700 text-emerald-50 shadow-[0_14px_32px_rgba(5,150,105,0.55)]"
          : "bg-white text-slate-800 border border-slate-200 hover:border-emerald-300/80 hover:shadow-md",
      ].join(" ")}
    >
      <div
        className={[
          "text-[11px] uppercase tracking-[0.12em] mb-2",
          highlight ? "text-emerald-50/90" : "text-slate-500",
        ].join(" ")}
      >
        {label}
      </div>
      <div className={["text-xl font-semibold", highlight ? "text-emerald-50" : "text-slate-900"].join(" ")}>
        {value}
      </div>
    </div>
  );
}

/* Компактний чип для екрана закриття зміни */
function StatChip({ label, value, color = "emerald" }) {
  const colors = {
    emerald: "bg-emerald-900/40 border-emerald-500/30 text-emerald-300",
    blue: "bg-blue-900/40 border-blue-500/30 text-blue-300",
    violet: "bg-violet-900/40 border-violet-500/30 text-violet-300",
  };
  return (
    <div className={`rounded-2xl px-4 py-3 border ${colors[color] || colors.emerald}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70 mb-1">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
