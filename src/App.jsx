// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";

/* Екрани */
import CustomersModal from "./modals/CustomersModal";
import PromosModal from "./modals/PromosModal";
import ActivationScreen from "./auth/ActivationScreen";
import LoginScreen from "./auth/LoginScreen";

/* Компоненти */
import TopBar from "./components/TopBar";
import TableCard from "./components/TableCard";
import ChangelogModal from "./components/ChangelogModal";
import VersionStrip from "./components/VersionStrip";

/* Хук changelog */
import { useChangelog } from "./hooks/useChangelog";

/* Утіліти/сервіси */
import { CURRENCY, fmtDur, money } from "./utils/format";
import { lsGet, lsSet } from "./utils/storage";
import { costForInterval } from "./utils/tariffs";
import { makeBase, hitRelay } from "./services/esp";
import { escposReceipt, printReceipt } from "./services/print";

/* API клієнтів/бонусів (вже є у твоєму проекті) */
import { api } from "./lib/api";

/* ==============================
 * Константи / LocalStorage ключі
 * ============================== */
const DEFAULT_TARIFF = 250;
const DEFAULT_USERS = [
  { username: "admin",  role: "admin",  password: "admin" },
  { username: "marker", role: "marker", password: "1111"  },
];
const defaultRules = [
  { days: [1,2,3,4,5], from: "10:00", to: "18:00", rate: 200 },
  { days: [1,2,3,4,5], from: "18:00", to: "02:00", rate: 300 },
  { days: [0,6],       from: "00:00", to: "24:00", rate: 300 },
];

const MAX_TABLES = 10;

const LS_APP    = "billiards_brutal_v1";
const LS_USERS  = "billiards_brutal_users_v1";
const LS_RULES  = "billiards_brutal_rules_v1";
const LS_STATS  = "bb_stats_v1";
const LS_SHIFT  = "bb_shift_current_v1";
const LS_SHIFTS = "bb_shifts_history_v1";

/* Версія з Electron (safe) */
const APP_VERSION = (() => {
  try {
    const v = window?.versions?.app;
    if (typeof v === "function") return v() || "dev";
    if (typeof v === "string") return v || "dev";
  } catch {}
  return "dev";
})();

/* Допоміжник для пустого столу */
const blankTable = (i) => ({
  id: i,
  name: `Стіл ${i}`,
  isOn: false,
  isPaused: false,
  startedAt: 0,
  intervals: [],
  /* НОВЕ: призначені гравці (ID клієнтів, максимум 2) */
  players: [],
});

function round2(v){ return Math.round((Number(v)||0)*100)/100; }

/* ======================
 * Головний компонент
 * ====================== */
export default function App() {
  // початкові дані
  const boot = useMemo(() => lsGet(LS_APP, null), []);

  // --- Ліцензія ---
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [licenseChecked, setLicenseChecked] = useState(false);
  useEffect(() => {
    (async () => {
      const s = await window.license?.getStatus?.();
      setLicenseInfo(s || { ok:false });
      setLicenseChecked(true);
    })();
  }, []);
  async function refreshLicense() {
    const s = await window.license?.getStatus?.();
    setLicenseInfo(s || { ok:false });
  }

  // --- Changelog/версії ---
  const { entries: CHANGELOG_ENTRIES, footerTagline, shouldShowOnBoot, markSeen } = useChangelog(APP_VERSION);
  const [changelogOpen, setChangelogOpen] = useState(false);
  useEffect(() => {
    if (shouldShowOnBoot) {
      setChangelogOpen(true);
      markSeen(APP_VERSION);
    }
  }, [shouldShowOnBoot, markSeen]);

  // --- Базові налаштування ---
  const [tariff, setTariff]       = useState(boot?.tariff ?? DEFAULT_TARIFF);
  const [espIP, setEspIP]         = useState(boot?.espIP ?? "192.168.0.185");
  const [mockMode, setMockMode]   = useState(boot?.mockMode ?? true);

  const [printerIP, setPrinterIP]     = useState(boot?.printerIP ?? "");
  const [printerMock, setPrinterMock] = useState(boot?.printerMock ?? true);

  const [relays, setRelays] = useState(boot?.relays ?? {1:0,2:1,3:2,4:3});

  /* НОВЕ: % нарахування бонусів від нетто-суми після списання (1 бонус = 1 грн) */
  const [bonusEarnPct, setBonusEarnPct] = useState(boot?.bonusEarnPct ?? 5);

  const [tables, setTables] = useState(() => {
    const count = Math.max(1, Math.min(boot?.tables?.length ?? 4, MAX_TABLES));
    const restored = boot?.tables ?? Array.from({ length: count }, (_, i) => blankTable(i + 1));
    return restored.map((t, i) => ({
      ...blankTable(i + 1),
      ...t,
      intervals: Array.isArray(t?.intervals) ? t.intervals : [],
      startedAt: t?.startedAt || 0,
      isOn: !!t?.isOn,
      isPaused: !!t?.isPaused,
      players: Array.isArray(t?.players) ? t.players.slice(0,2) : [],
    }));
  });

  const [rules, setRules] = useState(() => lsGet(LS_RULES, defaultRules));
  const [users, setUsers] = useState(() => lsGet(LS_USERS, DEFAULT_USERS));
  const [session, setSession] = useState(boot?.session ?? null);

  const [stats, setStats] = useState(() => lsGet(LS_STATS, []));
  const [shift, setShift] = useState(() => lsGet(LS_SHIFT, null));
  const [shifts, setShifts] = useState(() => lsGet(LS_SHIFTS, []));

  const [busy, setBusy]   = useState(false);
  const [lastPing] = useState({ ok: null, at: 0, message: "" });

  /* НОВЕ: Клієнти (для гравців/бонусів) */
  const [customers, setCustomers] = useState([]);
  const customersMap = useMemo(() => {
    const m = new Map();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);
  async function reloadCustomers() {
    try { const list = await api("customers:list"); setCustomers(list || []); } catch {}
  }
  useEffect(() => { reloadCustomers(); }, []);

  // модалки
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsOpen, setStatsOpen]       = useState(false);
  const [shiftOpen, setShiftOpen]       = useState(false);
  const [tariffsOpen, setTariffsOpen]   = useState(false);
  const [usersOpen, setUsersOpen]       = useState(false);
  const [updatesOpen, setUpdatesOpen]   = useState(false);
  const [logoutOpen, setLogoutOpen]     = useState(false);

  // НОВЕ: модалки «Клієнти», «Акції», «Бонуси», «Гравці»
  const [showCustomers, setShowCustomers] = useState(false);
  const [showPromos, setShowPromos]       = useState(false);
  const [bonusModalOpen, setBonusModalOpen] = useState(false);
  const [playersModal, setPlayersModal]   = useState({ open:false, tableId:null });

  // меню (якір правого краю кнопки)
  const [menu, setMenu] = useState({ open:false, x:0, y:0 });
  const openMenuAt = (rect)=> setMenu({ open:true, x:rect.right, y:rect.bottom+8 });
  const closeMenu  = ()=> setMenu({ open:false, x:0, y:0 });

  // персист
  useEffect(()=>{ lsSet(LS_USERS, users); },[users]);
  useEffect(()=>{ lsSet(LS_RULES, rules); },[rules]);
  useEffect(()=>{ lsSet(LS_STATS, stats); },[stats]);
  useEffect(()=>{ lsSet(LS_SHIFT, shift); },[shift]);
  useEffect(()=>{ lsSet(LS_SHIFTS, shifts); },[shifts]);
  useEffect(()=>{
    lsSet(LS_APP, { tariff, espIP, mockMode, printerIP, printerMock, relays, tables, session, bonusEarnPct });
  }, [tariff, espIP, mockMode, printerIP, printerMock, relays, tables, session, bonusEarnPct]);

  // тікер
  const [, force] = useState(0);
  useEffect(()=>{ const i = setInterval(()=>force(v=>v+1), 1000); return ()=>clearInterval(i); },[]);

  // guard: без зміни — нічого не рахуємо
  const canOperate = !!shift;
  useEffect(() => {
    if (!shift) {
      setTables(prev => prev.map(t => t.isOn
        ? ({ ...t, isOn:false, startedAt:0, intervals:[...t.intervals] })
        : t
      ));
    }
  }, [shift]);

  /* ========= helpers ========= */
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
  const isAdmin = session?.role === "admin";

  function getPlayerNames(table){
    const ids = Array.isArray(table?.players) ? table.players : [];
    return ids.map(id => customersMap.get(id)?.name || "—");
  }

  // світло
  async function lightOn(tid) {
    if (!canOperate) { alert("Спочатку відкрийте зміну."); return; }
    const ch = relays[tid] ?? 0, base = makeBase(espIP);
    setBusy(true);
    try {
      await hitRelay({ baseUrl: base, relayNum: ch, state: "on", mock: mockMode });
      setTables(prev => prev.map(t => t.id !== tid ? t : (t.isOn ? t : { ...t, isOn:true, isPaused:false, startedAt: Date.now() })));
    } catch (e) {
      alert(`Помилка: ${e.message}`);
    } finally { setBusy(false); }
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
        return { ...t, isOn:false, isPaused:false, startedAt:0, intervals };
      }));
    } catch (e) {
      alert(`Помилка: ${e.message}`);
    } finally { setBusy(false); }
  }
  async function pauseTable(tid){ await lightOff(tid); }

  // завершення гри / чек
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

  /* ===== БОНУСИ: списання/нарахування для гравців столу ===== */
  async function settleBonusesForPlayers({ table, grossAmount }) {
    const ids = Array.isArray(table?.players) ? table.players.filter(Boolean) : [];
    if (!ids.length) return { spent:0, perUserSpent:[], net: grossAmount, earnedPerUser:[] };

    // отримати клієнтів
    const list = customers;
    const get = (id) => list.find(c => c.id === id) || null;
    const players = ids.map(id => get(id)).filter(Boolean);
    if (!players.length) return { spent:0, perUserSpent:[], net: grossAmount, earnedPerUser:[] };

    // 1) списання: намагаємось покрити суму порівну
    let remaining = round2(grossAmount);
    const perUserSpent = players.map(() => 0);
    const half = round2(grossAmount / players.length);
    players.forEach((p, i) => {
      const take = Math.min(half, p.bonusBalance || 0, remaining);
      perUserSpent[i] = round2(perUserSpent[i] + take);
      remaining = round2(remaining - take);
    });
    if (remaining > 0) {
      players.forEach((p, i) => {
        const can = Math.max(0, (p.bonusBalance || 0) - perUserSpent[i]);
        const take = Math.min(can, remaining);
        perUserSpent[i] = round2(perUserSpent[i] + take);
        remaining = round2(remaining - take);
      });
    }
    const spent = round2(perUserSpent.reduce((s,v)=>s+v,0));
    const net = round2(grossAmount - spent);

    // 2) нарахування: від нетто-суми порівну
    const earnTotal = round2(net * (Number(bonusEarnPct) || 0) / 100);
    const perUserEarn = earnTotal
      ? players.map((_,i) => round2(earnTotal / players.length))
      : players.map(()=>0);

    // застосувати у базу (API з твого проекту)
    for (let i = 0; i < players.length; i++) {
      const id = players[i].id;
      const toSpend = perUserSpent[i];
      if (toSpend > 0) await api("customers:bonus:add", { id, amount: -toSpend }); // списання
      const earn = perUserEarn[i];
      if (earn > 0) await api("customers:bonus:add", { id, amount: earn });       // нарахування
      await api("customers:visits:add", { id, amount: round2(net / players.length) }); // візит + витрачено нетто/2
    }
    await reloadCustomers(); // оновити balances у UI

    return { spent, perUserSpent, net, earnedPerUser: perUserEarn };
  }

  async function resetTable(tid, withPrint=false) {
    const t = tables.find(x => x.id === tid); if (!t) return;
    if (!withPrint && !confirm("Скинути час і суму для цього столу?")) return;

    const rec = finalizeGameRecord(t);
    const ch = relays[tid] ?? 0, base = makeBase(espIP);
    setBusy(true);
    try { await hitRelay({ baseUrl: base, relayNum: ch, state: "off", mock: mockMode }); } catch {}
    finally {
      if (rec) {
        // Бонуси/гравці
        settleBonusesForPlayers({ table: t, grossAmount: rec.amount })
          .then(({ net }) => {
            const finalAmount = round2(net);
            const rec2 = { ...rec, amount: finalAmount };
            setStats(prev => [...prev, rec2]);
          })
          .catch((e) => {
            console.error("bonuses error", e);
            setStats(prev => [...prev, rec]); // fallback: без змін
          })
          .finally(() => {
            setTables(prev => prev.map(x => x.id === tid ? { ...x, isOn:false, isPaused:false, startedAt:0, intervals:[] } : x));
            setBusy(false);
          });
      } else {
        setTables(prev => prev.map(x => x.id === tid ? { ...x, isOn:false, isPaused:false, startedAt:0, intervals:[] } : x));
        setBusy(false);
      }

      // Друк нетто-суми (після бонусів)
      if (withPrint && rec) {
        const totalMs = rec.intervals.reduce((s,iv)=>s+((iv.end??rec.finishedAt)-iv.start),0);
        settleBonusesForPlayers({ table: t, grossAmount: rec.amount }).then(({ net }) => {
          const payload = escposReceipt({ tableName:rec.tableName, totalMs:fmtDur(totalMs), amount:round2(net).toFixed(2), currency:CURRENCY });
          printReceipt(printerIP, payload, printerMock).then(()=>{
            alert(printerMock ? "Чек збережено у файл" : "Чек надруковано");
          });
        });
      }
    }
  }
  async function handlePrintAndReset(tid){ await resetTable(tid, true); }

  // перенесення гри
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
        if (t.id === fromId) return { ...t, isOn:false, isPaused:false, startedAt:0, intervals:[] };
        if (t.id === toId)   return { ...t, isOn:wasOn, isPaused:false, startedAt:wasOn?keepSA:0, intervals:keepIVs };
        return t;
      }));
    } finally { setBusy(false); }
  }

  // призначення гравців
  function openPlayersModal(tableId){ setPlayersModal({ open:true, tableId }); }
  function setPlayersForTable(tableId, playerIds){
    setTables(prev => prev.map(t => t.id===tableId ? { ...t, players: playerIds.slice(0,2) } : t));
  }

  // додати/видалити стіл
  function handleAddTable() {
    if (tables.length >= MAX_TABLES) { alert(`Максимум столів: ${MAX_TABLES}`); return; }
    const nextId = tables.length ? Math.max(...tables.map(t => t.id)) + 1 : 1;
    const newTable = blankTable(nextId);
    setTables(prev => [...prev, newTable]);
    setRelays(prev => ({ ...prev, [nextId]: Object.keys(prev||{}).length }));
  }
  function handleRemoveTable() {
    if (tables.length <= 1) { alert("Має залишитись хоча б один стіл."); return; }
    const lastInactiveIndex = [...tables].reverse().findIndex(t => !t.isOn && !t.isPaused);
    if (lastInactiveIndex === -1) { alert("Немає неактивних столів для видалення."); return; }
    const removeIndex = tables.length - 1 - lastInactiveIndex;
    const removed = tables[removeIndex];
    setTables(prev => prev.filter((_, i) => i !== removeIndex));
    setRelays(prev => { const copy = { ...(prev||{}) }; delete copy[removed.id]; return copy; });
  }

  // updater
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
    const res = await window.updates?.checkNow?.();
    if (!res?.ok) alert("Помилка перевірки оновлення: " + (res?.error || ""));
  }

  // зміна
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
    setTables(prev => prev.map(t => t.isOn ? ({ ...t, isOn:false, startedAt:0, intervals:[...t.intervals, {start:t.startedAt, end:Date.now()}] }) : t));
    const end = Date.now();
    const recs = stats.filter(r => r.shiftId === shift.id && r.finishedAt <= end);
    const totals = summarizeRecords(recs);
    const closed = { ...shift, closedAt:end, totals };
    setShifts(prev => [closed, ...prev]);
    setShift(null);

    // простий Z-report
    const lines = [];
    lines.push(`Duna Billiard Club — Z-REPORT`);
    lines.push(`Shift ID: ${closed.id}`);
    lines.push(`Opened: ${new Date(closed.openedAt).toLocaleString()} by ${closed.openedBy}`);
    lines.push(`Closed: ${new Date(closed.closedAt).toLocaleString()}`);
    lines.push(`--------------------------------------`);
    lines.push(`TOTAL: ${money(totals.totalAmount)} | time ${fmtDur(totals.totalMs)} | games ${totals.count}`);
    lines.push(`--------------------------------------`);
    for (const [_tid, v] of Object.entries(totals.byTable)) {
      lines.push(`${v.tableName.padEnd(10)} · ${fmtDur(v.ms)} · ${money(v.amount)} · games ${v.games}`);
    }
    const blob = new Blob([lines.join("\n")], { type:"text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:T]/g,'-').slice(0,19);
    a.href=url; a.download=`z_report_${stamp}.txt`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2_000);

    alert("Зміну закрито. Z-звіт збережено.");
  }

  // автентифікація
  function tryLogin(username, password) {
    const u = (lsGet(LS_USERS, DEFAULT_USERS)).find(u => u.username === username && u.password === password);
    if (!u) return false; setSession({ username:u.username, role:u.role }); return true;
  }
  function logout() { setSession(null); }

  // керування користувачами
  function addUser({ username, password, role }) {
    if (!username || !password) return alert("Заповніть логін і пароль.");
    if (users.find(u=>u.username===username)) return alert("Такий користувач вже існує.");
    setUsers(prev => [...prev, { username, password, role: role || "marker" }]);
  }
  function removeUser(username) {
    if (username === "admin") return alert("Користувача admin видаляти не можна.");
    if (username === session?.username) return alert("Не можна видалити поточного користувача.");
    setUsers(prev => prev.filter(u => u.username !== username));
  }
  function resetPwd(username, newPwd) {
    if (!newPwd) return;
    setUsers(prev => prev.map(u => u.username === username ? ({ ...u, password:newPwd }) : u));
  }

  // час відкриття зміни → бейдж
  const shiftBadge = shift
    ? `Зміна відкрита • ${new Date(shift.openedAt).toLocaleDateString()} ${new Date(shift.openedAt).toLocaleTimeString().slice(0,5)}`
    : "";

  /* ===========================
   * РЕНДЕР
   * =========================== */

  // Ліцензія перед логіном
  if (!licenseChecked) return null;
  if (!licenseInfo?.ok) return <ActivationScreen onActivated={refreshLicense} />;

  // Логін
  if (!session) return <LoginScreen tryLogin={tryLogin} />;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,.10),transparent_55%),linear-gradient(180deg,#f3fff9,#eaf2ff)] text-slate-900">

      {/* Top Bar */}
      <TopBar
        user={session?.username}
        role={session?.role}
        baseRate={tariff}
        espIp={espIP}
        espOnline={lastPing.ok ?? true}
        licenseInfo={licenseInfo}
        version={APP_VERSION}
        liveBadge={shiftBadge}
        onOpenMenu={(rect) => openMenuAt(rect)}
        onAddTable={handleAddTable}
        onRemoveTable={handleRemoveTable}
        onFeedback={() => alert("Напишіть нам у Telegram: @duna_billiard_support")}
      />

      {/* Меню */}
      {menu.open && (
        <div className="fixed inset-0 z-[9999]" onClick={closeMenu} onKeyDown={(e)=> e.key==='Escape' && closeMenu()} tabIndex={-1}>
          <div
            className="absolute origin-top-right bg-white/95 backdrop-blur ring-1 ring-slate-200/70 shadow-2xl rounded-xl py-2"
            style={{ top: menu.y, left: menu.x, transform: "translateX(-100%)", minWidth: 280 }}
            onClick={(e)=>e.stopPropagation()}
          >
            <span className="absolute -top-2 right-4 w-3 h-3 rotate-45 bg-white ring-1 ring-slate-200/70" aria-hidden/>
            <MenuItem onClick={()=>{ closeMenu(); setStatsOpen(true); }}>📈 Статистика</MenuItem>
            <MenuItem onClick={()=>{ closeMenu(); setShiftOpen(true); }}>🕒 Зміна</MenuItem>

            {/* Швидкий доступ (залишаю як у тебе) */}
            <MenuItem onClick={()=>{ closeMenu(); setShowCustomers(true); }}>👥 Клієнти</MenuItem>
            <MenuItem onClick={()=>{ closeMenu(); setShowPromos(true); }}>🏷️ Акції/Знижки</MenuItem>
            {/* НОВЕ: ручні бонуси маркером */}
            <MenuItem onClick={()=>{ closeMenu(); setBonusModalOpen(true); }}>🎁 Бонуси</MenuItem>

            {isAdmin && <>
              <Hr/>
              <MenuItem onClick={()=>{ closeMenu(); setTariffsOpen(true); }}>💸 Тарифи</MenuItem>
              <MenuItem onClick={()=>{ closeMenu(); setSettingsOpen(true); }}>⚙️ Налаштування</MenuItem>
              <MenuItem onClick={()=>{ closeMenu(); setUsersOpen(true); }}>👤 Користувачі</MenuItem>
            </>}
            <MenuItem onClick={()=>{ closeMenu(); setUpdatesOpen(true); }}>⬇️ Перевірити оновлення</MenuItem>
            <Hr/>
            <MenuItem onClick={()=>{ closeMenu(); setLogoutOpen(true); }}>🚪 Вийти</MenuItem>
          </div>
        </div>
      )}

      {/* Основна частина */}
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
              /* НОВЕ: гравці */
              onSetPlayers={openPlayersModal}
              playerNames={getPlayerNames(t)}
            />
          ))}
        </div>

        {/* статус оновлення (тости) */}
        {upd.phase === "downloading" && (
          <Toast>Завантаження оновлення… {upd.progress}%</Toast>
        )}
        {upd.phase === "downloaded" && (
          <Toast green>Оновлення готове • <button className="underline" onClick={()=>window.updates.quitAndInstall()}>Перезапустити й встановити</button></Toast>
        )}
        {upd.phase === "error" && (
          <Toast red>Помилка оновлення: {upd.message}</Toast>
        )}

        {/* Footer: версія / що нового */}
        <VersionStrip
          version={APP_VERSION}
          tagline={footerTagline}
          onOpen={() => setChangelogOpen(true)}
        />
      </main>

      {/* МОДАЛКИ */}
      {settingsOpen && (
        <SettingsModal
          onClose={()=>setSettingsOpen(false)}
          espIP={espIP} setEspIP={setEspIP}
          mockMode={mockMode} setMockMode={setMockMode}
          printerIP={printerIP} setPrinterIP={setPrinterIP}
          printerMock={printerMock} setPrinterMock={setPrinterMock}
          tables={tables} relays={relays} setRelays={setRelays}
          /* НОВЕ: параметр бонусів */
          bonusEarnPct={bonusEarnPct} setBonusEarnPct={setBonusEarnPct}
          onTestPrint={async ()=>{
            const payload = "TEST RECEIPT\n\n";
            await printReceipt(printerIP, payload, printerMock);
            alert(printerMock ? "Тестовий файл збережено" : "Надруковано");
          }}
        />
      )}

      {statsOpen && (
        <StatsModal
          onClose={()=>setStatsOpen(false)}
          stats={stats}
          summarize={summarizeRecords}
        />
      )}

      {shiftOpen && (
        <ShiftModal
          onClose={()=>setShiftOpen(false)}
          shift={shift}
          openShift={openShift}
          closeShift={closeShift}
          stats={stats}
          summarize={summarizeRecords}
        />
      )}

      {tariffsOpen && (
        <TariffsModal
          onClose={()=>setTariffsOpen(false)}
          rules={rules}
          setRules={setRules}
          baseRate={tariff}
          setBaseRate={setTariff}
        />
      )}

      {usersOpen && (
        <UsersModal
          users={users}
          me={session?.username}
          onClose={()=>setUsersOpen(false)}
          onAdd={addUser}
          onRemove={removeUser}
          onResetPwd={resetPwd}
        />
      )}

      {updatesOpen && (
        <UpdatesModal
          onClose={()=>setUpdatesOpen(false)}
          upd={upd}
          onCheck={manualCheck}
        />
      )}

      {logoutOpen && (
        <ConfirmModal
          title="Вийти з облікового запису?"
          okText="Вийти"
          okClass="bg-rose-600"
          onClose={()=>setLogoutOpen(false)}
          onOk={()=>{ setLogoutOpen(false); logout(); }}
        >
          Після виходу потрібно буде знову увійти (логін/пароль).
        </ConfirmModal>
      )}

      {changelogOpen && (
        <ChangelogModal
          version={APP_VERSION}
          entries={CHANGELOG_ENTRIES}
          onClose={()=>setChangelogOpen(false)}
        />
      )}

      {/* НОВЕ: модалки Клієнти / Акції / Бонуси / Гравці */}
      {showCustomers && <CustomersModal onClose={()=>{ setShowCustomers(false); reloadCustomers(); }} />}
      {showPromos && <PromosModal onClose={()=>setShowPromos(false)} />}
      {bonusModalOpen && <BonusesModal onClose={()=>{ setBonusModalOpen(false); reloadCustomers(); }} customers={customers} />}
      {playersModal.open && (
        <PlayersModal
          onClose={()=>setPlayersModal({ open:false, tableId:null })}
          customers={customers}
          table={tables.find(t => t.id === playersModal.tableId)}
          onSave={(ids)=>{ setPlayersForTable(playersModal.tableId, ids); setPlayersModal({ open:false, tableId:null }); }}
        />
      )}
    </div>
  );
}

/* =======================
 * Дрібні допоміжні JSX
 * ======================= */
function MenuItem({ children, onClick }) {
  return <button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100" onClick={onClick}>{children}</button>;
}
function Hr() { return <div className="my-1 h-px bg-slate-200" />; }
function Toast({ children, green, red }) {
  const cls = red
    ? "bg-rose-600"
    : green
    ? "bg-emerald-600"
    : "bg-black/80";
  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 ${cls} text-white px-3 py-2 rounded-lg text-sm z-[9999]`}>
      {children}
    </div>
  );
}

/* =======================
 * Модал «Налаштування» — додано % бонусів
 * ======================= */
function SettingsModal({
  onClose,
  espIP, setEspIP,
  mockMode, setMockMode,
  printerIP, setPrinterIP,
  printerMock, setPrinterMock,
  tables, relays, setRelays,
  bonusEarnPct, setBonusEarnPct,
  onTestPrint
}) {
  return (
    <ModalShell title="Налаштування" onClose={onClose} footer={
      <div className="flex justify-end gap-2">
        <button className="h-9 px-4 rounded-lg bg-slate-800 text-white" onClick={onClose}>Готово</button>
      </div>
    }>
      <div className="grid md:grid-cols-2 gap-6">
        <section className="space-y-3">
          <div className="text-sm font-medium">ESP контролер</div>
          <label className="block text-xs text-slate-500">IP-адреса</label>
          <input className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200" value={espIP} onChange={e=>setEspIP(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mockMode} onChange={e=>setMockMode(e.target.checked)} />
            Працювати в режимі «mock» (без реального реле)
          </label>
        </section>

        <section className="space-y-3">
          <div className="text-sm font-medium">Принтер чеків</div>
          <label className="block text-xs text-slate-500">IP-адреса принтера</label>
          <input className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200" value={printerIP} onChange={e=>setPrinterIP(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={printerMock} onChange={e=>setPrinterMock(e.target.checked)} />
            Режим «збереження у файл» (mock)
          </label>
          <button className="mt-2 h-9 px-3 rounded-lg bg-sky-600 text-white hover:brightness-110" onClick={onTestPrint}>Тестовий друк</button>
        </section>
      </div>

      <div className="mt-6">
        <div className="text-sm font-medium mb-2">Відповідність «Стіл → канал реле»</div>
        <div className="grid md:grid-cols-2 gap-3">
          {tables.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg ring-1 ring-slate-200 px-3 py-2">
              <div className="text-sm">{t.name}</div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">Канал:</span>
                <input
                  type="number"
                  className="w-20 h-8 px-2 rounded-lg ring-1 ring-slate-200"
                  value={relays[t.id] ?? 0}
                  onChange={e=>{
                    const val = Number(e.target.value);
                    setRelays(prev => ({ ...(prev||{}), [t.id]: isNaN(val) ? 0 : val }));
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* НОВЕ: бонуси */}
      <div className="mt-6 grid md:grid-cols-2 gap-6">
        <section className="space-y-2">
          <div className="text-sm font-medium">Бонусна програма</div>
          <label className="block text-xs text-slate-500">Нарахування бонусів, % від нетто</label>
          <input
            type="number"
            className="w-32 h-9 px-2 rounded-lg ring-1 ring-slate-200"
            value={bonusEarnPct}
            onChange={e=>setBonusEarnPct(Number(e.target.value)||0)}
            min={0}
            step={0.5}
          />
          <div className="text-xs text-slate-500">1 бонус = 1 грн при списанні. Бонуси діляться порівну між гравцями столу (до 2 осіб).</div>
        </section>
      </div>
    </ModalShell>
  );
}

/* =======================
 * Модал «Статистика» — ВЕЛИКІ графіки + власний діапазон + прокрутка
 * ======================= */
function StatsModal({ onClose, stats, summarize }) {
  const now = new Date();

  // Період: day | month | year | range
  const [period, setPeriod] = React.useState("month");

  // Діапазон дат
  const [range, setRange] = React.useState(makeDefaultRange("month", now));
  const [fromInput, setFromInput] = React.useState(ymd(range.start));
  const [toInput,   setToInput]   = React.useState(ymd(range.end));

  React.useEffect(() => {
    if (period === "range") return; // не перетираємо, якщо власний
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

  // Фільтр за діапазоном
  const filtered = React.useMemo(
    () => stats.filter(r => r.finishedAt >= range.start && r.finishedAt <= range.end),
    [stats, range]
  );

  // Підсумки (використати наявну summarize або локальний розрахунок)
  const totals = React.useMemo(
    () => (typeof summarize === "function" ? summarize(filtered) : calcTotals(filtered)),
    [filtered, summarize]
  );
  const avgCheck = totals.count ? totals.totalAmount / totals.count : 0;

  // Слайси часу + серії для графіків
  const slices = React.useMemo(() => buildSlicesForRange(range), [range]);
  const series = React.useMemo(() => aggregateSeries(filtered, slices), [filtered, slices]);

  const exportCsv = React.useCallback(() => {
    const header = ["id","table","amount","startedAt","finishedAt","duration"];
    const rows = filtered.map(r => {
      const ms = r.intervals.reduce((s, iv) => s + ((iv.end ?? r.finishedAt) - iv.start), 0);
      return [
        r.id,
        r.tableName,
        String(r.amount).replace(",", "."),
        new Date(r.startedAt).toLocaleString(),
        new Date(r.finishedAt).toLocaleString(),
        formatDur(ms)
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
    "px-3 py-1.5 rounded-lg border text-sm " +
    (p === period ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 hover:bg-slate-50");

  return (
    <ModalShell
      title="Статистика"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-">Записів: {filtered.length}</div>
          <div className="flex items-center gap-2">
            <button className="h-9 px-3 rounded-lg border border-slate-300" onClick={exportCsv}>Експорт CSV</button>
            <button className="h-9 px-3 rounded-lg bg-slate-800 text-white" onClick={onClose}>Готово</button>
          </div>
        </div>
      }
    >
      {/* ВНУТРІШНЯ ПРОКРУТКА МОДАЛУ */}
      <div className="max-h-[78vh] overflow-y-auto pr-1">
        {/* Перемикачі + діапазон */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button className={btn("day")}   onClick={()=>setPeriod("day")}>День</button>
          <button className={btn("month")} onClick={()=>setPeriod("month")}>Місяць</button>
          <button className={btn("year")}  onClick={()=>setPeriod("year")}>Рік</button>

          <div className="ml-2 flex items-center gap-2">
            <input type="date" className="h-9 px-2 rounded-lg border border-slate-300"
                   value={fromInput} onChange={(e)=>setFromInput(e.target.value)} />
            <span className="text-slate-500">—</span>
            <input type="date" className="h-9 px-2 rounded-lg border border-slate-300"
                   value={toInput} onChange={(e)=>setToInput(e.target.value)} />
            <button className="h-9 px-3 rounded-lg border border-slate-300" onClick={applyCustomRange}>Застосувати</button>
          </div>

          <div className="text-xs text-slate-500 ml-auto">
            {new Date(range.start).toLocaleDateString()} — {new Date(range.end).toLocaleDateString()}
          </div>
        </div>

        {/* KPI */}
        <div className="grid md:grid-cols-4 gap-3 mb-4">
          <Kpi title="Дохід" value={formatMoney(totals.totalAmount)} />
          <Kpi title="Час"   value={formatDur(totals.totalMs)} />
          <Kpi title="Відвідувачів (ігор)" value={String(totals.count)} />
          <Kpi title="Середній чек" value={formatMoney(avgCheck || 0)} />
        </div>

        {/* ВЕЛИКІ ГРАФІКИ */}
        <div className="grid grid-cols-1 gap-4 mb-4">
          <ChartCard title="Дохід за період">
            <MiniBarChart
              height={320}
              data={series.amount.map((v, i) => ({ label: slices[i].label, value: v }))}
              tooltipFormatter={(v)=> formatMoney(v)}
            />
          </ChartCard>

          <ChartCard title="Години за період">
            <MiniBarChart
              height={320}
              data={series.hours.map((v, i) => ({ label: slices[i].label, value: v }))}
              tooltipFormatter={(v)=> `${v.toFixed(2)} год.`}
            />
          </ChartCard>

          <ChartCard title="Відвідувачі за період">
            <MiniBarChart
              height={320}
              data={series.games.map((v, i) => ({ label: slices[i].label, value: v }))}
              tooltipFormatter={(v)=> `${v} гр.`}
            />
          </ChartCard>
        </div>

        {/* Останні операції — таблиця зі скролом */}
        <div className="rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 font-medium">Останні операції</div>
          <div className="max-h-[520px] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2">Стіл</th>
                  <th className="text-left px-3 py-2">Сума</th>
                  <th className="text-left px-3 py-2">Початок</th>
                  <th className="text-left px-3 py-2">Кінець</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice().reverse().map(r => (
                  <tr key={r.id} className="odd:bg-white even:bg-slate-50/50">
                    <td className="px-3 py-2">{r.tableName}</td>
                    <td className="px-3 py-2">{formatMoney(r.amount)}</td>
                    <td className="px-3 py-2">{new Date(r.startedAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{new Date(r.finishedAt).toLocaleString()}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td className="px-3 py-3 text-slate-500" colSpan={4}>Немає даних.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

/* ========= Форматування ========= */
function formatMoney(n) {
  try {
    return new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 2 }).format(n || 0);
  } catch {
    return `₴${(n || 0).toFixed(2)}`;
  }
}
function formatDur(ms) {
  ms = Math.max(0, Number(ms)||0);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

/* ========= Суми по таблицях (fallback якщо немає summarize) ========= */
function calcTotals(records) {
  const out = { totalAmount: 0, totalMs: 0, count: 0, byTable: {} };
  for (const r of records) {
    const ms = r.intervals.reduce((s, iv) => s + ((iv.end ?? r.finishedAt) - iv.start), 0);
    out.totalAmount += (r.amount || 0);
    out.totalMs += ms;
    out.count += 1;
    const key = r.tableName || "Стіл";
    const t = (out.byTable[key] ||= { tableName: key, amount: 0, ms: 0, games: 0 });
    t.amount += (r.amount || 0);
    t.ms += ms;
    t.games += 1;
  }
  return out;
}

/* ========= Хелпери дат ========= */
function makeDefaultRange(period, now=new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === "day") {
    const start = new Date(y, m, now.getDate(), 0, 0, 0, 0).getTime();
    const end   = new Date(y, m, now.getDate(), 23, 59, 59, 999).getTime();
    return { start, end };
  }
  if (period === "year") {
    const start = new Date(y, 0, 1, 0, 0, 0, 0).getTime();
    const end   = new Date(y, 11, 31, 23, 59, 59, 999).getTime();
    return { start, end };
  }
  // month
  const start = new Date(y, m, 1, 0, 0, 0, 0).getTime();
  const end   = new Date(y, m + 1, 0, 23, 59, 59, 999).getTime();
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
  const y = Number(m[1]), mm = Number(m[2]) - 1, dd = Number(m[3]);
  return atStart
    ? new Date(y, mm, dd, 0, 0, 0, 0).getTime()
    : new Date(y, mm, dd, 23, 59, 59, 999).getTime();
}

/* ========= Слайси для будь-якого діапазону ========= */
function buildSlicesForRange(range) {
  const span = range.end - range.start;
  const DAY = 86400000, H = 3600000;
  if (span <= 2 * DAY) {
    // hourly
    const out = [];
    const start = new Date(new Date(range.start).setMinutes(0,0,0)).getTime();
    const steps = Math.ceil((range.end - start + 1) / H);
    for (let i = 0; i < steps; i++) {
      const s = start + i * H;
      const e = Math.min(start + (i + 1) * H - 1, range.end);
      out.push({ label: String(new Date(s).getHours()).padStart(2,"0"), start: s, end: e });
    }
    return out;
  }
  if (span <= 90 * DAY) {
    // daily
    const out = [];
    const d0 = new Date(new Date(range.start).setHours(0,0,0,0));
    for (let d = new Date(d0); d.getTime() <= range.end; d.setDate(d.getDate() + 1)) {
      const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0).getTime();
      const e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23,59,59,999).getTime();
      out.push({ label: String(d.getDate()).padStart(2,"0"), start: Math.max(s, range.start), end: Math.min(e, range.end) });
    }
    return out;
  }
  // monthly
  const labels = ["Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];
  const out = [];
  const startD = new Date(range.start);
  const endD   = new Date(range.end);
  const cur = new Date(startD.getFullYear(), startD.getMonth(), 1);
  while (cur <= endD) {
    const s = new Date(cur.getFullYear(), cur.getMonth(), 1, 0,0,0,0).getTime();
    const e = new Date(cur.getFullYear(), cur.getMonth()+1, 0, 23,59,59,999).getTime();
    out.push({
      label: labels[cur.getMonth()],
      start: Math.max(s, range.start),
      end:   Math.min(e, range.end)
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

/* ========= Агрегація ========= */
function aggregateSeries(records, slices) {
  const n = slices.length;
  const amount = Array(n).fill(0);
  const hours  = Array(n).fill(0);
  const games  = Array(n).fill(0);

  for (const r of records) {
    const totalMs = r.intervals.reduce((s, iv) => s + ((iv.end ?? r.finishedAt) - iv.start), 0);
    const safeTotal = Math.max(1, totalMs);

    // пропорційно розкладаємо час/дохід по слайсах
    for (const iv of r.intervals) {
      const a = iv.start, b = (iv.end ?? r.finishedAt);
      if (!(a < b)) continue;
      for (let i = 0; i < n; i++) {
        const s = slices[i].start, e = slices[i].end;
        const overlap = Math.max(0, Math.min(b, e) - Math.max(a, s) + 1);
        if (overlap > 0) {
          hours[i]  += overlap / 3600000;
          amount[i] += (r.amount * (overlap / safeTotal));
        }
      }
    }
    // 1 гра = 1 відвідувач — у слот завершення
    const idx = findSliceIndex(slices, r.finishedAt);
    if (idx >= 0) games[idx] += 1;
  }

  for (let i = 0; i < n; i++) {
    amount[i] = Math.round(amount[i] * 100) / 100;
    hours[i]  = Math.round(hours[i] * 100) / 100;
    games[i]  = Math.round(games[i]);
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

/* ========= Велика бар-діаграма ========= */
function MiniBarChart({ data, height = 320, tooltipFormatter }) {
  const pad = 40;
  const barGap = 10;

  const values = data.map(d => Number(d.value) || 0);
  const labels = data.map(d => String(d.label));
  const maxVal = Math.max(1, ...values);
  const n = Math.max(1, values.length);

  const bw = n <= 20 ? 26 : n <= 40 ? 18 : n <= 80 ? 12 : 8;
  const width = pad * 2 + n * bw + barGap * (n - 1);
  const plotH = height - pad * 2;

  const gridYs = Array.from({ length: 4 }, (_, i) => pad + Math.round((i + 1) * plotH / 4));
  const labelStep =
    n > 80 ? Math.ceil(n / 12) :
    n > 40 ? Math.ceil(n / 10) :
    n > 24 ? 2 : 1;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-full h-auto">
        {gridYs.map((y, i) => (
          <line key={i} x1={pad} y1={y} x2={width - pad} y2={y} stroke="#e2e8f0" />
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
                <title>{labels[i]}: {tooltipFormatter ? tooltipFormatter(v) : v}</title>
              </rect>
              {h > 18 && n <= 60 && (
                <text x={x + bw/2} y={y - 6} fontSize="11" textAnchor="middle" fill="#334155">
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

function ChartCard({ title, children }) {
  return (
    <div className="rounded-xl ring-1 ring-slate-200 bg-white p-3">
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

/* =======================
 * Модал «Зміна»
 * ======================= */
function ShiftModal({ onClose, shift, openShift, closeShift, stats, summarize }) {
  const nowTotals = shift
    ? summarize(stats.filter(r => r.shiftId === shift.id))
    : null;

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
 * Модал «Тарифи»
 * ======================= */
function TariffsModal({ onClose, rules, setRules, baseRate, setBaseRate }) {
  const [localRules, setLocalRules] = useState(() => rules.map(cloneRule));
  const [base, setBase] = useState(baseRate);
  const [err, setErr] = useState("");

  function cloneRule(r) {
    return { days:[...(r.days||[])], from:r.from||"00:00", to:r.to||"24:00", rate:Number(r.rate||0) };
  }

  function addRule(preset) {
    const r = preset ?? { days:[1,2,3,4,5], from:"10:00", to:"18:00", rate: base || 200 };
    setLocalRules(v => [...v, cloneRule(r)]);
  }
  function removeRule(idx) {
    setLocalRules(v => v.filter((_,i)=>i!==idx));
  }
  function updateRule(idx, patch) {
    setLocalRules(v => v.map((r,i)=> i===idx ? { ...r, ...patch } : r));
  }
  function toggleDay(idx, day) {
    setLocalRules(v => v.map((r,i)=> {
      if (i!==idx) return r;
      const has = r.days.includes(day);
      return { ...r, days: has ? r.days.filter(d=>d!==day) : [...r.days, day].sort() };
    }));
  }

  function validateAll() {
    for (const r of localRules) {
      if (!r.days || r.days.length===0) return "У кожного правила мають бути обрані дні.";
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.from)) return `Невірний час "з" — ${r.from}`;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.to)) return `Невірний час "до" — ${r.to}`;
      if (isNaN(Number(r.rate)) || Number(r.rate) <= 0) return `Ставка має бути > 0`;
    }
    if (isNaN(Number(base)) || Number(base) <= 0) return "Базова ставка має бути > 0";
    return "";
  }

  function save() {
    const msg = validateAll();
    if (msg) { setErr(msg); return; }
    setRules(localRules.map(cloneRule));
    setBaseRate(Number(base));
    onClose();
  }

  // Пресети
  function applyWeekdayWeekendPreset() {
    const w = { days:[1,2,3,4,5], from:"10:00", to:"18:00", rate: Math.max(1, Math.round(base*0.8)) };
    const w2 = { days:[1,2,3,4,5], from:"18:00", to:"02:00", rate: Math.round(base*1.2) };
    const we = { days:[0,6], from:"00:00", to:"24:00", rate: Math.round(base*1.2) };
    setLocalRules([w, w2, we]);
  }
  function applyFlatAllDay() {
    setLocalRules([{ days:[0,1,2,3,4,5,6], from:"00:00", to:"24:00", rate: Number(base) }]);
  }

  return (
    <ModalShell title="Тарифи" onClose={onClose} footer={
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <button className="h-9 px-3 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" onClick={applyFlatAllDay}>Цілий день = базова</button>
          <button className="h-9 px-3 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" onClick={applyWeekdayWeekendPreset}>Будні/Вечір/Вихідні</button>
        </div>
        <div className="flex gap-2">
          <button className="h-9 px-4 rounded-lg bg-emerald-600 text-white" onClick={save}>Зберегти</button>
          <button className="h-9 px-4 rounded-lg bg-slate-800 text-white" onClick={onClose}>Закрити</button>
        </div>
      </div>
    }>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl ring-1 ring-slate-200 bg-white p-3">
          <div className="text-sm font-medium mb-2">Базова ставка</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="w-32 h-9 px-2 rounded-lg ring-1 ring-slate-200"
              value={base}
              onChange={e=>setBase(Number(e.target.value))}
            />
            <span className="text-sm text-slate-600">/ год</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">Використовується як дефолт і для підказок у пресетах.</div>
        </div>

        <div className="md:col-span-2 flex items-end justify-end">
          <button
            className="h-9 px-3 rounded-lg bg-sky-600 text-white hover:brightness-110"
            onClick={()=>addRule()}
          >
            Додати правило
          </button>
        </div>
      </div>

      {err && <div className="mt-3 text-sm text-rose-600">{err}</div>}

      <div className="mt-4 grid gap-3">
        {localRules.map((r, idx) => (
          <div key={idx} className="rounded-xl ring-1 ring-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm text-slate-600 w-full md:w-auto">Дні:</div>
              <DayPicker value={r.days} onToggle={(d)=>toggleDay(idx,d)} />
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">З</label>
                <input
                  className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200"
                  value={r.from}
                  onChange={e=>updateRule(idx, { from: e.target.value })}
                  placeholder="HH:mm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">До</label>
                <input
                  className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200"
                  value={r.to}
                  onChange={e=>updateRule(idx, { to: e.target.value })}
                  placeholder="HH:mm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Ставка</label>
                <input
                  type="number"
                  className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200"
                  value={r.rate}
                  onChange={e=>updateRule(idx, { rate: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end">
                <button className="w-full h-9 rounded-lg bg-rose-600 text-white" onClick={()=>removeRule(idx)}>
                  Видалити правило
                </button>
              </div>
            </div>
          </div>
        ))}
        {localRules.length === 0 && (
          <div className="text-sm text-slate-600">Правил немає. Додайте через «Додати правило» або використайте пресет.</div>
        )}
      </div>
    </ModalShell>
  );
}

function DayPicker({ value, onToggle }) {
  const days = [
    { d:1, t:"Пн" }, { d:2, t:"Вт" }, { d:3, t:"Ср" },
    { d:4, t:"Чт" }, { d:5, t:"Пт" }, { d:6, t:"Сб" }, { d:0, t:"Нд" },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {days.map(({d,t}) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            className={`h-8 px-3 rounded-full text-sm ring-1 ${on ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-slate-700 ring-slate-200"}`}
            onClick={()=>onToggle(d)}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

/* =======================
 * Модал «Користувачі»
 * ======================= */
function UsersModal({ users, me, onClose, onAdd, onRemove, onResetPwd }) {
  const [login, setLogin] = useState("");
  const [pwd, setPwd]     = useState("");
  const [role, setRole]   = useState("marker");
  const [newPwd, setNewPwd] = useState("");

  return (
    <ModalShell title="Користувачі" onClose={onClose} footer={
      <div className="text-right">
        <button className="h-9 px-4 rounded-lg bg-slate-800 text-white" onClick={onClose}>Готово</button>
      </div>
    }>
      {/* Додавання */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mb-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Логін</label>
          <input className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200 focus:outline-none" value={login} onChange={e=>setLogin(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Пароль</label>
          <input className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200 focus:outline-none" value={pwd} onChange={e=>setPwd(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Роль</label>
          <select className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200" value={role} onChange={e=>setRole(e.target.value)}>
            <option value="marker">marker</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <div>
          <button
            className="w-full h-9 rounded-lg bg-emerald-600 text-white hover:brightness-110"
            onClick={() => { onAdd({ username:login.trim(), password:pwd.trim(), role }); setLogin(""); setPwd(""); setRole("marker"); }}
          >
            Додати користувача
          </button>
        </div>
      </div>

      {/* Список */}
      <div className="divide-y divide-slate-200 rounded-lg ring-1 ring-slate-200 overflow-hidden">
        {users.map(u => (
          <div key={u.username} className="px-3 py-2 flex items-center gap-3 bg-white">
            <div className="w-7 h-7 rounded-full bg-slate-100 grid place-items-center text-xs">{u.username.slice(0,2).toUpperCase()}</div>
            <div className="flex-1">
              <div className="text-sm font-medium">{u.username} {u.username===me && <span className="text-[10px] text-emerald-600 ml-1">(це ви)</span>}</div>
              <div className="text-[11px] text-slate-500">роль: {u.role}</div>
            </div>
            <input
              placeholder="новий пароль"
              className="h-8 px-2 rounded-lg ring-1 ring-slate-200 text-sm"
              value={u.username===me ? "" : newPwd}
              onChange={e=>setNewPwd(e.target.value)}
              disabled={u.username===me}
              title={u.username===me ? "Не можна змінити пароль тут для поточного користувача" : "Введіть новий пароль та натисніть «OK»"}
            />
            <button
              className="h-8 px-2 rounded-lg bg-sky-600 text-white text-sm hover:brightness-110 disabled:opacity-50"
              onClick={()=>{ if (!newPwd) return; onResetPwd(u.username, newPwd); setNewPwd(""); }}
              disabled={u.username===me}
            >
              OK
            </button>
            <button
              className="h-8 px-2 rounded-lg bg-rose-600 text-white text-sm hover:brightness-110 disabled:opacity-50"
              onClick={()=>onRemove(u.username)}
              disabled={u.username==="admin" || u.username===me}
              title={u.username==="admin" ? "admin видаляти не можна" : ""}
            >
              Видалити
            </button>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

/* =======================
 * Модал «Перевірити оновлення»
 * ======================= */
function UpdatesModal({ onClose, upd, onCheck }) {
  const map = {
    idle: "Оновлень немає",
    checking: "Перевірка…",
    available: "Знайдено нову версію (завантажиться автоматично)",
    downloading: `Завантаження… ${upd.progress}%`,
    downloaded: "Оновлення готове — перезапустіть для встановлення",
    error: `Помилка: ${upd.message}`
  };
  return (
    <ModalShell title="Оновлення" onClose={onClose} footer={
      <div className="flex justify-end gap-2">
        <button className="h-9 px-3 rounded-lg bg-sky-600 text-white" onClick={onCheck}>Перевірити зараз</button>
        <button className="h-9 px-4 rounded-lg bg-slate-800 text-white" onClick={onClose}>Закрити</button>
      </div>
    }>
      <div className="text-sm">{map[upd.phase] ?? "Стан невідомий"}</div>
      {upd.phase === "downloaded" && (
        <div className="mt-3">
          <button className="h-9 px-3 rounded-lg bg-emerald-600 text-white" onClick={()=>window.updates.quitAndInstall()}>
            Перезапустити й встановити
          </button>
        </div>
      )}
    </ModalShell>
  );
}

/* =======================
 * Підтвердження
 * ======================= */
function ConfirmModal({ title, children, okText="OK", okClass="bg-emerald-600", onClose, onOk }) {
  return (
    <ModalShell title={title} onClose={onClose} footer={
      <div className="flex justify-end gap-2">
        <button className="h-9 px-4 rounded-lg bg-slate-200" onClick={onClose}>Скасувати</button>
        <button className={`h-9 px-4 rounded-lg text-white ${okClass}`} onClick={onOk}>{okText}</button>
      </div>
    }>
      <div className="text-sm text-slate-700">{children}</div>
    </ModalShell>
  );
}

/* =======================
 * БАЗОВИЙ каркас модалки
 * ======================= */
function ModalShell({ title, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-[10000] bg-black/30 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200" onClick={e=>e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button className="text-slate-500 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-200">{footer}</div>}
      </div>
    </div>
  );
}

/* =======================
 * НОВЕ: модал «Бонуси» (ручне нарахування/списання маркером)
 * ======================= */
function BonusesModal({ onClose, customers }) {
  const [cid, setCid] = useState(customers?.[0]?.id || "");
  const [amount, setAmount] = useState(0);

  async function addBonuses(sign) {
    const val = Number(amount)||0;
    if (!cid || !val) return;
    try {
      await api("customers:bonus:add", { id: cid, amount: sign * Math.abs(val) });
      alert(sign>0 ? "Бонуси нараховано" : "Бонуси списано");
    } catch (e) {
      alert("Помилка: " + (e?.message || e));
    }
  }

  return (
    <ModalShell title="Бонуси" onClose={onClose} footer={
      <div className="flex justify-between items-center">
        <div className="text-xs text-slate-500">1 бонус = 1 грн при списанні</div>
        <div className="flex gap-2">
          <button className="h-9 px-3 rounded-lg bg-emerald-600 text-white" onClick={()=>addBonuses(+1)}>Нарахувати</button>
          <button className="h-9 px-3 rounded-lg bg-rose-600 text-white" onClick={()=>addBonuses(-1)}>Списати</button>
          <button className="h-9 px-3 rounded-lg bg-slate-800 text-white" onClick={onClose}>Готово</button>
        </div>
      </div>
    }>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Клієнт</label>
          <select className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200" value={cid} onChange={e=>setCid(e.target.value)}>
            {customers.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `(${c.phone})` : ""} — баланс: {c.bonusBalance||0}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Кількість бонусів</label>
          <input type="number" className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200" value={amount} onChange={e=>setAmount(e.target.value)} />
        </div>
      </div>
    </ModalShell>
  );
}

/* =======================
 * НОВЕ: модал «Гравці столу» (вибір до двох клієнтів)
 * ======================= */
function PlayersModal({ onClose, customers, table, onSave }) {
  const [p1, setP1] = useState(table?.players?.[0] || "");
  const [p2, setP2] = useState(table?.players?.[1] || "");

  function save(){
    const ids = [p1, p2].filter(Boolean).slice(0,2);
    onSave(ids);
  }

  return (
    <ModalShell title={`Гравці — ${table?.name || ""}`} onClose={onClose} footer={
      <div className="flex justify-end gap-2">
        <button className="h-9 px-4 rounded-lg bg-emerald-600 text-white" onClick={save}>Зберегти</button>
        <button className="h-9 px-4 rounded-lg bg-slate-800 text-white" onClick={onClose}>Закрити</button>
      </div>
    }>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Гравець 1</label>
          <select className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200" value={p1} onChange={e=>setP1(e.target.value)}>
            <option value="">—</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Гравець 2</label>
          <select className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200" value={p2} onChange={e=>setP2(e.target.value)}>
            <option value="">—</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
    </ModalShell>
  );
}
