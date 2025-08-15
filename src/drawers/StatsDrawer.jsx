import React, { useMemo, useState } from "react";
import SideDrawer from "../components/SideDrawer";
import { money, fmtDur } from "../utils/format";
import { todayRange, weekRange, monthRange, inRange } from "../utils/tariffs";

export default function StatsDrawer({ open, onClose, stats }) {
  if (!open) return null;

  const btn = "px-3 py-2 rounded-xl border text-sm";
  const [range, setRange] = useState(() => { const { start, end } = todayRange(); return { start, end }; });

  const filtered = useMemo(() => stats.filter(r => inRange(r.finishedAt, range.start, range.end)), [stats, range]);

  const totals = useMemo(() => {
    let amount = 0, ms = 0; const byTable = {};
    for (const r of filtered) {
      amount += r.amount;
      const tms = r.intervals.reduce((s,iv)=> s + ((iv.end ?? r.finishedAt) - iv.start), 0);
      ms += tms;
      if (!byTable[r.tableId]) byTable[r.tableId] = { tableName: r.tableName, ms: 0, amount: 0, games: 0 };
      byTable[r.tableId].ms += tms; byTable[r.tableId].amount += r.amount; byTable[r.tableId].games += 1;
    }
    const count = filtered.length; const avg = count ? amount / count : 0;
    return { amount, ms, count, avg, byTable };
  }, [filtered]);

  function setQuick(type) {
    if (type === "today") setRange(todayRange());
    if (type === "week") setRange(weekRange());
    if (type === "month") setRange(monthRange());
  }

  function exportCSV() {
    const esc = (v) => `"${String(v ?? "").replaceAll('"','""')}"`;
    const rows = filtered.map(r => ({
      id: r.id,
      table: r.tableName,
      startedAt: new Date(r.startedAt).toLocaleString(),
      finishedAt: new Date(r.finishedAt).toLocaleString(),
      duration: fmtDur(r.intervals.reduce((s,iv)=> s + ((iv.end ?? r.finishedAt) - iv.start), 0)),
      amount: r.amount.toFixed(2),
      shiftId: r.shiftId || ""
    }));
    const headers = ["id","table","startedAt","finishedAt","duration","amount","shiftId"];
    const csv = headers.join(",") + "\n" + rows.map(r => headers.map(h => esc(r[h])).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g, "-");
    a.href = url; a.download = `stats_${stamp}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  }

  return (
    <SideDrawer title="Статистика" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm">Період:</div>
          <input type="datetime-local" className={btn} value={new Date(range.start).toISOString().slice(0,16)}
                 onChange={e => setRange(r => ({ ...r, start: new Date(e.target.value).getTime() }))} />
          <span>—</span>
          <input type="datetime-local" className={btn} value={new Date(range.end).toISOString().slice(0,16)}
                 onChange={e => setRange(r => ({ ...r, end: new Date(e.target.value).getTime() }))} />
          <button className={btn} onClick={()=>setQuick("today")}>Сьогодні</button>
          <button className={btn} onClick={()=>setQuick("week")}>Тиждень</button>
          <button className={btn} onClick={()=>setQuick("month")}>Місяць</button>
          <button className={btn} onClick={exportCSV}>Експорт CSV</button>
        </div>

        <div className="border border-slate-200 rounded-xl p-3">
          <div className="text-sm">Разом: <b>{money(totals.amount)}</b> • Час: <b>{fmtDur(totals.ms)}</b> • Ігор: <b>{totals.count}</b> • Середній чек: <b>{money(totals.avg)}</b></div>
        </div>

        <div>
          <div className="text-sm font-semibold mb-2">По столах</div>
          {Object.keys(totals.byTable).length === 0 && <div className="text-xs text-slate-500">Немає даних.</div>}
          {Object.entries(totals.byTable).map(([tid,v]) => (
            <div key={tid} className="border border-slate-200 rounded-xl p-3 mb-2">
              <div className="text-sm">{v.tableName}</div>
              <div className="text-xs text-slate-600">Час: {fmtDur(v.ms)} • Сума: {money(v.amount)} • Ігор: {v.games}</div>
            </div>
          ))}
        </div>

        <div>
          <div className="text-sm font-semibold mb-2">Ігри</div>
          {filtered.length === 0 && <div className="text-xs text-slate-500">Немає ігор у періоді.</div>}
          {filtered.map(r => (
            <div key={r.id} className="border border-slate-200 rounded-xl p-3 mb-2">
              <div className="text-sm">{r.tableName} • {money(r.amount)}</div>
              <div className="text-xs text-slate-600">
                {new Date(r.startedAt).toLocaleString()} — {new Date(r.finishedAt).toLocaleString()} • Тривалість: {
                  fmtDur(r.intervals.reduce((s,iv)=> s + ((iv.end ?? r.finishedAt) - iv.start), 0))
                } {r.shiftId ? `• Зміна: ${r.shiftId}` : ""}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SideDrawer>
  );
}
