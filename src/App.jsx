// src/App.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";

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
import ErrorBoundary from "./components/ErrorBoundary";
import ReservationsTicker from "./components/ReservationsTicker";

/* Хук changelog */
import { useChangelog } from "./hooks/useChangelog";

/* Утіліти/сервіси */
import { CURRENCY, fmtDur, money } from "./utils/format";
import { lsGet, lsSet } from "./utils/storage";
import { costForInterval } from "./utils/tariffs";
import { makeBase, hitRelay } from "./services/esp";
import { escposReceipt, printReceipt } from "./services/print";

/* API клієнтів/бонусів */
import { api } from "./lib/api";

/* Бронювання */
import ReservationsModal from "./modals/ReservationsModal";
// Modals (static imports)
import LicenseModal from './modals/LicenseModal.jsx';
import SettingsModal from "./modals/SettingsModal";
import StatsModal from "./modals/StatsModal";
import ShiftModal from "./modals/ShiftModal";
import TariffsModal from "./modals/TariffsModal";
import UsersModal from "./modals/UsersModal";
import UpdatesModal from "./modals/UpdatesModal";
import ConfirmModal from "./modals/ConfirmModal";
import BonusesModal from "./modals/BonusesModal";
import PlayersModal from "./modals/PlayersModal";


function isValidIPv4(ip){
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(ip||'').trim());
}

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
  players: [],
  // поля бонусного режиму
  bonusMode: false,
  bonusCap: 0,
  bonusBaseAmount: 0,
  bonusSpent: 0,
  bonusExhausted: false,
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
  const [relayIPs, setRelayIPs] = useState(boot?.relayIPs ?? {});
  const [controllers, setControllers] = useState(boot?.controllers ?? []);
  const [tableCtrl, setTableCtrl] = useState(boot?.tableCtrl ?? {});


  /* БОНУСИ: 1) % від нетто  2) грн/год (нове) */
  const [bonusEarnPct, setBonusEarnPct]   = useState(boot?.bonusEarnPct ?? 5);
  const [bonusEarnMode, setBonusEarnMode] = useState(boot?.bonusEarnMode ?? "per_hour"); // "per_hour" | "percent"
  const [bonusPerHour, setBonusPerHour]   = useState(boot?.bonusPerHour ?? 31.25);       // грн за 1 годину

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
      bonusMode: !!t?.bonusMode,
      bonusCap: Number(t?.bonusCap || 0),
      bonusBaseAmount: Number(t?.bonusBaseAmount || 0),
      bonusSpent: Number(t?.bonusSpent || 0),
      bonusExhausted: !!t?.bonusExhausted,
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

  /* Клієнти */
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
  const [licenseOpen, setLicenseOpen]   = useState(false);
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

  /* НОВЕ: модалка бронювання */
  const [showReservations, setShowReservations] = useState(false);

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
    lsSet(LS_APP, {
      tariff, espIP, mockMode, printerIP, printerMock, relays, relayIPs, tables, session,
      bonusEarnPct, bonusEarnMode, bonusPerHour,
      controllers, tableCtrl});
  }, [tariff, espIP, mockMode, printerIP, printerMock, relays, relayIPs, tables, session, bonusEarnPct, bonusEarnMode, bonusPerHour, controllers, tableCtrl]);

  // тікер — паузимо, якщо відкрита будь-яка модалка
  const [, force] = useState(0);
  const anyModalOpen =
    settingsOpen || statsOpen || shiftOpen || tariffsOpen || usersOpen || updatesOpen || logoutOpen ||
    changelogOpen || showCustomers || showPromos || bonusModalOpen || playersModal.open || menu.open || showReservations;

  useEffect(() => {
    const i = setInterval(() => { if (!anyModalOpen) force(v => v + 1); }, 1000);
    return () => clearInterval(i);
  }, [anyModalOpen]);

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

  function getPlayerInfo(table){
    const ids = Array.isArray(table?.players) ? table.players : [];
    return ids
      .map(id => {
        const c = customersMap.get(id);
        return c ? { id: c.id, name: c.name || "—", balance: Number(c.bonusBalance || 0) } : null;
      })
      .filter(Boolean);
  }

  // світло
  async function lightOn(tid) {
    if (!canOperate) { alert("Спочатку відкрийте зміну."); return; }
    const t = tables.find(x => x.id === tid);

    // Захист: «За бонуси» без гравців
    if (t?.bonusMode) {
      const ids = Array.isArray(t?.players) ? t.players.filter(Boolean) : [];
      if (ids.length === 0) {
        alert("Режим «За бонуси» увімкнено, але гравців не вибрано. Оберіть гравців або вимкніть режим.");
        return;
      }
    }

    const ch = relays[tid] ?? 0;
    const ipOverride = (relayIPs && typeof relayIPs[tid] === 'string') ? relayIPs[tid].trim() : '';
    const base = (ipOverride && isValidIPv4(ipOverride)) ? makeBase(ipOverride) : null;
    setBusy(true);
    try {
      if (base) { await hitRelay({ baseUrl: base, relayNum: ch, state: "on", mock: mockMode }); }
      setTables(prev => prev.map(t => t.id !== tid ? t : (t.isOn ? t : { ...t, isOn:true, isPaused:false, startedAt: Date.now() })));
    } catch (e) {
      alert(`Помилка: ${e.message}`);
    } finally { setBusy(false); }
  }

  // вимкнути або пауза
  async function powerOffOrPause(tid) {
    const ch = relays[tid] ?? 0;
    const ipOverride2 = (relayIPs && typeof relayIPs[tid] === 'string') ? relayIPs[tid].trim() : '';
    const base = (ipOverride2 && isValidIPv4(ipOverride2)) ? makeBase(ipOverride2) : null;

    setBusy(true);
    try {
      if (base) { await hitRelay({ baseUrl: base, relayNum: ch, state: "off", mock: mockMode }); }
      setTables(prev => prev.map(t => {
        if (t.id !== tid) return t;
        let intervals = t.intervals;
        if (t.startedAt) intervals = [...intervals, { start: t.startedAt, end: Date.now() }];
        return { ...t, isOn:false, isPaused:false, startedAt:0, intervals };
      }));
    } catch (e) {
      alert(`Помилка: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  // alias-и
  const pauseTable = powerOffOrPause;
  const lightOff   = powerOffOrPause;

  // завершення гри / чек
  function finalizeGameRecord(table) {
    const intervals = [...table.intervals];
    if (table.isOn && table.startedAt) intervals.push({ start: table.startedAt, end: Date.now() });
    if (intervals.length === 0) return null;

    const amount = intervals.reduce(
      (acc, iv) => acc + costForInterval(iv.start, iv.end ?? Date.now(), rules, tariff),
      0
    );
    const startedAt  = intervals[0].start;
    const finishedAt = intervals[intervals.length - 1].end ?? Date.now();

    // 👇 ЗБЕРІГАЄМО СНІПШОТ ГРАВЦІВ, ЩОБ РОБИТИ «ТОП КЛІЄНТИ»
    const playersSnapshot = getPlayerInfo(table);                 // [{id,name,balance}]
    const playerIds       = (table.players || []).filter(Boolean);

    return {
      id: `g_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      tableId: table.id,
      tableName: table.name,
      intervals,
      amount: Math.round(amount * 100) / 100,
      startedAt,
      finishedAt,
      shiftId: shift?.id ?? null,
      user: session?.username ?? "unknown",
      players: playersSnapshot,        // ← нове поле
      playerIds,                       // ← нове поле
    };
  }

  /* ======= БОНУСИ ======= */
  async function spendFromPlayers(ids, total){
    const list = customers.filter(c => ids.includes(c.id));
    if (!list.length || total <= 0) return 0;

    let remaining = round2(total);
    const per = list.map(()=>0);
    const half = round2(total / list.length);

    list.forEach((p, i) => {
      const take = Math.min(half, Number(p.bonusBalance||0), remaining);
      per[i] = round2(per[i] + take);
      remaining = round2(remaining - take);
    });
    if (remaining > 0){
      list.forEach((p, i) => {
        const can = Math.max(0, Number(p.bonusBalance||0) - per[i]);
        const take = Math.min(can, remaining);
        per[i] = round2(per[i] + take);
        remaining = round2(remaining - take);
      });
    }

    for (let i=0;i<list.length;i++){
      if (per[i] > 0) await api("customers:bonus:add", { id:list[i].id, amount: -per[i] });
    }
    await reloadCustomers();
    return round2(total - remaining);
  }

  function toggleBonusMode(tableId){
    setTables(prev => prev.map(t => {
      if (t.id !== tableId) return t;
      const turnOn = !t.bonusMode;

      if (turnOn){
        const ids = (t.players||[]).filter(Boolean);
        if (!ids.length){ alert("Спочатку оберіть гравців."); return t; }
        const cap = ids.reduce((s,id)=> s + (customersMap.get(id)?.bonusBalance || 0), 0);
        if (cap <= 0){ alert("У вибраних гравців немає бонусів."); return t; }
        const base = tableCost(t);
        return { ...t, bonusMode:true, bonusCap:round2(cap), bonusBaseAmount:round2(base), bonusExhausted:false };
      } else {
        return { ...t, bonusMode:false };
      }
    }));
  }

  async function pauseForBonusExhaustion(tableId){
    const t = tables.find(x => x.id === tableId);
    if (!t || !t.isOn) return;

    try { await pauseTable(tableId); }
    finally {
      const ids = (t.players||[]).filter(Boolean);
      const toSpend = Math.max(0, round2(t.bonusCap - (t.bonusSpent || 0)));
      if (ids.length && toSpend > 0){
        const done = await spendFromPlayers(ids, toSpend);
        setTables(prev => prev.map(x => x.id===tableId
          ? { ...x, bonusMode:false, bonusSpent: round2((x.bonusSpent||0) + done), bonusExhausted:true }
          : x
        ));
      } else {
        setTables(prev => prev.map(x => x.id===tableId ? { ...x, bonusMode:false, bonusExhausted:true } : x));
      }
      alert("Бонуси закінчилися — стіл поставлено на паузу.");
    }
  }

  // автопауза: щосекунди перевіряємо
  useEffect(() => {
    const timer = setInterval(() => {
      for (const t of tables) {
        if (!t.isOn || !t.bonusMode) continue;
        const total = tableCost(t);
        const consumed = round2(total - (t.bonusBaseAmount || 0));
        const remaining = round2((t.bonusCap - (t.bonusSpent || 0)) - consumed);
        if (remaining <= 0) pauseForBonusExhaustion(t.id);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [tables, rules, tariff]);

  // нарахування/списання під час «Скинути»
  async function finalizeBonusesForTable({ table, grossAmount }){
    const ids = (table?.players||[]).filter(Boolean);
    if (!ids.length) return { net: grossAmount };

    let net = round2(grossAmount);

    if (table?.bonusMode) {
      const available = ids.reduce((s,id)=> s + (customersMap.get(id)?.bonusBalance || 0), 0);
      const toSpend = Math.min(net, round2(available));
      if (toSpend > 0) {
        const done = await spendFromPlayers(ids, toSpend);
        net = round2(net - done);
      }
    } else if (table?.bonusExhausted) {
      net = round2(net);
    }

    let earnTotal = 0;
    const intervals = [...table.intervals];
    if (table.isOn && table.startedAt) intervals.push({ start: table.startedAt, end: Date.now() });
    const totalMs = intervals.reduce((s,iv)=> s + ((iv.end ?? Date.now()) - iv.start), 0);
    const hours = totalMs / 3600000;

    if (bonusEarnMode === "per_hour") {
      earnTotal = round2(hours * (Number(bonusPerHour) || 0));
    } else {
      earnTotal = round2(net * (Number(bonusEarnPct) || 0) / 100);
    }

    const perEarn = ids.length ? round2(earnTotal / ids.length) : 0;
    for (const id of ids) {
      if (perEarn > 0) await api("customers:bonus:add", { id, amount: perEarn });
      await api("customers:visits:add", { id, amount: round2(net / ids.length) });
    }
    await reloadCustomers();

    return { net };
  }

  // ====== ГЛОБАЛЬНЕ ПІДТВЕРДЖЕННЯ (фікс «мертвих» інпутів) ======
  const [confirmState, setConfirmState] = useState(null);
  function askConfirm({ title="Підтвердити дію", text="", okText="OK", okClass="bg-emerald-600" }){
    return new Promise(resolve => {
      setConfirmState({ title, text, okText, okClass, resolve });
    });
  }
  // =============================================================

  async function resetTable(tid, withPrint=false) {
    const t = tables.find(x => x.id === tid); if (!t) return;
    if (!withPrint) {
      const ok = await askConfirm({
        title: "Скинути стіл?",
        text: "Скинути час і суму для цього столу?",
        okText: "Скинути",
        okClass: "bg-rose-600"
      });
      if (!ok) return;
    }

    const rec = finalizeGameRecord(t);
    const ch = relays[tid] ?? 0;
    const ipOverride = (relayIPs && typeof relayIPs[tid] === 'string') ? relayIPs[tid].trim() : '';
    const base = (ipOverride && isValidIPv4(ipOverride)) ? makeBase(ipOverride) : null;
    setBusy(true);
    try { if (base) { await hitRelay({ baseUrl: base, relayNum: ch, state: "off", mock: mockMode }); } } catch {}
    finally {
      if (rec) {
        const totalMs = rec.intervals.reduce((s,iv)=>s+((iv.end??rec.finishedAt)-iv.start),0);

        let netVal = rec.amount;
        try {
          const { net } = await finalizeBonusesForTable({ table: t, grossAmount: rec.amount, totalMs });
          netVal = round2(net);
          const rec2 = { ...rec, amount: netVal };
          setStats(prev => [...prev, rec2]);
        } catch(e) {
          console.error("finalize bonuses error", e);
          setStats(prev => [...prev, rec]);
        } finally {
          setTables(prev => prev.map(x => x.id === tid
            ? { ...x, isOn:false, isPaused:false, startedAt:0, intervals:[], bonusMode:false, bonusExhausted:false, bonusSpent:0 }
            : x
          ));
          setBusy(false);
        }

        if (withPrint) {
          const payload = escposReceipt({
            tableName:rec.tableName,
            totalMs:fmtDur(totalMs),
            amount:netVal.toFixed(2),
            currency:CURRENCY
          });
          printReceipt(printerIP, payload, printerMock).then(()=>{
            alert(printerMock ? "Чек збережено у файл" : "Чек надруковано");
          });
        }
      } else {
        setTables(prev => prev.map(x => x.id === tid ? { ...x, isOn:false, isPaused:false, startedAt:0, intervals:[], bonusMode:false, bonusExhausted:false, bonusSpent:0 } : x));
        setBusy(false);
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

    const fromIp = (relayIPs && typeof relayIPs[fromId] === 'string') ? relayIPs[fromId].trim() : '';
    const toIp   = (relayIPs && typeof relayIPs[toId]   === 'string') ? relayIPs[toId].trim()   : '';
    const fromBase = (fromIp && isValidIPv4(fromIp)) ? makeBase(fromIp) : null;
    const toBase   = (toIp   && isValidIPv4(toIp))   ? makeBase(toIp)   : null;
    const fromCh = relays[fromId] ?? 0;
    const toCh   = relays[toId]   ?? 1;

    setBusy(true);
    try {
      if (wasOn && !mockMode) {
        try { await hitRelay({ baseUrl: fromBase, relayNum: fromCh, state: "off", mock: false }); } catch {}
        try { await hitRelay({ baseUrl: toBase, relayNum: toCh,   state: "on",  mock: false }); } catch {}
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

  // без customersMap — безпечна версія
  function setPlayersForTable(tableId, playerIds){
    const ids = (Array.isArray(playerIds) ? playerIds : []).filter(Boolean).slice(0, 2);
    setTables(prev =>
      prev.map(t => {
        if (t.id !== tableId) return t;
        if (t.bonusMode && ids.length === 0) {
          return {
            ...t,
            players: [],
            bonusMode: false,
            bonusCap: 0,
            bonusBaseAmount: 0,
            bonusSpent: 0,
            bonusExhausted: false,
          };
        }
        return { ...t, players: ids };
      })
    );
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

      <ReservationsTicker
  tables={tables}
  onOpenReservations={() => setShowReservations(true)}
/>

      {/* Меню */}
      {menu.open && (
        <div className="fixed inset-0 z-[60]" onClick={closeMenu}>
          <div
            className="absolute origin-top-right bg-white/95 backdrop-blur ring-1 ring-slate-200/70 shadow-2xl rounded-xl py-2"
            style={{ top: menu.y, left: menu.x, transform: "translateX(-100%)", minWidth: 280 }}
            onClick={(e)=>e.stopPropagation()}
          >
            <span className="absolute -top-2 right-4 w-3 h-3 rotate-45 bg-white ring-1 ring-slate-200/70" aria-hidden/>
            <MenuItem onClick={()=>{ closeMenu(); setStatsOpen(true); }}>📈 Статистика</MenuItem>
            <MenuItem onClick={()=>{ closeMenu(); setShiftOpen(true); }}>🕒 Зміна</MenuItem>

            {/* Швидкий доступ */}
            <MenuItem onClick={()=>{ closeMenu(); setShowCustomers(true); }}>👥 Клієнти</MenuItem>
            <MenuItem onClick={()=>{ closeMenu(); setShowPromos(true); }}>🏷️ Акції/Знижки</MenuItem>
            <MenuItem onClick={()=>{ closeMenu(); setShowReservations(true); }}>📅 Бронювання</MenuItem>
            <MenuItem onClick={()=>{ closeMenu(); setBonusModalOpen(true); }}>🎁 Бонуси</MenuItem>

            {isAdmin && <>
              <Hr/>
              <MenuItem onClick={()=>{ closeMenu(); setTariffsOpen(true); }}>💸 Тарифи</MenuItem>
              <MenuItem onClick={()=>{ closeMenu(); setSettingsOpen(true); }}>⚙️ Налаштування</MenuItem>
              <MenuItem onClick={()=>{ closeMenu(); setLicenseOpen(true); }}>🧷 Ліцензія</MenuItem>
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
              onSetPlayers={openPlayersModal}
              playerInfo={getPlayerInfo(t)}
              bonusActive={t.bonusMode}
              onToggleBonus={() => toggleBonusMode(t.id)}
            />
          ))}
        </div>

        {/* статус оновлення (тости) */}
        {upd.phase === "downloading" && (
          <Toast>Завантаження оновлення… {upd.progress}%</Toast>
        )}
        {upd.phase === "downloaded" && (
          <Toast green>Оновлення готове • <button className="underline" onClick={()=>window.updates.quitAndInstall()}>Перезапустити й встановити</button>
            <button className="h-9 px-4 rounded-lg border" onClick={()=>setLicenseOpen(true)}>Ліцензія</button></Toast>
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
      {licenseOpen && (
        <LicenseModal onClose={()=>setLicenseOpen(false)} />
      )}
{settingsOpen && (
        <SettingsModal

          onClose={()=>setSettingsOpen(false)}
          espIP={espIP} setEspIP={setEspIP}
          mockMode={mockMode} setMockMode={setMockMode}
          printerIP={printerIP} setPrinterIP={setPrinterIP}
          printerMock={printerMock} setPrinterMock={setPrinterMock}
          tables={tables} relays={relays} setRelays={setRelays} relayIPs={relayIPs} setRelayIPs={setRelayIPs}
          bonusEarnPct={bonusEarnPct} setBonusEarnPct={setBonusEarnPct}
          bonusPerHour={bonusPerHour} setBonusPerHour={setBonusPerHour}
          onTestPrint={async ()=>{
            const payload = "TEST RECEIPT\n\n";
            await printReceipt(printerIP, payload, printerMock);
            alert(printerMock ? "Тестовий файл збережено" : "Надруковано");
          }}
        
          controllers={controllers} setControllers={setControllers}
          tableCtrl={tableCtrl} setTableCtrl={setTableCtrl}
/>
      )}


      {licenseOpen && (
        <LicenseModal onClose={()=>setLicenseOpen(false)} />
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
          bonusEarnMode={bonusEarnMode}
          setBonusEarnMode={setBonusEarnMode}
          bonusPerHour={bonusPerHour}
          setBonusPerHour={setBonusPerHour}
          bonusEarnPct={bonusEarnPct}
          setBonusEarnPct={setBonusEarnPct}
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

      {/* Бронювання */}
      {showReservations && (
  <ReservationsModal
    open={showReservations}
    onClose={() => setShowReservations(false)}
    tables={tables}   // ваш масив столів
  />
)}


<ErrorBoundary>
  
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

  
</ErrorBoundary>
      {/* ГЛОБАЛЬНИЙ Confirm (портал) */}
      {confirmState && (
        <ConfirmModal
          title={confirmState.title}
          okText={confirmState.okText}
          okClass={confirmState.okClass}
          onClose={() => { confirmState.resolve(false); setConfirmState(null); }}
          onOk={() => { confirmState.resolve(true); setConfirmState(null); }}
        >
          {confirmState.text}
        </ConfirmModal>
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
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 ${cls} text-white px-3 py-2 rounded-lg text-sm z-[70]`}>
      {children}
    </div>
  );
}

/* =======================
 * Модал «Налаштування»
 * ======================= */