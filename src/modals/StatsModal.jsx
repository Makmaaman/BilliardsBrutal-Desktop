import React, { useState, useEffect, useMemo, useCallback } from "react";
import ModalShell from "../components/ModalShell";
import { fmtDur, money } from "../utils/format";

export default function StatsModal({ onClose, stats, summarize }) {
  const now = new Date();
  const safeStats = Array.isArray(stats) ? stats : [];

  const [period, setPeriod] = React.useState("month");
  const [range, setRange] = React.useState(makeDefaultRange("month", now));
  const [fromInput, setFromInput] = React.useState(ymd(range.start));
  const [toInput,   setToInput]   = React.useState(ymd(range.end));

  React.useEffect(() => {
    if (period === "range") return;
    const r = makeDefaultRange(period, now);
    setRange(r);
    setFromInput(ymd(r.start));
    setToInput(ymd(r.end));
  }, [period]);

  const applyCustomRange = React.useCallback(() => {
    const start = parseYmd(fromInput, true);
    const end   = parseYmd(toInput, false);
    if (!start || !end || start > end) return alert("Невірний діапазон дат");
    setPeriod("range");
    setRange({ start, end });
  }, [fromInput, toInput]);

  const filtered = React.useMemo(
    () => safeStats.filter(r => r && r.finishedAt >= range.start && r.finishedAt <= range.end),
    [safeStats, range]
  );

  const totals = React.useMemo(
    () => (typeof summarize === "function" ? summarize(filtered) : calcTotals(filtered)),
    [filtered, summarize]
  );
  const avgCheck = totals.count ? totals.totalAmount / totals.count : 0;

  const slices = React.useMemo(() => buildSlicesForRange(range), [range]);
  const series = React.useMemo(() => aggregateSeries(filtered, slices), [filtered, slices]);

  const topTables = React.useMemo(() => buildTopTables(filtered, 8), [filtered]);
  const topClients = React.useMemo(() => buildTopClients(filtered, 8), [filtered]);

  const exportCsv = React.useCallback(() => {
    const header = ["id","table","amount","startedAt","finishedAt","duration","players"];
    const rows = filtered.map(r => {
      const ms = r.intervals.reduce((s, iv) => s + ((iv.end ?? r.finishedAt) - iv.start), 0);
      const players = Array.isArray(r.players) && r.players.length
        ? r.players.map(p => p.name || (p.id ? `ID:${p.id}` : "Гість")).join("; ")
        : "";
      return [
        r.id,
        r.tableName,
        String(r.amount).replace(",", "."),
        new Date(r.startedAt).toLocaleString(),
        new Date(r.finishedAt).toLocaleString(),
        fmtDur(ms),
        players,
      ];
    });
    const csv = [header, ...rows].map(cols =>
      cols.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(",")
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `stats_${ymd(range.start)}_${ymd(range.end)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [filtered, range]);

  const btn = (p) =>
    "px-3 py-1.5 rounded-lg border text-sm transition " +
    (p === period ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 hover:bg-slate-50");

  return (
    <ModalShell
      title="Статистика"
      onClose={onClose}
      containerStyle={{ width: "calc(100% - 1.5rem)", maxWidth: "1360px" }}
      footer={
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">Записів: {filtered.length}</div>
          <div className="flex items-center gap-2">
            <button className="h-9 px-3 rounded-lg border border-slate-300 hover:bg-slate-50" onClick={exportCsv}>Експорт CSV</button>
            <button className="h-9 px-3 rounded-lg bg-slate-800 text-white hover:brightness-110" onClick={onClose}>Готово</button>
          </div>
        </div>
      }
    >
      {/* Контроли періоду */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button className={btn("day")} onClick={() => setPeriod("day")}>День</button>
        <button className={btn("week")} onClick={() => setPeriod("week")}>Тиждень</button>
        <button className={btn("month")} onClick={() => setPeriod("month")}>Місяць</button>
        <button className={btn("year")} onClick={() => setPeriod("year")}>Рік</button>

        <div className="ml-2 flex items-center gap-2">
          <input
            type="date"
            className="h-9 px-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
          />
          <span className="text-slate-500">—</span>
          <input
            type="date"
            className="h-9 px-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
          />
          <button className="h-9 px-3 rounded-lg border border-slate-300 hover:bg-slate-50" onClick={applyCustomRange}>
            Застосувати
          </button>
        </div>

        <div className="text-xs text-slate-500 ml-auto">
          {new Date(range.start).toLocaleDateString()} — {new Date(range.end).toLocaleDateString()}
        </div>
      </div>

      {/* KPI */}
      <div className="grid md:grid-cols-4 gap-3 mb-4">
        <Kpi title="Дохід" value={money(totals.totalAmount)} />
        <Kpi title="Час" value={fmtDur(totals.totalMs)} />
        <Kpi title="Ігор" value={String(totals.count)} />
        <Kpi title="Середній чек" value={money(avgCheck || 0)} />
      </div>

      {/* Графіки */}
      <div className="grid lg:grid-cols-3 gap-3 mb-4">
        <ChartCard title="Дохід за період">
          <MiniBarChart
            height={260}
            data={series.amount.map((v, i) => ({ label: slices[i].label, value: v }))}
            tooltipFormatter={(v) => money(v)}
          />
        </ChartCard>

        <ChartCard title="Години за період">
          <MiniBarChart
            height={260}
            data={series.hours.map((v, i) => ({ label: slices[i].label, value: v }))}
            tooltipFormatter={(v) => `${v.toFixed(2)} год.`}
          />
        </ChartCard>

        <ChartCard title="Кількість ігор">
          <MiniBarChart
            height={260}
            data={series.games.map((v, i) => ({ label: slices[i].label, value: v }))}
            tooltipFormatter={(v) => `${v} гр.`}
          />
        </ChartCard>
      </div>

      {/* Топи */}
      <div className="grid lg:grid-cols-2 gap-4">
        <TopTableCard tables={topTables} />
        <TopClientCard clients={topClients} />
      </div>
    </ModalShell>
  );
}

/* ======= УТИЛІТИ ДЛЯ СТАТИСТИКИ ======= */

function calcTotals(records) {
  const out = { totalAmount: 0, totalMs: 0, count: 0, byTable: {} };
  for (const r of records) {
    const ms = r.intervals.reduce((s, iv) => s + ((iv.end ?? r.finishedAt) - iv.start), 0);
    out.totalAmount += r.amount || 0;
    out.totalMs += ms;
    out.count += 1;

    const key = r.tableName || `Стіл ${r.tableId ?? ""}`;
    const t = (out.byTable[key] ||= { tableName: key, amount: 0, ms: 0, games: 0 });
    t.amount += r.amount || 0;
    t.ms += ms;
    t.games += 1;
  }
  return out;
}

function makeDefaultRange(period, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === "day") {
    const start = new Date(y, m, now.getDate(), 0, 0, 0, 0).getTime();
    const end = new Date(y, m, now.getDate(), 23, 59, 59, 999).getTime();
    return { start, end };
  }
  if (period === "week") {
    const d = new Date(y, m, now.getDate());
    const wd = (d.getDay() + 6) % 7; // Пн=0
    const start = new Date(y, m, d.getDate() - wd, 0, 0, 0, 0).getTime();
    const end = new Date(y, m, d.getDate() - wd + 6, 23, 59, 59, 999).getTime();
    return { start, end };
  }
  if (period === "year") {
    const start = new Date(y, 0, 1, 0, 0, 0, 0).getTime();
    const end = new Date(y, 11, 31, 23, 59, 59, 999).getTime();
    return { start, end };
  }
  const start = new Date(y, m, 1, 0, 0, 0, 0).getTime();
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999).getTime();
  return { start, end };
}
function ymd(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
function parseYmd(str, atStart) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || "");
  if (!m) return null;
  const y = Number(m[1]),
    mm = Number(m[2]) - 1,
    dd = Number(m[3]);
  return atStart ? new Date(y, mm, dd, 0, 0, 0, 0).getTime() : new Date(y, mm, dd, 23, 59, 59, 999).getTime();
}

function buildSlicesForRange(range) {
  const span = range.end - range.start;
  const DAY = 86400000, H = 3600000;

  // до ~2 діб — по годинах
  if (span <= 2 * DAY) {
    const out = [];
    const start = new Date(new Date(range.start).setMinutes(0, 0, 0)).getTime();
    const steps = Math.ceil((range.end - start + 1) / H);
    for (let i = 0; i < steps; i++) {
      const s = start + i * H;
      const e = Math.min(start + (i + 1) * H - 1, range.end);
      out.push({ label: String(new Date(s).getHours()).padStart(2, "0"), start: s, end: e });
    }
    return out;
  }

  // до ~90 діб — по днях
  if (span <= 90 * DAY) {
    const out = [];
    const d0 = new Date(new Date(range.start).setHours(0, 0, 0, 0));
    for (let d = new Date(d0); d.getTime() <= range.end; d.setDate(d.getDate() + 1)) {
      const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
      const e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
      out.push({ label: String(d.getDate()).padStart(2, "0"), start: Math.max(s, range.start), end: Math.min(e, range.end) });
    }
    return out;
  }

  // інакше — по місяцях
  const labels = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"];
  const out = [];
  const startD = new Date(range.start);
  const endD = new Date(range.end);
  const cur = new Date(startD.getFullYear(), startD.getMonth(), 1);
  while (cur <= endD) {
    const s = new Date(cur.getFullYear(), cur.getMonth(), 1, 0, 0, 0, 0).getTime();
    const e = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    out.push({ label: labels[cur.getMonth()], start: Math.max(s, range.start), end: Math.min(e, range.end) });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

function aggregateSeries(records, slices) {
  const n = slices.length;
  const amount = Array(n).fill(0);
  const hours = Array(n).fill(0);
  const games = Array(n).fill(0);

  for (const r of records) {
    const totalMs = r.intervals.reduce((s, iv) => s + ((iv.end ?? r.finishedAt) - iv.start), 0);
    const safeTotal = Math.max(1, totalMs);

    for (const iv of r.intervals) {
      const a = iv.start, b = iv.end ?? r.finishedAt;
      if (!(a < b)) continue;
      for (let i = 0; i < n; i++) {
        const s = slices[i].start, e = slices[i].end;
        const overlap = Math.max(0, Math.min(b, e) - Math.max(a, s) + 1);
        if (overlap > 0) {
          hours[i] += overlap / 3600000;
          amount[i] += r.amount * (overlap / safeTotal);
        }
      }
    }
    const idx = findSliceIndex(slices, r.finishedAt);
    if (idx >= 0) games[idx] += 1;
  }

  for (let i = 0; i < n; i++) {
    amount[i] = Math.round(amount[i] * 100) / 100;
    hours[i] = Math.round(hours[i] * 100) / 100;
    games[i] = Math.round(games[i]);
  }
  return { amount, hours, games };
}
function findSliceIndex(slices, ts) {
  for (let i = 0; i < slices.length; i++) {
    const s = slices[i];
    if (ts >= s.start && ts <= s.end) return i;
  }
  return -1;
}

function buildTopTables(records, limit = 10) {
  const m = new Map();
  for (const r of records) {
    const key = r.tableName || `Стіл ${r.tableId ?? ""}`;
    const ms = r.intervals.reduce((s, iv) => s + ((iv.end ?? r.finishedAt) - iv.start), 0);
    const cur = m.get(key) || { tableName: key, amount: 0, ms: 0, games: 0 };
    cur.amount += r.amount || 0;
    cur.ms += ms;
    cur.games += 1;
    m.set(key, cur);
  }
  return Array.from(m.values()).sort((a, b) => b.amount - a.amount).slice(0, limit);
}

function buildTopClients(records, limit = 10) {
  const m = new Map();
  for (const r of records) {
    const players = Array.isArray(r.players) ? r.players : [];
    if (!players.length) continue;
    const share = (r.amount || 0) / players.length;
    for (const p of players) {
      const key = p?.id || p?.name || "guest";
      const name = p?.name || (p?.id ? `ID:${p.id}` : "Гість");
      const cur = m.get(key) || { id: p?.id ?? null, name, amount: 0, games: 0 };
      cur.amount += share;
      cur.games += 1;
      m.set(key, cur);
    }
  }
  return Array.from(m.values()).sort((a, b) => b.amount - a.amount).slice(0, limit);
}

/* ===== UI елементи статистики ===== */

function ChartCard({ title, children }) {
  return (
    <div className="rounded-xl ring-1 ring-slate-200 bg-white p-2 md:p-3">
      <div className="text-sm font-medium mb-2">{title}</div>
      {children}
    </div>
  );
}
function Kpi({ title, value }) {
  return (
    <div className="rounded-xl ring-1 ring-slate-200 px-4 py-3 bg-white">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
function MiniBarChart({ data, height = 240, tooltipFormatter }) {
  const pad = 26;
  const barGap = 10;
  const values = data.map((d) => Number(d.value) || 0);
  const labels = data.map((d) => String(d.label));
  const maxVal = Math.max(1, ...values);
  const n = Math.max(1, values.length);
  const bw = n <= 20 ? 28 : n <= 40 ? 18 : n <= 80 ? 12 : 8;
  const width = pad * 2 + n * bw + barGap * (n - 1);
  const plotH = height - pad * 2;
  const gridYs = Array.from({ length: 4 }, (_, i) => pad + Math.round(((i + 1) * plotH) / 4));
  const labelStep = n > 80 ? Math.ceil(n / 12) : n > 40 ? Math.ceil(n / 10) : n > 24 ? 2 : 1;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-full h-auto">
        {gridYs.map((y, i) => (
          <line key={i} x1={pad} y1={y} x2={width - pad} y2={y} stroke="#e7edf5" />
        ))}
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#cbd5e1" />
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#cbd5e1" />

        {values.map((v, i) => {
          const h = Math.round((v / maxVal) * plotH);
          const x = pad + i * (bw + barGap);
          const y = height - pad - h;
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={h} fill="#0f172a" opacity="0.9">
                <title>
                  {labels[i]}: {tooltipFormatter ? tooltipFormatter(v) : v}
                </title>
              </rect>
              {h > 18 && n <= 60 && (
                <text x={x + bw / 2} y={y - 6} fontSize="11" textAnchor="middle" fill="#334155">
                  {tooltipFormatter ? tooltipFormatter(v) : v}
                </text>
              )}
            </g>
          );
        })}

        {labels.map((t, i) => {
          if (i % labelStep !== 0) return null;
          const x = pad + i * (bw + barGap) + Math.floor(bw / 2);
          return (
            <text key={i} x={x} y={height - pad + 18} fontSize="12" textAnchor="middle" fill="#475569">
              {t}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
function TopTableCard({ tables }) {
  return (
    <div className="rounded-xl ring-1 ring-slate-200 bg-white">
      <div className="px-4 py-2 border-b border-slate-200 font-medium">Топ столів (дохід)</div>
      <div className="divide-y divide-slate-100">
        {tables.map((t, i) => (
          <div key={i} className="px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 text-right text-xs text-slate-500">{i + 1}</span>
              <div className="font-medium">{t.tableName}</div>
            </div>
            <div className="text-sm text-slate-600">
              {fmtDur(t.ms)} • <b>{money(t.amount)}</b> • {t.games} гр.
            </div>
          </div>
        ))}
        {tables.length === 0 && <div className="px-4 py-3 text-sm text-slate-500">Немає даних.</div>}
      </div>
    </div>
  );
}
function TopClientCard({ clients }) {
  return (
    <div className="rounded-xl ring-1 ring-slate-200 bg-white">
      <div className="px-4 py-2 border-b border-slate-200 font-medium">Топ клієнтів (дохід)</div>
      <div className="divide-y divide-slate-100">
        {clients.map((c, i) => (
          <div key={i} className="px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 text-right text-xs text-slate-500">{i + 1}</span>
              <div className="font-medium">{c.name}</div>
            </div>
            <div className="text-sm text-slate-600">
              <b>{money(c.amount)}</b> • {c.games} гр.
            </div>
          </div>
        ))}
        {clients.length === 0 && (
          <div className="px-4 py-3 text-sm text-slate-500">
            Немає даних (у старих записах могли не зберігатися гравці).
          </div>
        )}
      </div>
    </div>
  );
}

/* =======================
 * Модал «Зміна»
 * ======================= */
