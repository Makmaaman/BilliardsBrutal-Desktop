import React, { useState, useEffect, useMemo, useCallback } from "react";
import ModalShell from "../components/ModalShell";
import { fmtDur, money } from "../utils/format";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Розширена статистика (охайний дизайн)
 * ФІКС: список змін читаємо з localStorage (bb_shifts_history_v1 + bb_shift_current_v1),
 * а не з чеків — тепер у випадайці видно всі зміни.
 */

const LS_DAY_PREFIX = "stats:day:";
const LS_SHIFTS = "bb_shifts_history_v1";
const LS_SHIFT  = "bb_shift_current_v1";

/* ===== helpers (логіка) ===== */
function ymd(ts){ return new Date(ts).toISOString().slice(0,10); }
function parseYmd(str, atStart){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || "");
  if (!m) return null;
  const y = +m[1], mon = +m[2]-1, d = +m[3];
  return atStart ? new Date(y,mon,d,0,0,0,0).getTime() : new Date(y,mon,d,23,59,59,999).getTime();
}
function makeDefaultRange(period, now = new Date()){
  const y = now.getFullYear(), m = now.getMonth();
  if (period==="day"){
    return { start: new Date(y,m,now.getDate(),0,0,0,0).getTime(), end: new Date(y,m,now.getDate(),23,59,59,999).getTime() };
  }
  if (period==="week"){
    const d = new Date(y,m,now.getDate()); const wd = (d.getDay()+6)%7;
    return { start: new Date(y,m,d.getDate()-wd,0,0,0,0).getTime(), end: new Date(y,m,d.getDate()-wd+6,23,59,59,999).getTime() };
  }
  if (period==="year"){
    return { start: new Date(y,0,1,0,0,0,0).getTime(), end: new Date(y,11,31,23,59,59,999).getTime() };
  }
  return { start: new Date(y,m,1,0,0,0,0).getTime(), end: new Date(y,m+1,0,23,59,59,999).getTime() };
}
function dayIter(startMs,endMs){
  const out=[]; const d0=new Date(new Date(startMs).setHours(0,0,0,0)).getTime(); const d1=new Date(new Date(endMs).setHours(23,59,59,999)).getTime();
  for(let t=d0;t<=d1;t+=86400000) out.push(ymd(t)); return out;
}
function readRecordsFromLS(range){
  const days = dayIter(range.start, range.end);
  const out = [];
  for (const d of days){
    const key = LS_DAY_PREFIX + d;
    let bucket=null; try { bucket = JSON.parse(localStorage.getItem(key) || "{}"); } catch {}
    if (bucket) out.push(...Object.values(bucket));
  }
  return out;
}
function buildSlicesForRange(range){
  const span = range.end - range.start;
  const DAY = 86400000, H = 3600000;
  if (span <= 2*DAY){
    const out=[]; const start=new Date(new Date(range.start).setMinutes(0,0,0)).getTime();
    const steps = Math.ceil((range.end - start + 1)/H);
    for (let i=0;i<steps;i++){ const s=start+i*H, e=Math.min(start+(i+1)*H-1, range.end);
      out.push({ label:String(new Date(s).getHours()).padStart(2,"0"), start:s, end:e });
    }
    return out;
  }
  if (span <= 90*DAY){
    const out=[]; const d0=new Date(new Date(range.start).setHours(0,0,0,0));
    for (let d=new Date(d0); d.getTime()<=range.end; d.setDate(d.getDate()+1)){
      const s=new Date(d.getFullYear(),d.getMonth(),d.getDate(),0,0,0,0).getTime();
      const e=new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59,999).getTime();
      out.push({ label:String(d.getDate()).padStart(2,"0"), start:Math.max(s,range.start), end:Math.min(e,range.end) });
    }
    return out;
  }
  const names=["Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];
  const out=[]; const sD=new Date(range.start), eD=new Date(range.end);
  const cur = new Date(sD.getFullYear(), sD.getMonth(), 1);
  while(cur <= eD){
    const s=new Date(cur.getFullYear(),cur.getMonth(),1,0,0,0,0).getTime();
    const e=new Date(cur.getFullYear(),cur.getMonth()+1,0,23,59,59,999).getTime();
    out.push({ label:names[cur.getMonth()], start:Math.max(s,range.start), end:Math.min(e,range.end) });
    cur.setMonth(cur.getMonth()+1);
  }
  return out;
}
function aggregateSeries(records, slices){
  const n=slices.length; const amount=Array(n).fill(0), hours=Array(n).fill(0), games=Array(n).fill(0);
  for (const r of records){
    const totalMs = (Array.isArray(r.intervals)? r.intervals.reduce((s,iv)=>s+((iv.end??r.finishedAt)-(iv.start||r.startedAt||r.finishedAt)),0) : Math.max(0,(r.finishedAt||0)-(r.startedAt||0))) || 1;
    for (let i=0;i<n;i++){
      const s=slices[i].start, e=slices[i].end;
      for (const iv of (r.intervals || [{ start:r.startedAt, end:r.finishedAt }])){
        const a=iv.start||r.startedAt||r.finishedAt, b=iv.end??r.finishedAt; if (!(a<b)) continue;
        const overlap=Math.max(0, Math.min(b,e) - Math.max(a,s) + 1);
        if (overlap>0){ hours[i]+=overlap/3600000; amount[i]+=Number(r.amount||0)*(overlap/totalMs); }
      }
    }
    const idx = slices.findIndex(sl => (r.finishedAt>=sl.start && r.finishedAt<=sl.end));
    if (idx>=0) games[idx]+=1;
  }
  for (let i=0;i<n;i++){ amount[i]=Math.round(amount[i]*100)/100; hours[i]=Math.round(hours[i]*100)/100; games[i]=Math.round(games[i]); }
  return { amount, hours, games };
}
function calcTotals(records){
  let totalAmount=0,totalMs=0,count=0;
  for (const r of records){
    const ms = Array.isArray(r.intervals)
      ? r.intervals.reduce((s,iv)=> s+((iv.end??r.finishedAt)-(iv.start||r.startedAt||r.finishedAt)),0)
      : Math.max(0,(r.finishedAt||0)-(r.startedAt||0));
    totalAmount += Number(r.amount||0);
    totalMs     += ms;
    count++;
  }
  return { totalAmount, totalMs, count, avgTicket: count ? totalAmount/count : 0 };
}

/* ===== small UI helpers ===== */
function Card({ title, right, children, onClick, className="" }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22 }}
      className={
        "rounded-2xl ring-1 ring-slate-200/80 bg-white/90 backdrop-blur shadow-sm hover:shadow-md transition-shadow " +
        (onClick ? "cursor-pointer " : "") + className
      }
      onClick={onClick}
    >
      {(title || right) && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200/70">
          <div className="text-sm font-medium">{title}</div>
          {right}
        </div>
      )}
      <div className="p-3 md:p-4">{children}</div>
    </motion.div>
  );
}
function Kpi({ label, value, sub }) {
  return (
    <Card>
      <div className="text-[12px] text-slate-500">{label}</div>
      <div className="text-xl md:text-2xl font-semibold tracking-wide">{value}</div>
      {sub ? <div className="text-[12px] text-slate-500 mt-1">{sub}</div> : null}
    </Card>
  );
}
function Badge({ children, tone="slate" }) {
  const map = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    blue:  "bg-blue-50 text-blue-700 ring-blue-200",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs ring-1 ${map[tone] || map.slate}`}>
      {children}
    </span>
  );
}
function MiniBarChart({ data, height=220, tooltipFormatter }) {
  const pad=26, barGap=10;
  const values=data.map(d=>Number(d.value)||0), labels=data.map(d=>String(d.label));
  const maxVal=Math.max(1,...values), n=Math.max(1,values.length);
  const bw = n<=20?28:n<=40?18:n<=80?12:8;
  const width = pad*2 + n*bw + barGap*(n-1);
  const plotH = height - pad*2;
  const gridYs = Array.from({length:4},(_,i)=> pad + Math.round(((i+1)*plotH)/4));
  const labelStep = n>80?Math.ceil(n/12):n>40?Math.ceil(n/10):n>24?2:1;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-full h-auto">
        {gridYs.map((y,i)=> (<line key={i} x1={pad} y1={y} x2={width-pad} y2={y} stroke="#e7edf5" />))}
        <line x1={pad} y1={pad} x2={pad} y2={height-pad} stroke="#cbd5e1" />
        <line x1={pad} y1={height-pad} x2={width-pad} y2={height-pad} stroke="#cbd5e1" />
        {values.map((v,i)=> {
          const h=Math.round((v/maxVal)*plotH), x=pad+i*(bw+barGap), y=height-pad-h;
          return (
            <g key={i}>
              <motion.rect
                initial={{ height: 0, y: height-pad }}
                animate={{ height: h, y }}
                transition={{ duration: 0.35, delay: i*0.01 }}
                x={x} width={bw} fill="#0f172a" opacity="0.9"
              >
                <title>{labels[i]}: {tooltipFormatter?tooltipFormatter(v):v}</title>
              </motion.rect>
              {h>18 && n<=60 && (
                <text x={x+bw/2} y={y-6} fontSize="11" textAnchor="middle" fill="#334155">
                  {tooltipFormatter?tooltipFormatter(v):v}
                </text>
              )}
            </g>
          );
        })}
        {labels.map((t,i)=> {
          if (i%labelStep!==0) return null;
          const x=pad+i*(bw+barGap)+Math.floor(bw/2);
          return <text key={i} x={x} y={height-pad+18} fontSize="12" textAnchor="middle" fill="#475569">{t}</text>;
        })}
      </svg>
    </div>
  );
}

/* ===== main modal ===== */
export default function StatsModal({ onClose, stats, summarize }) {
  const now = new Date();
  const [period, setPeriod] = useState("month");
  const [range, setRange] = useState(makeDefaultRange("month", now));
  const [fromInput, setFromInput] = useState(ymd(range.start));
  const [toInput, setToInput] = useState(ymd(range.end));
  const [shiftFilter, setShiftFilter] = useState("all");
  const [bigChart, setBigChart] = useState(null);

  // авто-діапазон при зміні пресету
  useEffect(() => {
    if (period === "range") return;
    const r = makeDefaultRange(period, now);
    setRange(r); setFromInput(ymd(r.start)); setToInput(ymd(r.end));
  }, [period]);

  const applyCustomRange = useCallback(() => {
    const start = parseYmd(fromInput, true);
    const end   = parseYmd(toInput, false);
    if (!start || !end || start > end) return alert("Невірний діапазон дат");
    setPeriod("range"); setRange({ start, end });
  }, [fromInput,toInput]);

  // читаємо чеки з LS (за днями) і мерджимо з пропами
  const persisted = useMemo(() => readRecordsFromLS(range), [range]);
  const combined  = useMemo(() => {
    const map = new Map();
    for (const r of [...persisted, ...(Array.isArray(stats)?stats:[])]) {
      const id = r.id || `${r.tableId||""}-${r.finishedAt||""}`;
      map.set(id, r);
    }
    return Array.from(map.values());
  }, [persisted, stats]);

  const ranged = useMemo(
    () => combined.filter(r => r && r.finishedAt >= range.start && r.finishedAt <= range.end),
    [combined, range]
  );

  // **НОВЕ**: зміни беремо з localStorage (історія + поточна) і фільтруємо по діапазону
  const shiftsInRange = useMemo(() => {
    /** читаємо історію закритих змін */
    let history = [];
    try { history = JSON.parse(localStorage.getItem(LS_SHIFTS) || "[]"); } catch {}
    /** поточна (відкрита) зміна */
    let current = null;
    try { current = JSON.parse(localStorage.getItem(LS_SHIFT) || "null"); } catch {}

    const list = [].concat(Array.isArray(history) ? history : []);
    if (current && current.id) list.push(current);

    // лишаємо ті, що хоч трохи перетинають діапазон
    const out = [];
    const seen = new Set();
    for (const s of list) {
      const id = s?.id;
      if (!id || seen.has(id)) continue;
      const openedAt = Number(s.openedAt || 0);
      const closedAt = Number(s.closedAt || openedAt); // якщо відкрита — беремо openedAt
      const overlaps = !(closedAt < range.start || openedAt > range.end);
      if (overlaps) { out.push({ id, openedAt, openedBy: s.openedBy || "user" }); seen.add(id); }
    }
    out.sort((a,b)=> (a.openedAt||0) - (b.openedAt||0));
    return out;
  }, [range]);

  const filtered = useMemo(() => {
    if (shiftFilter === "all") return ranged;
    return ranged.filter(r => (r.shiftId || "") === shiftFilter);
  }, [ranged, shiftFilter]);

  const totals = useMemo(
    () => (typeof summarize === "function" ? summarize(filtered) : calcTotals(filtered)),
    [filtered, summarize]
  );
  const slices = useMemo(() => buildSlicesForRange(range), [range]);
  const series = useMemo(() => aggregateSeries(filtered, slices), [filtered, slices]);

  const topTables = useMemo(() => {
    const m = new Map();
    for (const r of filtered){
      const key = r.tableName || `Стіл ${r.tableId ?? ""}`;
      const ms = Array.isArray(r.intervals)
        ? r.intervals.reduce((s,iv)=> s+((iv.end??r.finishedAt)-(iv.start||r.startedAt||r.finishedAt)),0)
        : Math.max(0,(r.finishedAt||0)-(r.startedAt||0));
      const cur = m.get(key) || { tableName:key, amount:0, ms:0, games:0 };
      cur.amount += Number(r.amount||0);
      cur.ms     += ms;
      cur.games  += 1;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a,b)=> b.amount-a.amount);
  }, [filtered]);

  const topPlayers = useMemo(() => {
    const m = new Map();
    for (const r of filtered){
      const players = Array.isArray(r.players)? r.players : [];
      if (!players.length) continue;
      const share = Number(r.amount||0)/players.length;
      for (const p of players){
        const id = p?.id || p?.name || "guest";
        const name = p?.name || (p?.id ? `ID:${p.id}` : "Гість");
        const cur = m.get(id) || { id, name, amount:0, games:0 };
        cur.amount += share;
        cur.games  += 1;
        m.set(id, cur);
      }
    }
    return Array.from(m.values()).sort((a,b)=> b.amount-a.amount);
  }, [filtered]);

  const btn = (p) =>
    "px-3 py-1.5 rounded-xl border text-sm transition select-none " +
    (p === period ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "border-slate-300 hover:bg-slate-50");

  const paymentBadge = (m) =>
    m === "cash" ? <Badge tone="green">Готівка</Badge> :
    m === "card" ? <Badge tone="blue">Карта</Badge> :
    <Badge>—</Badge>;

  return (
    <ModalShell
      title="Статистика"
      onClose={onClose}
      containerStyle={{ width: "calc(100% - 1.5rem)", maxWidth: 1360 }}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            className="h-9 px-3 rounded-xl border border-slate-300 hover:bg-slate-50"
            onClick={()=>{
              const header=["id","table","amount","startedAt","finishedAt","duration","players","shiftId","payment"];
              const rows = filtered.map(r=>{
                const ms = Array.isArray(r.intervals)
                  ? r.intervals.reduce((s,iv)=> s+((iv.end??r.finishedAt)-(iv.start||r.startedAt||r.finishedAt)),0)
                  : Math.max(0,(r.finishedAt||0)-(r.startedAt||0));
                const players = Array.isArray(r.players)&&r.players.length ? r.players.map(p=>p.name||p.id).join("; ") : "";
                return [r.id, r.tableName, String(r.amount??0).replace(",", "."), new Date(r.startedAt).toLocaleString(), new Date(r.finishedAt).toLocaleString(), fmtDur(ms), players, r.shiftId||"", r.paymentMethod||""];
              });
              const csv = [header,...rows].map(cols=> cols.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
              const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
              const url = URL.createObjectURL(blob); const a = document.createElement("a");
              a.href = url; a.download = `stats_${ymd(range.start)}_${ymd(range.end)}${shiftFilter!=="all"?`_${shiftFilter}`:""}.csv`; a.click(); URL.revokeObjectURL(url);
            }}
          >
            Експорт CSV
          </button>
          <button className="h-9 px-3 rounded-xl bg-slate-800 text-white" onClick={onClose}>Готово</button>
        </div>
      }
    >
      <AnimatePresence mode="popLayout">
        {/* Фільтри */}
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <button className={btn("day")} onClick={() => setPeriod("day")}>День</button>
            <button className={btn("week")} onClick={() => setPeriod("week")}>Тиждень</button>
            <button className={btn("month")} onClick={() => setPeriod("month")}>Місяць</button>
            <button className={btn("year")} onClick={() => setPeriod("year")}>Рік</button>

            <div className="ml-1 flex items-center gap-2">
              <input type="date" className="h-9 px-2 rounded-xl border border-slate-300" value={fromInput} onChange={(e)=>setFromInput(e.target.value)} />
              <span className="text-slate-500">—</span>
              <input type="date" className="h-9 px-2 rounded-xl border border-slate-300" value={toInput} onChange={(e)=>setToInput(e.target.value)} />
              <button className="h-9 px-3 rounded-xl border border-slate-300 hover:bg-slate-50" onClick={applyCustomRange}>Застосувати</button>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-slate-600">Зміна:</span>
              <select
                className="h-9 px-2 rounded-xl border border-slate-300"
                value={shiftFilter}
                onChange={(e)=>setShiftFilter(e.target.value)}
              >
                <option value="all">Усі</option>
                {shiftsInRange.map((s) => (
                  <option key={s.id} value={s.id}>
                    {new Date(s.openedAt).toLocaleDateString()} {new Date(s.openedAt).toLocaleTimeString().slice(0,5)} • {s.openedBy || "user"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* KPI */}
        <div className="grid md:grid-cols-4 gap-3 my-3">
          <Kpi label="Дохід" value={money(totals.totalAmount)} />
          <Kpi label="Час" value={fmtDur(totals.totalMs)} />
          <Kpi label="Ігор" value={String(totals.count)} />
          <Kpi label="Сер. чек" value={money(totals.avgTicket || 0)} />
        </div>

        {/* Графіки */}
        <div className="grid lg:grid-cols-3 gap-3 mb-3">
          <Card
            title="Дохід за період"
            onClick={()=> setBigChart({ title:"Дохід за період (детально)", data: series.amount.map((v,i)=>({label:slices[i].label, value:v})), unit:"₴" })}
          >
            <MiniBarChart data={series.amount.map((v,i)=>({label:slices[i].label, value:v}))} tooltipFormatter={(v)=>money(v)} />
          </Card>
          <Card
            title="Години за період"
            onClick={()=> setBigChart({ title:"Години за період (детально)", data: series.hours.map((v,i)=>({label:slices[i].label, value:v})), unit:"год" })}
          >
            <MiniBarChart data={series.hours.map((v,i)=>({label:slices[i].label, value:v}))} tooltipFormatter={(v)=>`${v.toFixed(2)} год.`} />
          </Card>
          <Card
            title="Кількість ігор"
            onClick={()=> setBigChart({ title:"Кількість ігор (детально)", data: series.games.map((v,i)=>({label:slices[i].label, value:v})), unit:"гр" })}
          >
            <MiniBarChart data={series.games.map((v,i)=>({label:slices[i].label, value:v}))} tooltipFormatter={(v)=>`${v} гр.`} />
          </Card>
        </div>

        {/* ТОПи */}
        <div className="grid lg:grid-cols-2 gap-3 mb-3">
          <Card title="Топ столів (дохід)">
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {topTables.length ? topTables.map((t,i)=>(
                <div key={i} className="px-1 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-right text-xs text-slate-500">{i+1}</span>
                    <div className="font-medium">{t.tableName}</div>
                  </div>
                  <div className="text-sm text-slate-600">
                    {fmtDur(t.ms)} • <b>{money(t.amount)}</b> • {t.games} гр.
                  </div>
                </div>
              )) : <div className="px-2 py-3 text-sm text-slate-500">Немає даних.</div>}
            </div>
          </Card>

          <Card title="Топ гравців (дохід)">
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {topPlayers.length ? topPlayers.map((p,i)=>(
                <div key={i} className="px-1 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-right text-xs text-slate-500">{i+1}</span>
                    <div className="font-medium">{p.name}</div>
                  </div>
                  <div className="text-sm text-slate-600">
                    <b>{money(p.amount)}</b> • {p.games} гр.
                  </div>
                </div>
              )) : <div className="px-2 py-3 text-sm text-slate-500">Немає даних.</div>}
            </div>
          </Card>
        </div>

        {/* Чеки */}
        <Card
          title="Чеки"
          right={<div className="text-xs text-slate-500">Всього: {filtered.length}</div>}
          className="mb-1"
        >
          <div className="max-h-[38vh] overflow-auto rounded-xl ring-1 ring-slate-200/70">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="text-left text-slate-600">
                  <th className="px-3 py-2 font-medium">Час</th>
                  <th className="px-3 py-2 font-medium">Стіл</th>
                  <th className="px-3 py-2 font-medium">Сума</th>
                  <th className="px-3 py-2 font-medium">Оплата</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r,i)=>(
                  <tr key={r.id || i} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2">{new Date(r.finishedAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{r.tableName || `Стіл ${r.tableId ?? ""}`}</td>
                    <td className="px-3 py-2 font-medium">{money(r.amount)}</td>
                    <td className="px-3 py-2">{paymentBadge(r.paymentMethod)}</td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td className="px-3 py-3 text-slate-500" colSpan={4}>Немає чеків у вибраному діапазоні.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Великий перегляд графіка */}
        {bigChart && (
          <ModalShell
            title={bigChart.title}
            onClose={()=> setBigChart(null)}
            containerStyle={{ width:"calc(100% - 3rem)", maxWidth: 1400 }}
          >
            <div className="w-full h-[65vh]">
              <MiniBarChart
                data={bigChart.data}
                height={520}
                tooltipFormatter={(v)=> bigChart.unit==="₴"? money(v) : `${v} ${bigChart.unit}`}
              />
            </div>
          </ModalShell>
        )}
      </AnimatePresence>
    </ModalShell>
  );
}
