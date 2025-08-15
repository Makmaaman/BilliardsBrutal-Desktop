import React, { useEffect, useMemo, useState } from "react";

// UI
import LoginScreen from "./auth/LoginScreen";
import TopBar from "./components/TopBar";
import TableCard from "./components/TableCard";

// Drawers
import SettingsDrawer from "./drawers/SettingsDrawer";
import StatsDrawer from "./drawers/StatsDrawer";
import ShiftDrawer from "./drawers/ShiftDrawer";
import TariffsDrawer from "./drawers/TariffsDrawer";

// Utils & Services
import { CURRENCY, fmtDur, money } from "./utils/format";
import { lsGet, lsSet } from "./utils/storage";
import { costForInterval } from "./utils/tariffs";
import { makeBase, hitRelay } from "./services/esp";
import { escposReceipt, printReceipt } from "./services/print";

/** ------------------------
 *   Константи / дефолти
 *  ------------------------ */
const DEFAULT_TARIFF = 250;
const DEFAULT_USERS = [
  { username: "admin",  role: "admin",  password: "admin" },
  { username: "marker", role: "marker", password: "1111" },
];
const defaultRules = [
  { days: [1,2,3,4,5], from: "10:00", to: "18:00", rate: 200 },
  { days: [1,2,3,4,5], from: "18:00", to: "02:00", rate: 300 },
  { days: [0,6],       from: "00:00", to: "24:00", rate: 300 },
];

const LS_APP    = "billiards_brutal_v1";
const LS_USERS  = "billiards_brutal_users_v1";
const LS_RULES  = "billiards_brutal_rules_v1";
const LS_STATS  = "bb_stats_v1";
const LS_SHIFT  = "bb_shift_current_v1";
const LS_SHIFTS = "bb_shifts_history_v1";

const blankTable = (i) => ({ id:i, name:`Стіл ${i}`, isOn:false, startedAt:0, intervals:[] });

export default function App() {
  /** ------------------------
   *   Початкове відновлення
   *  ------------------------ */
  const boot = useMemo(() => lsGet(LS_APP, null), []);
  const [tariff, setTariff]       = useState(boot?.tariff ?? DEFAULT_TARIFF);
  const [espIP, setEspIP]         = useState(boot?.espIP ?? "192.168.0.185");
  const [mockMode, setMockMode]   = useState(boot?.mockMode ?? true);

  const [printerIP, setPrinterIP]     = useState(boot?.printerIP ?? "");
  const [printerMock, setPrinterMock] = useState(boot?.printerMock ?? true);

  const [relays, setRelays] = useState(boot?.relays ?? {1:0,2:1,3:2,4:3});
  const [tables, setTables] = useState(() => {
    const count = Math.max(1, Math.min(4, boot?.tables?.length ?? 3));
    const restored = boot?.tables ?? Array.from({ length: count }, (_, i) => blankTable(i + 1));
    return restored.map((t, i) => ({
      ...blankTable(i + 1),
      ...t,
      intervals: Array.isArray(t?.intervals) ? t.intervals : [],
      startedAt: t?.startedAt || 0,
      isOn: !!t?.isOn
    }));
  });

  const [rules, setRules] = useState(() => lsGet(LS_RULES, defaultRules));
  const [users, setUsers] = useState(() => lsGet(LS_USERS, DEFAULT_USERS));
  const [session, setSession] = useState(boot?.session ?? null);
  const [stats, setStats] = useState(() => lsGet(LS_STATS, []));
  const [shift, setShift] = useState(() => lsGet(LS_SHIFT, null));
  const [shifts, setShifts] = useState(() => lsGet(LS_SHIFTS, []));

  const [busy, setBusy] = useState(false);
  const [lastPing, setLastPing] = useState({ ok: null, at: 0, message: "" });

  // Видимість дроверів (ВАЖЛИВО: були "is not defined")
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsOpen, setStatsOpen]       = useState(false);
  const [shiftOpen, setShiftOpen]       = useState(false);
  const [tariffsOpen, setTariffsOpen]   = useState(false);

  // Контекстне меню (кнопка «Меню» у TopBar)
  const [menu, setMenu] = useState({ open:false, x:0, y:0, w:0 });
  const openMenuAt = (rect)=> setMenu({ open:true, x:rect.left, y:rect.bottom+6, w:rect.width });
  const closeMenu = ()=> setMenu({ open:false, x:0, y:0, w:0 });

  /** ------------------------
   *   Персист у localStorage
   *  ------------------------ */
  useEffect(()=>{ lsSet(LS_USERS, users); },[users]);
  useEffect(()=>{ lsSet(LS_RULES, rules); },[rules]);
  useEffect(()=>{ lsSet(LS_STATS, stats); },[stats]);
  useEffect(()=>{ lsSet(LS_SHIFT, shift); },[shift]);
  useEffect(()=>{ lsSet(LS_SHIFTS, shifts); },[shifts]);
  useEffect(()=>{
    lsSet(LS_APP, { tariff, espIP, mockMode, printerIP, printerMock, relays, tables, session });
  }, [tariff, espIP, mockMode, printerIP, printerMock, relays, tables, session]);

  /** ------------------------
   *   Тікер (рендерінг раз/сек)
   *  ------------------------ */
  const [,force] = useState(0);
  useEffect(()=>{ const i=setInterval(()=>force(x=>x+1), 1000); return ()=>clearInterval(i); },[]);

  /** ------------------------
   *   Головний guard: без зміни
   *  ------------------------ */
  const canOperate = !!shift;

  // Якщо зміна закрилась — гарантуємо, що столи не рахують
  useEffect(() => {
    if (!shift) {
      setTables(prev => prev.map(t => t.isOn ? ({ ...t, isOn:false, startedAt:0, intervals:[...t.intervals] }) : t));
    }
  }, [shift]);

  /** ------------------------
   *   Обчислення по столу
   *  ------------------------ */
  function tableMs(t) {
    const closed = t.intervals.reduce((s,iv)=> s + ((iv.end ?? Date.now()) - iv.start), 0);
    const open = t.isOn && t.startedAt ? (Date.now() - t.startedAt) : 0;
    return closed + open;
  }
  function tableCost(t) {
    const intervals = [...t.intervals];
    if (t.isOn && t.startedAt) intervals.push({ start: t.startedAt, end: Date.now() });
    return intervals.reduce((acc, iv) => acc + costForInterval(iv.start, iv.end ?? Date.now(), rules, tariff), 0);
  }

  /** ------------------------
   *   Керування світлом
   *  ------------------------ */
  async function lightOn(tid) {
    if (!canOperate) { alert("Спочатку відкрийте зміну."); return; }
    const ch = relays[tid] ?? 0, base = makeBase(espIP);
    setBusy(true);
    try {
      await hitRelay({ baseUrl: base, relayNum: ch, state: "on", mock: mockMode });
      setTables(prev => prev.map(t => t.id !== tid ? t : (t.isOn ? t : { ...t, isOn: true, startedAt: Date.now() })));
    } catch (e) { alert(`Помилка: ${e.message}`); } finally { setBusy(false); }
  }
  async function lightOff(tid) {
    const ch = relays[tid] ?? 0, base = makeBase(espIP);
    setBusy(true);
    try {
      await hitRelay({ baseUrl: base, relayNum: ch, state: "off", mock: mockMode });
      setTables(prev => prev.map(t => {
        if (t.id !== tid || !t.isOn) return t;
        let intervals = t.intervals;
        if (t.startedAt) intervals = [...intervals, { start: t.startedAt, end: Date.now() }];
        return { ...t, isOn: false, startedAt: 0, intervals };
      }));
    } catch (e) { alert(`Помилка: ${e.message}`); } finally { setBusy(false); }
  }
  async function pauseTable(tid){ await lightOff(tid); }

  /** ------------------------
   *   Скидання і друк чеку
   *  ------------------------ */
  function finalizeGameRecord(table) {
    const intervals = [...table.intervals];
    if (table.isOn && table.startedAt) intervals.push({ start: table.startedAt, end: Date.now() });
    if (intervals.length === 0) return null;
    const amount = intervals.reduce((acc, iv) => acc + costForInterval(iv.start, iv.end ?? Date.now(), rules, tariff), 0);
    const startedAt = intervals[0].start; const finishedAt = intervals[intervals.length-1].end ?? Date.now();
    return {
      id: `g_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      tableId: table.id, tableName: table.name,
      intervals, amount: Math.round(amount*100)/100,
      startedAt, finishedAt, shiftId: shift?.id ?? null, user: session?.username ?? "unknown"
    };
  }

  async function resetTable(tid, withPrint=false) {
    const t = tables.find(x => x.id === tid); if (!t) return;
    if (!withPrint && !confirm("Скинути час і суму для цього столу?")) return;

    const rec = finalizeGameRecord(t);
    const ch = relays[tid] ?? 0, base = makeBase(espIP);
    setBusy(true);
    try { await hitRelay({ baseUrl: base, relayNum: ch, state: "off", mock: mockMode }); } catch {}
    finally {
      if (rec) setStats(prev => [...prev, rec]);
      setTables(prev => prev.map(x => x.id === tid ? { ...x, isOn:false, startedAt:0, intervals:[] } : x));
      setBusy(false);
      if (withPrint && rec) {
        const totalMs = rec.intervals.reduce((s,iv)=>s+((iv.end??rec.finishedAt)-iv.start),0);
        const payload = escposReceipt({ tableName:rec.tableName, totalMs:fmtDur(totalMs), amount:rec.amount.toFixed(2), currency:CURRENCY });
        await printReceipt(printerIP, payload, printerMock);
        alert(printerMock ? "Чек збережено у файл" : "Чек надруковано");
      }
    }
  }
  async function handlePrintAndReset(tid){ await resetTable(tid, true); }

  /** ------------------------
   *   Перенесення гри
   *  ------------------------ */
  async function transfer(fromId, toId) {
    if (!canOperate) { alert("Спочатку відкрийте зміну."); return; }
    if (fromId === toId) return;

    const from = tables.find(t => t.id === fromId);
    const to   = tables.find(t => t.id === toId);
    if (!from || !to) return;

    const wasOn   = !!from.isOn;
    const keepSA  = from.startedAt || 0;
    const keepIVs = [...from.intervals];

    const base   = makeBase(espIP);
    const fromCh = relays[fromId] ?? 0;
    const toCh   = relays[toId]   ?? 1;

    setBusy(true);
    try {
      if (wasOn && !mockMode) {
        try { await hitRelay({ baseUrl: base, relayNum: fromCh, state: "off", mock: false }); } catch {}
        try { await hitRelay({ baseUrl: base, relayNum: toCh,   state: "on",  mock: false }); } catch {}
      }
      setTables(prev => prev.map(t => {
        if (t.id === fromId) return { ...t, isOn:false, startedAt:0, intervals:[] };
        if (t.id === toId)   return { ...t, isOn:wasOn, startedAt:wasOn?keepSA:0, intervals:keepIVs };
        return t;
      }));
    } finally { setBusy(false); }
  }

  const [upd, setUpd] = useState({ phase: "idle", progress: 0, message: "" });

useEffect(() => {
  if (!window?.updates) return;
  const off = window.updates.on((ev) => {
    if (ev.type === "checking")      setUpd({ phase: "checking" });
    if (ev.type === "available")     setUpd({ phase: "available" });
    if (ev.type === "not-available") setUpd({ phase: "idle" });
    if (ev.type === "progress")      setUpd({ phase: "downloading", progress: Math.round(ev.p.percent || 0) });
    if (ev.type === "downloaded")    setUpd({ phase: "downloaded" });
    if (ev.type === "error")         setUpd({ phase: "error", message: ev.message || "Update error" });
  });
  return off;
}, []);

async function manualCheck() {
  const res = await window.updates.checkNow();
  if (!res.ok) alert("Помилка перевірки оновлення: " + (res.error || ""));
}

  /** ------------------------
   *   Зміна (open/close)
   *  ------------------------ */
  function openShift() {
    if (shift) return alert("Зміна вже відкрита.");
    setShift({ id:`s_${Date.now()}`, openedAt:Date.now(), openedBy:session.username, closedAt:null, totals:null });
    alert("Зміну відкрито.");
  }
  function summarizeRecords(recs) {
    const byTable={}; let amount=0, ms=0; for (const r of recs) {
      const tms = r.intervals.reduce((s,iv)=> s + ((iv.end ?? r.finishedAt) - iv.start), 0);
      ms += tms; amount += r.amount;
      if (!byTable[r.tableId]) byTable[r.tableId] = { tableName:r.tableName, ms:0, amount:0, games:0 };
      byTable[r.tableId].ms += tms; byTable[r.tableId].amount += r.amount; byTable[r.tableId].games += 1;
    }
    return { totalAmount:amount, totalMs:ms, count:recs.length, byTable };
  }
  function closeShift() {
    if (!shift) return;
    // зупиняємо всі столи і закриваємо незакритий інтервал
    setTables(prev => prev.map(t => t.isOn ? ({ ...t, isOn:false, startedAt:0, intervals:[...t.intervals, {start:t.startedAt, end:Date.now()}] }) : t));

    const end = Date.now();
    const recs = stats.filter(r => r.shiftId === shift.id && r.finishedAt <= end);
    const totals = summarizeRecords(recs);
    const closed = { ...shift, closedAt:end, totals };
    setShifts(prev => [closed, ...prev]);
    setShift(null);

    // простий Z-звіт у файл (опційно)
    const lines = [];
    lines.push(`Duna Billiard Club — Z-REPORT`);
    lines.push(`Shift ID: ${closed.id}`);
    lines.push(`Opened: ${new Date(closed.openedAt).toLocaleString()} by ${closed.openedBy}`);
    lines.push(`Closed: ${new Date(closed.closedAt).toLocaleString()}`);
    lines.push(`--------------------------------------`);
    lines.push(`TOTAL: ${money(totals.totalAmount)} | time ${fmtDur(totals.totalMs)} | games ${totals.count}`);
    lines.push(`--------------------------------------`);
    for (const [tid, v] of Object.entries(totals.byTable)) {
      lines.push(`${v.tableName.padEnd(10)} · ${fmtDur(v.ms)} · ${money(v.amount)} · games ${v.games}`);
    }
    const blob = new Blob([lines.join("\n")], { type:"text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:T]/g,'-').slice(0,19);
    a.href=url; a.download=`z_report_${stamp}.txt`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2_000);

    alert("Зміну закрито. Z-звіт збережено.");
  }

  /** ------------------------
   *   Авторизація
   *  ------------------------ */
  const isAdmin = session?.role === "admin";
  function tryLogin(username, password) {
    const u = (lsGet(LS_USERS, DEFAULT_USERS)).find(u => u.username === username && u.password === password);
    if (!u) return false; setSession({ username:u.username, role:u.role }); return true;
  }
  function logout() { setSession(null); }

  /** ------------------------
   *   Рендер
   *  ------------------------ */
  if (!session) return <LoginScreen tryLogin={tryLogin} />;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,.12),transparent_60%),linear-gradient(180deg,#e8fff7,#dbeafe)] text-slate-900">
      <TopBar session={session} tariff={tariff} espIP={espIP} shift={shift} onOpenMenu={openMenuAt} />

      {menu.open && (
        <div className="fixed inset-0 z-[9999]" onClick={closeMenu}>
          <div className="absolute bg-white border border-slate-200 rounded-xl shadow-2xl py-2"
               style={{ top: menu.y, left: menu.x, minWidth: Math.max(240, menu.w + 80) }}
               onClick={e=>e.stopPropagation()}>
            <MenuItem onClick={()=>{ closeMenu(); setStatsOpen(true); }}>Статистика</MenuItem>
            <MenuItem onClick={()=>{ closeMenu(); setShiftOpen(true); }}>Зміна</MenuItem>
            {isAdmin && <>
              <Hr/><MenuItem onClick={()=>{ closeMenu(); setTariffsOpen(true); }}>Тарифи</MenuItem>
              <MenuItem onClick={()=>{ closeMenu(); setSettingsOpen(true); }}>Налаштування</MenuItem>
            </>}
            <MenuItem onClick={manualCheck}>Перевірити оновлення</MenuItem>
            <Hr/><MenuItem onClick={()=>{ closeMenu(); logout(); }}>Вийти</MenuItem>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-7">
          {tables.map((t) => (
            <TableCard
              key={t.id}
              table={t}
              relayChannel={relays[t.id]}
              cost={tableCost(t)}
              liveMs={tableMs(t)}
              canOperate={canOperate}
              busy={busy}
              onLightOn={lightOn}
              onLightOff={lightOff}
              onPause={pauseTable}
              onReset={resetTable}
              onPrintReset={handlePrintAndReset}
              onTransfer={transfer}
              tables={tables}
            />
          ))}
        </div>
        <div className="mt-8 text-center text-xs text-slate-500">
          v3.1 • «Час НЕ рахується без відкритої зміни»
        </div>

            {upd.phase === "downloading" && (
              <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-3 py-2 rounded-lg text-sm z-[9999]">
                Завантаження оновлення… {upd.progress}%
              </div>
            )}
            {upd.phase === "downloaded" && (
              <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm z-[9999]">
                Оновлення готове • <button className="underline" onClick={()=>window.updates.quitAndInstall()}>Перезапустити й встановити</button>
              </div>
            )}
            {upd.phase === "error" && (
              <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-rose-600 text-white px-3 py-2 rounded-lg text-sm z-[9999]">
                Помилка оновлення: {upd.message}
              </div>
            )}
        
      </main>

      {/* Drawers */}
      <SettingsDrawer
        open={settingsOpen} onClose={()=>setSettingsOpen(false)}
        espIP={espIP} setEspIP={setEspIP} mockMode={mockMode} setMockMode={setMockMode}
        lastPing={lastPing} setLastPing={setLastPing} busy={busy} setBusy={setBusy}
        tables={tables} relays={relays} setRelays={setRelays}
        printerIP={printerIP} setPrinterIP={setPrinterIP} printerMock={printerMock} setPrinterMock={setPrinterMock}
        onTestPrint={async ()=>{
          const payload = "TEST RECEIPT\n\n";
          await printReceipt(printerIP, payload, printerMock);
          alert(printerMock ? "Тестовий файл збережено" : "Надруковано");
        }}
      />

      <StatsDrawer open={statsOpen} onClose={()=>setStatsOpen(false)} stats={stats} />
      <ShiftDrawer open={shiftOpen} onClose={()=>setShiftOpen(false)} shift={shift} openShift={openShift} closeShift={closeShift} shifts={shifts} />
      <TariffsDrawer open={tariffsOpen} onClose={()=>setTariffsOpen(false)} rules={rules} setRules={setRules} defaultRules={defaultRules} />
    </div>
  );
}

/* Допоміжні маленькі компоненти (НЕ видаляй) */
function MenuItem({ children, onClick }) {
  return <button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100" onClick={onClick}>{children}</button>;
}
function Hr() {
  return <div className="my-1 h-px bg-slate-200" />;
}
