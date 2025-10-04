
import React, { useEffect, useMemo, useRef, useState } from "react";
import ModalShell from "../components/ModalShell";
import LeftCalendar from "./reservations/LeftCalendar";
import { useReservations } from "../hooks/useReservations";
import { getMonthMatrix, isSameDay } from "./reservations/reservationUtils";
import ReservationForm from "./reservations/ReservationForm";
import "../styles/reservations.css";

function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d){ const x = new Date(d); x.setHours(23,59,59,999); return x; }

export default function ReservationsModal({ open, onClose, tables = [] }) {
  const { list, create, update, remove } = useReservations();
  const [nowTick, setNowTick] = useState(Date.now());
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [tableId, setTableId] = useState(0);
  const [stepMin, setStepMin] = useState(15);
  const [q, setQ] = useState("");
  const [editor, setEditor] = useState({ open:false, initial:null });

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const dayStart = startOfDay(selectedDate).toISOString();
    const dayEnd   = endOfDay(selectedDate).toISOString();
    const onDay = list.filter(r => r.startAt < dayEnd && r.endAt > dayStart);
    const forTable = onDay.filter(r => r.tableId === Number(tableId));
    const qq = q.trim().toLowerCase();
    if (!qq) return forTable;
    return forTable.filter(r => {
      return (r.code||r.id||"").toLowerCase().includes(qq) ||
             (r.customerName||"").toLowerCase().includes(qq) ||
             (r.notes||"").toLowerCase().includes(qq);
    });
  }, [list, selectedDate, tableId, q]);

  function openNewAt(minFromDayStart){
    const base = startOfDay(selectedDate);
    const start = new Date(base.getTime() + minFromDayStart * 60000);
    const end = new Date(start.getTime() + 60*60000);
    setEditor({ open:true, initial: { tableId: Number(tableId), startAt: start, endAt: end } });
  }
  function onSave(payload){
    if (payload.id){ // edit
      update(payload.id, payload);
    } else {
      const id = cryptoRandomId();
      const code = genCode(payload, tables);
      create({ ...payload, id, code });
    }
    setEditor({ open:false, initial:null });
  }
  function onDelete(rec){
    remove(rec.id);
    setEditor({ open:false, initial:null });
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Бронювання"
      maxWidth={1200}
      maxHeightVh={90}
      footer={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className="h-9 px-3 rounded-lg bg-slate-100 hover:bg-slate-200" onClick={()=> setSelectedDate(startOfDay(new Date()))}>Сьогодні</button>
            <select className="h-9 px-2 rounded-lg border border-slate-300" value={stepMin} onChange={(e)=>setStepMin(Number(e.target.value))}>
              {[5,10,15,30].map(x => <option key={x} value={x}>Крок часу: {x} хв</option>)}
            </select>
            <select className="h-9 px-2 rounded-lg border border-slate-300" value={tableId} onChange={(e)=>setTableId(Number(e.target.value))}>
              {(tables||[]).map(t => <option key={t.id} value={t.id}>{t.name || `Стіл ${t.id+1}`}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="h-9 w-64 px-3 rounded-lg border border-slate-300"
              placeholder="Пошук…"
              value={q}
              onChange={(e)=>setQ(e.target.value)}
            />
            <button
              className="h-9 px-3 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={()=> setEditor({ open:true, initial: { tableId: Number(tableId), startAt: new Date(selectedDate), endAt: new Date(selectedDate.getTime()+60*60000) } })}
            >
              + Нове
            </button>
          </div>
        </div>
      }
    >
      <div className="rsv-body">
        <aside className="rsv-left">
          <Calendar todayTick={nowTick} selected={selectedDate} onPick={(d)=> setSelectedDate(startOfDay(d))} />
          <DaySidebar
            day={selectedDate}
            tableId={tableId}
            records={filtered}
            onQuickNew={(dur)=> {
              const base = new Date(selectedDate);
              base.setHours(new Date().getHours(), Math.ceil(new Date().getMinutes()/10)*10, 0, 0);
              const start = base;
              const end = new Date(base.getTime() + dur*60000);
              setEditor({ open:true, initial: { tableId: Number(tableId), startAt: start, endAt: end } });
            }}
          />
        </aside>
        <main className="rsv-main">
          <Timeline
            stepMin={stepMin}
            nowTick={nowTick}
            records={filtered}
            onClickEmpty={(mins)=> openNewAt(mins)}
            onClickRec={(rec)=> setEditor({ open:true, initial: rec })}
          />
        </main>
      </div>

      {/* Editor */}
      {editor.open && (
        <ReservationForm
          open={editor.open}
          onClose={()=> setEditor({open:false, initial:null})}
          initial={editor.initial}
          tables={tables}
          list={list}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
    </ModalShell>
  );
}

/* ------------------ Calendar (inline, to avoid cross-file noise) ------------------ */
function Calendar({ todayTick, selected, onPick }){
  const today = new Date(todayTick);
  const [cursor, setCursor] = useState(new Date(selected));
  const matrix = useMemo(() => getMonthMatrix(cursor), [cursor]);

  useEffect(()=>{ setCursor(new Date(selected)); }, [selected]);

  const prevMonth = () => { const d = new Date(cursor); d.setMonth(d.getMonth()-1); setCursor(d); };
  const nextMonth = () => { const d = new Date(cursor); d.setMonth(d.getMonth()+1); setCursor(d); };

  return (
    <div className="leftcal">
      <div className="flex items-center justify-between mb-2">
        <button className="h-8 w-8 rounded-lg hover:bg-slate-100" onClick={prevMonth}>‹</button>
        <div className="leftcal-head">
          {cursor.toLocaleString("uk-UA",{month:"long", year:"numeric"})}
        </div>
        <button className="h-8 w-8 rounded-lg hover:bg-slate-100" onClick={nextMonth}>›</button>
      </div>
      <div className="leftcal-grid">
        {["Пн","Вт","Ср","Чт","Пт","Сб","Нд"].map((d) => <div key={d} className="leftcal-dow">{d}</div>)}
        {matrix.map((day, i) => {
          const isToday = isSameDay(day, today);
          const isSel   = isSameDay(day, selected);
          return (
            <button key={i} className={"leftcal-cell"+(isToday?" is-today":"")} onClick={()=> onPick?.(day)}>
              <span className={"leftcal-num "+(isSel?"ring-2 ring-emerald-500":"")}>{day.getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------ Timeline with blocks ------------------ */
function Timeline({ stepMin=15, nowTick, records=[], onClickEmpty, onClickRec }){
  const ref = useRef(null);
  const pxPerMin  = 8 / 5; // 5 хв = 8px
  const totalH    = Math.round(24 * 60 * pxPerMin) + 64;
  const hours = useMemo(()=> Array.from({length:24}, (_,h)=>h), []);

  const now = new Date(nowTick||Date.now());
  const nowTop = Math.round((now.getHours()*60 + now.getMinutes()) * pxPerMin);

  function handleClick(e){
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top + el.scrollTop;
    const mins = Math.max(0, Math.min(24*60 - stepMin, Math.round(y / (10) ) * 10)); // snap 10m
    onClickEmpty?.(mins);
  }

  return (
    <div className="rsv-grid" style={{height: totalH}}>
      <div className="rsv-hours" aria-hidden>
        {hours.map(h => (
          <div key={h} className="rsv-hour" style={{ position:"absolute", top: h*60*pxPerMin, height: 1 }}>
            <div className="rsv-hourchip">{String(h).padStart(2,"0")}:00</div>
          </div>
  ))}
        {/* labels for :30 */}
        {hours.map(h => (
          <div key={'m'+h} className="rsv-minlabel" style={{ top: (h*60 + 30)*pxPerMin }}>:{String(30).padStart(2,"0")}</div>
        ))}
      </div>
      <div className="rsv-canvas relative" ref={ref} onClick={handleClick}>
        {Array.from({length: (24*6)+1 }, (_,i)=> i*10).map((m)=> (
          <div key={'m'+m} className="rsv-hline opacity-40" style={{ top: Math.round(m*pxPerMin) }} />
        ))}

        {hours.map(h => <div key={h} className="rsv-hline" style={{ top: h*60*pxPerMin }} />)}
        <div className="rsv-now" style={{ top: nowTop }} />
        {(records||[]).map(r => {
          let sMin = minsFromMidnight(r.startAt);
          let eMin = minsFromMidnight(r.endAt);
          if (eMin < sMin) eMin = 24*60;
          sMin = Math.max(0, Math.min(24*60, sMin));
          eMin = Math.max(sMin+5, Math.min(24*60, eMin));
          const top  = Math.round(sMin * pxPerMin);
          const h    = Math.max(10, Math.round((eMin - sMin) * pxPerMin));
          return (
            <button
              key={r.id}
              className="absolute left-4 right-4 rounded-lg bg-emerald-600/90 hover:bg-emerald-700 text-white shadow-lg transition-all"
              style={{ top, height: h }}
              onClick={(e)=>{ e.stopPropagation(); onClickRec?.(r); }}
              title={r.code || r.id}
            >
              <div className="px-3 py-1 text-left">
                <div className="text-sm font-semibold truncate">{[r.customer1Name, r.customer2Name].filter(Boolean).join(" & ") || r.customerName || "Без імені"}</div>
                <div className="text-xs opacity-90">
                  {fmtTime(r.startAt)}–{fmtTime(r.endAt)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function minsFromMidnight(ts){
  const d = new Date(ts);
  return d.getHours()*60 + d.getMinutes();
}
function fmtTime(ts){
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function genCode(payload, tables){
  const d = new Date(payload.startAt);
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const tnum = String((payload.tableId ?? 0) + 1).padStart(2,"0");
  const tail = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${dd}.${mm}-${tnum}-${tail}`;
}
function cryptoRandomId(){
  try {
    const buf = new Uint8Array(6);
    crypto.getRandomValues(buf);
    return "res_"+Array.from(buf).map(b=>b.toString(16).padStart(2,"0")).join("");
  } catch {
    return "res_"+Math.random().toString(36).slice(2,10);
  }
}

/* ------------------ Sidebar under calendar: today's list + quick add ------------------ */
function DaySidebar({ day, tableId, records, onQuickNew }){
  const list = (records||[]).sort((a,b)=> new Date(a.startAt) - new Date(b.startAt));
  const dd = day.toLocaleDateString("uk-UA", { day:"2-digit", month:"2-digit" });
  return (
    <div className="mt-4 space-y-3">
      <div className="text-sm font-semibold text-slate-700">Сьогодні, {dd}</div>
      <div className="space-y-2 max-h-40 overflow-auto pr-1">
        {list.length ? list.map(r => (
          <div key={r.id} className="px-3 py-2 rounded-lg border border-slate-200 bg-white/60">
            <div className="text-sm font-medium truncate">{[r.customer1Name, r.customer2Name].filter(Boolean).join(" & ") || "Без імені"}</div>
            <div className="text-xs text-slate-500">{fmtTime(r.startAt)}–{fmtTime(r.endAt)}</div>
          </div>
        )) : <div className="text-xs text-slate-400">Бронювань на цей день ще немає.</div>}
      </div>

      <div className="text-xs uppercase tracking-wide text-slate-400 mt-3">Швидкі слоти</div>
      <div className="flex flex-wrap gap-2">
        {[30,60,90,120].map(min => (
          <button key={min} className="h-8 px-3 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-sm"
            onClick={()=> onQuickNew?.(min)}>
            {min} хв
          </button>
        ))}
      </div>
    </div>
  );
}