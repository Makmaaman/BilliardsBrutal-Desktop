// src/drawers/StatsDrawer.jsx
import React, { useMemo, useState } from "react";
import SideDrawer from "../components/SideDrawer";
import { money, fmtDur } from "../utils/format";
import { todayRange, weekRange, monthRange, inRange } from "../utils/tariffs";

export default function StatsDrawer({ open, onClose, stats = [] }) {
  if (!open) return null;

  // Діапазон за замовчуванням — сьогодні
  const [range, setRange] = useState(() => {
    const { start, end } = todayRange();
    return { start, end };
  });

  // Відфільтровані записи в межах діапазону
  const filtered = useMemo(() => {
    return (stats || []).filter(r =>
      inRange(r.finishedAt, range.start, range.end)
    );
  }, [stats, range]);

  // Агрегати: сума, тривалість, по столах
  const totals = useMemo(() => {
    let amount = 0;
    let ms = 0;
    const byTable = {};

    for (const r of filtered) {
      amount += Number(r.amount) || 0;

      const finished = r.finishedAt ?? Date.now();
      for (const iv of (r.intervals || [])) {
        const end = iv.end ?? finished;
        ms += Math.max(0, (end - iv.start) || 0);
      }

      const key = r.tableName ?? r.table ?? "Стіл";
      byTable[key] = (byTable[key] || 0) + (Number(r.amount) || 0);
    }
    return { amount, ms, byTable };
  }, [filtered]);

  // Експорт CSV
  function exportCSV() {
    const esc = (v) => `"${String(v ?? "").replaceAll('"','""')}"`;
    const rows = filtered.map(r => ({
      id: r.id,
      table: r.tableName ?? r.table ?? "",
      startedAt: new Date(r.startedAt).toLocaleString(),
      finishedAt: new Date(r.finishedAt).toLocaleString(),
      duration: fmtDur((r.intervals || []).reduce((s, iv) => s + ((iv.end ?? r.finishedAt) - iv.start), 0)),
      amount: (Number(r.amount) || 0).toFixed(2),
      shiftId: r.shiftId || ""
    }));
    const headers = ["id","table","startedAt","finishedAt","duration","amount","shiftId"];
    const csv = [headers.join(","), ...rows.map(r => headers.map(k => esc(r[k])).join(","))].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "stats.csv";
    a.click();
  }

  const btn = "px-3 py-2 rounded-xl border text-sm";

  return (
    <SideDrawer size="x1" title="Статистика" onClose={onClose}>
      {/* Верхня панель керування діапазоном */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button className={btn} onClick={() => { const r = todayRange(); setRange(r); }}>Сьогодні</button>
        <button className={btn} onClick={() => { const r = weekRange(); setRange(r); }}>Тиждень</button>
        <button className={btn} onClick={() => { const r = monthRange(); setRange(r); }}>Місяць</button>

        <div className="ml-auto flex items-center gap-2">
          <input
            type="datetime-local"
            className="px-2 py-1 rounded-lg border"
            value={new Date(range.start).toISOString().slice(0,16)}
            onChange={e => setRange(r => ({ ...r, start: new Date(e.target.value).getTime() }))}
          />
          <span>—</span>
          <input
            type="datetime-local"
            className="px-2 py-1 rounded-lg border"
            value={new Date(range.end).toISOString().slice(0,16)}
            onChange={e => setRange(r => ({ ...r, end: new Date(e.target.value).getTime() }))}
          />
          <button className={btn} onClick={exportCSV}>Експорт CSV</button>
        </div>
      </div>

      {/* Підсумкові картки */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="rounded-2xl ring-1 ring-slate-200 p-4">
          <div className="text-sm text-slate-500">Дохід</div>
          <div className="text-2xl font-semibold">{money(totals.amount)}</div>
        </div>
        <div className="rounded-2xl ring-1 ring-slate-200 p-4">
          <div className="text-sm text-slate-500">Час гри</div>
          <div className="text-2xl font-semibold">{fmtDur(totals.ms)}</div>
        </div>
        <div className="rounded-2xl ring-1 ring-slate-200 p-4">
          <div className="text-sm text-slate-500">Кількість ігор</div>
          <div className="text-2xl font-semibold">{filtered.length}</div>
        </div>
      </div>

      {/* Контент зі скролом */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-[70vh] overflow-auto pr-1">
        {/* Доходи по столах */}
        <div className="rounded-2xl ring-1 ring-slate-200 overflow-hidden">
          <table className="min-w-full text-[15px]">
            <thead>
              <tr>
                <th className="bg-slate-50 text-left font-medium text-slate-600 px-4 py-2">Стіл</th>
                <th className="bg-slate-50 text-left font-medium text-slate-600 px-4 py-2">Дохід</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(totals.byTable).map(([name, amt]) => (
                <tr key={name}>
                  <td className="px-4 py-2 border-t border-slate-100">{name}</td>
                  <td className="px-4 py-2 border-t border-slate-100">{money(amt)}</td>
                </tr>
              ))}
              {!Object.keys(totals.byTable).length && (
                <tr><td className="px-4 py-6 text-slate-500" colSpan={2}>Даних немає…</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Список ігор */}
        <div>
          {filtered.map((r) => (
            <div key={r.id} className="border border-slate-200 rounded-xl p-3 mb-2">
              <div className="text-sm">{r.tableName} • {money(r.amount)}</div>
              <div className="text-xs text-slate-600">
                {new Date(r.startedAt).toLocaleString()} — {new Date(r.finishedAt).toLocaleString()} • Тривалість: {
                  fmtDur((r.intervals || []).reduce((s, iv) => s + ((iv.end ?? r.finishedAt) - iv.start), 0))
                } {r.shiftId ? `• Зміна: ${r.shiftId}` : ""}
              </div>
            </div>
          ))}
          {!filtered.length && <div className="text-slate-500">Записів немає…</div>}
        </div>
      </div>
    </SideDrawer>
  );
}
