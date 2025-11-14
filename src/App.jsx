import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

/* ====== Модалки/екрани ====== */
import CustomersModal from "./modals/CustomersModal";
import PromosModal from "./modals/PromosModal";
import ActivationScreen from "./auth/ActivationScreen";
import LoginScreen from "./auth/LoginScreen";

import TopBar from "./components/TopBar";
import TableCard from "./components/TableCard";
import ChangelogModal from "./components/ChangelogModal";
import VersionStrip from "./components/VersionStrip";
import ErrorBoundary from "./components/ErrorBoundary";
import ReservationsTicker from "./components/ReservationsTicker";

import { useChangelog } from "./hooks/useChangelog";

import { CURRENCY, fmtDur, money } from "./utils/format";
import { lsGet, lsSet } from "./utils/storage";
import { costForInterval } from "./utils/tariffs";
import { makeBase, hitRelay } from "./services/esp";
import { printReceipt } from "./services/print";
import { buildReceiptText } from "./utils/receipt";
import { api } from "./lib/api";

import ReservationsModal from "./modals/ReservationsModal";
import SettingsModal from "./modals/SettingsModal";
import StatsModal from "./modals/StatsModal";
import ShiftModal from "./modals/ShiftModal";
import TariffsModal from "./modals/TariffsModal";
import UsersModal from "./modals/UsersModal";
import UpdatesModal from "./modals/UpdatesModal";
import ConfirmModal from "./modals/ConfirmModal";
import BonusesModal from "./modals/BonusesModal";
import PlayersModal from "./modals/PlayersModal";
import LicenseCenter from "./modals/LicenseCenter.jsx";
import RentalsModal from "./modals/RentalsModal"; // ← пункт «Оренда київ»

/* ============================== helpers / const ============================== */
function isValidIPv4(ip){
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(ip||'').trim());
}
function round2(v){ return Math.round((Number(v)||0)*100)/100; }
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

const MAX_TABLES = 10; // абсолютний ліміт
const LS_APP    = "billiards_brutal_v1";
const LS_USERS  = "billiards_brutal_users_v1";
const LS_RULES  = "billiards_brutal_rules_v1";
const LS_STATS  = "bb_stats_v1";
const LS_SHIFT  = "bb_shift_current_v1";
const LS_SHIFTS = "bb_shifts_history_v1";

/* Для денних бакетів статистики (щоб StatsModal бачив чеки по днях) */
const DAY_BUCKET_PREFIX = "stats:day:"; // stats:day:YYYY-MM-DD
function ymd(ts){ return new Date(ts).toISOString().slice(0,10); }
function saveRecordToDayBucket(rec){
  try{
    const key = DAY_BUCKET_PREFIX + ymd(rec.finishedAt || Date.now());
    const cur = JSON.parse(localStorage.getItem(key) || "{}");
    cur[rec.id] = rec;
    localStorage.setItem(key, JSON.stringify(cur));
  }catch{}
}

/* Версія з Electron (safe) */
const APP_VERSION = (() => {
  try {
    const v = window?.versions?.app;
    if (typeof v === "function") return v() || "dev";
    if (typeof v === "string") return v || "dev";
  } catch {}
  return "dev";
})();

/* Порожній (дефолтний) стіл */
const blankTable = (i) => ({
  id: i,
  name: `Стіл ${i}`,
  isOn: false,
  isPaused: false,
  startedAt: 0,
  intervals: [],
  players: [],           // до 4-х гравців
  rentals: {},           // оренда київ: playerId -> cueId
  // бонусний режим
  bonusMode: false,
  bonusCap: 0,
  bonusBaseAmount: 0,
  bonusSpent: 0,
  bonusExhausted: false,
});

/* ====================== Головний компонент ====================== */
export default function App() {
  /* початкові дані */
  const boot = useMemo(() => lsGet(LS_APP, null), []);

  /* --- Ліцензія --- */
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [licenseChecked, setLicenseChecked] = useState(false);
  useEffect(function() {
    (async function() {
      const s = await window.license?.getStatus?.();
      setLicenseInfo(s || { ok:false });
      setLicenseChecked(true);
    })();
  }, []);
  function getTablesLimitFromLicense(info){
    if (!info || !info.ok) return 2;
    if (info.tablesLimit) return Math.max(1, Math.min(10, Number(info.tablesLimit)));
    if (info.mode === 'sub') return (String(info.tier||info.plan||'').toLowerCase().includes('pro') ? 10 : 5);
    return 10;
  }
  async function refreshLicense() {
    const s = await window.license?.getStatus?.();
    setLicenseInfo(s || { ok:false });
  }

  /* --- Changelog / версії --- */
  const { entries: CHANGELOG_ENTRIES, footerTagline, shouldShowOnBoot, markSeen } = useChangelog(APP_VERSION);
  const [changelogOpen, setChangelogOpen] = useState(false);
  useEffect(function() {
    if (shouldShowOnBoot) {
      setChangelogOpen(true);
      markSeen(APP_VERSION);
    }
  }, [shouldShowOnBoot, markSeen]);

  /* --- Базові налаштування --- */
  const [tariff, setTariff]       = useState(boot?.tariff ?? DEFAULT_TARIFF);
  const [espIP, setEspIP]         = useState(boot?.espIP ?? "192.168.0.185");
  const [mockMode, setMockMode]   = useState(boot?.mockMode ?? false);
  const [espOnline, setEspOnline] = useState(null);

  const [printerIP, setPrinterIP]     = useState(boot?.printerIP ?? "");
  const [printerMock, setPrinterMock] = useState(boot?.printerMock ?? true);

  const [relays, setRelays] = useState(boot?.relays ?? {1:0,2:1,3:2,4:3});
  const [relayIPs, setRelayIPs] = useState(boot?.relayIPs ?? {});
  const [controllers, setControllers] = useState(boot?.controllers ?? []);
  const [tableCtrl, setTableCtrl] = useState(boot?.tableCtrl ?? {});
  const [facilityMap, setFacilityMap] = useState(boot?.facilityMap ?? { items: [], bgUrl: '' });
  const [cues, setCues] = useState(boot?.cues ?? []);

  /* БОНУСИ */
  const [bonusEarnPct, setBonusEarnPct]   = useState(boot?.bonusEarnPct ?? 5);
  const [bonusEarnMode, setBonusEarnMode] = useState(boot?.bonusEarnMode ?? "per_hour"); // "per_hour" | "percent"
  const [bonusPerHour, setBonusPerHour]   = useState(boot?.bonusPerHour ?? 31.25);

  const [tables, setTables] = useState(function() {
    const count = Math.max(1, Math.min(boot?.tables?.length ?? 4, MAX_TABLES));
    const restored = boot?.tables ?? Array.from({ length: count }, function(_, i) { return blankTable(i + 1) });
    return restored.map(function(t, i) {
      return {
        ...blankTable(i + 1),
        ...t,
        intervals: Array.isArray(t?.intervals) ? t.intervals : [],
        startedAt: t?.startedAt || 0,
        isOn: !!t?.isOn,
        isPaused: !!t?.isPaused,
        players: Array.isArray(t?.players) ? t.players.slice(0,4) : [],
        rentals: (t && typeof t.rentals === "object") ? t.rentals : {},
        bonusMode: !!t?.bonusMode,
        bonusCap: Number(t?.bonusCap || 0),
        bonusBaseAmount: Number(t?.bonusBaseAmount || 0),
        bonusSpent: Number(t?.bonusSpent || 0),
        bonusExhausted: !!t?.bonusExhausted,
      }
    });
  });

  const [rules, setRules] = useState(function() { return lsGet(LS_RULES, defaultRules) });
  const [users, setUsers] = useState(function() { return lsGet(LS_USERS, DEFAULT_USERS) });
  const [session, setSession] = useState(boot?.session ?? null);

  const [stats, setStats] = useState(function() { return lsGet(LS_STATS, []) });
  const [shift, setShift] = useState(function() { return lsGet(LS_SHIFT, null) });
  const [shifts, setShifts] = useState(function() { return lsGet(LS_SHIFTS, []) });

  const [busy, setBusy]   = useState(false);

  /* КЛІЄНТИ */
  const [customers, setCustomers] = useState([]);
  const customersMap = useMemo(function() {
    const m = new Map();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);
  async function reloadCustomers() {
    try { const list = await api("customers:list"); setCustomers(list || []); } catch {}
  }
  useEffect(function() { reloadCustomers(); }, []);

  /* Модалки */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [licenseOpen, setLicenseOpen]   = useState(false);
  const [statsOpen, setStatsOpen]       = useState(false);
  const [shiftOpen, setShiftOpen]       = useState(false);
  const [tariffsOpen, setTariffsOpen]   = useState(false);
  const [usersOpen, setUsersOpen]       = useState(false);
  const [updatesOpen, setUpdatesOpen]   = useState(false);
  const [logoutOpen, setLogoutOpen]     = useState(false);

  /* Нові модалки */
  const [showCustomers, setShowCustomers] = useState(false);
  const [showPromos, setShowPromos]       = useState(false);
  const [bonusModalOpen, setBonusModalOpen] = useState(false);
  const [playersModal, setPlayersModal]   = useState({ open:false, tableId:null });
  const [showReservations, setShowReservations] = useState(false);
  const [showRentals, setShowRentals]     = useState(false); // ← Оренда київ

  /* Меню */
  const [menu, setMenu] = useState({ open:false, x:0, y:0 });
  const openMenuAt = function(rect) { setMenu({ open:true, x:rect.right, y:rect.bottom+8 }) };
  const closeMenu  = function() { setMenu({ open:false, x:0, y:0 }) };

  /* Персист */
  useEffect(function(){ lsSet(LS_USERS, users); },[users]);
  useEffect(function(){ lsSet(LS_RULES, rules); },[rules]);
  useEffect(function(){ lsSet(LS_STATS, stats); },[stats]);
  useEffect(function(){ lsSet(LS_SHIFT, shift); },[shift]);
  useEffect(function(){ lsSet(LS_SHIFTS, shifts); },[shifts]);
  useEffect(function(){
    lsSet(LS_APP, {
      tariff, espIP, mockMode, printerIP, printerMock, relays, relayIPs, tables, session,
      bonusEarnPct, bonusEarnMode, bonusPerHour,
      controllers, tableCtrl, facilityMap,
      cues
    });
  }, [tariff, espIP, mockMode, printerIP, printerMock, relays, relayIPs, tables, session, bonusEarnPct, bonusEarnMode, bonusPerHour, controllers, tableCtrl, facilityMap, cues]);

  /* Перевірка ESP онлайн */
  useEffect(function() {
    let isMounted = true;

    async function pingURL(url) {
      try {
        await Promise.race([
          fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-cache' }),
          new Promise(function(_, reject) { return setTimeout(function() { return reject(new Error('timeout')) }, 1500) })
        ]);
        return true;
      } catch (e) {
        return false;
      }
    }

    async function checkConnectivity() {
      if (mockMode) {
        if(isMounted) setEspOnline(true);
        return;
      }

      const uniqueIps = new Set();
      (controllers || [])
        .filter(function(c) { return c?.enabled !== false && c.ip && isValidIPv4(c.ip) })
        .forEach(function(c) { uniqueIps.add(c.ip.trim()) });

      const ipsToPing = Array.from(uniqueIps);
      if (ipsToPing.length === 0) {
        if (isMounted) setEspOnline(false);
        return;
      }

      const results = await Promise.all(ipsToPing.map(function(ip){ return pingURL('http://' + ip + '/ping') }));
      const isAnyOnline = results.some(Boolean);
      if (isMounted) setEspOnline(isAnyOnline);
    }

    checkConnectivity();
    const intervalId = setInterval(checkConnectivity, 7000);
    return function() { isMounted = false; clearInterval(intervalId); };
  }, [controllers, relayIPs, mockMode]);

  /* Тікер (пауза при відкритих модалках) */
  const [, force] = useState(0);
  const anyModalOpen =
    settingsOpen || statsOpen || shiftOpen || tariffsOpen || usersOpen || updatesOpen || logoutOpen ||
    changelogOpen || showCustomers || showPromos || bonusModalOpen || playersModal.open || menu.open || showReservations || showRentals;

  useEffect(function() {
    const i = setInterval(function() { if (!anyModalOpen) force(function(v) { return v + 1 }) }, 1000);
    return function() { return clearInterval(i) };
  }, [anyModalOpen]);

  /* ======= helpers ======= */
  const canOperate = !!shift;
  useEffect(function() {
    if (!shift) {
      setTables(function(prev) {
        return prev.map(function(t) {
          if (t.isOn) {
            var newIntervals = t.intervals.slice();
            if (t.startedAt) {
              newIntervals.push({ start: t.startedAt, end: Date.now() });
            }
            return { ...t, isOn: false, isPaused: false, startedAt: 0, intervals: newIntervals };
          }
          return t;
        });
      });
    }
  }, [shift]);

  function tableMs(t) {
    const closed = t.intervals.reduce(function(s,iv) { return s + ((iv.end ?? Date.now()) - iv.start) }, 0);
    const open = t.isOn && t.startedAt ? (Date.now() - t.startedAt) : 0;
    return closed + open;
  }
  function tableCost(t) {
    const intervals = t.intervals.slice();
    if (t.isOn && t.startedAt) intervals.push({ start: t.startedAt, end: Date.now() });
    return intervals.reduce(function(acc, iv) { return acc + costForInterval(iv.start, iv.end ?? Date.now(), rules, tariff) }, 0);
  }
  const isAdmin = session?.role === "admin";

  function getPlayerInfo(table){
    const ids = Array.isArray(table?.players) ? table.players : [];
    return ids
      .map(function(id) {
        const c = customersMap.get(id);
        return c ? { id: c.id, name: c.name || "—", balance: Number(c.bonusBalance || 0) } : null;
      })
      .filter(Boolean);
  }

  /* Світло: увімкнути */
  async function lightOn(tid) {
    if (!canOperate) { alert("Спочатку відкрийте зміну."); return; }
    const t = tables.find(function(x) { return x.id === tid });

    if (t?.bonusMode) {
      const ids = Array.isArray(t?.players) ? t.players.filter(Boolean) : [];
      if (ids.length === 0) {
        alert("Режим «За бонуси» увімкнено, але гравців не вибрано. Оберіть гравців або вимкніть режим.");
        return;
      }
    }

    const ch = relays[tid] ?? 0;
    const ipOverride = (relayIPs && typeof relayIPs[tid] === 'string') ? relayIPs[tid].trim() : '';
    const controllerId = tableCtrl[tid];
    const controller = (controllers || []).find(function(c) { return c.id === controllerId });
    const controllerIp = controller?.ip?.trim();

    let finalIp = '';
    if (ipOverride && isValidIPv4(ipOverride)) {
      finalIp = ipOverride;
    } else if (controllerIp && isValidIPv4(controllerIp)) {
      finalIp = controllerIp;
    } else if (espIP && isValidIPv4(espIP)) {
      finalIp = espIP.trim();
    }

    const base = finalIp ? makeBase(finalIp) : null;
    setBusy(true);
    try {
      if (base) {
        await hitRelay({ baseUrl: base, relayNum: ch, state: "on", mock: mockMode });
      }
      setTables(function(prev) {
        return prev.map(function(t) {
          return t.id !== tid ? t : (t.isOn ? t : {
            ...t,
            isOn: true,
            isPaused: false,
            startedAt: Date.now()
          });
        });
      });
    } catch (e) {
      alert("Помилка: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  /* Вимкнути/Пауза (stop) */
  async function powerOffOrPause(tid) {
    const ch = relays[tid] ?? 0;
    const ipOverride = (relayIPs && typeof relayIPs[tid] === 'string') ? relayIPs[tid].trim() : '';
    const controllerId = tableCtrl[tid];
    const controller = (controllers || []).find(function(c) { return c.id === controllerId });
    const controllerIp = controller?.ip?.trim();

    let finalIp = '';
    if (ipOverride && isValidIPv4(ipOverride))       finalIp = ipOverride;
    else if (controllerIp && isValidIPv4(controllerIp)) finalIp = controllerIp;
    else if (espIP && isValidIPv4(espIP))            finalIp = espIP.trim();

    const base = finalIp ? makeBase(finalIp) : null;

    setBusy(true);
    try {
      if (base) {
        await hitRelay({ baseUrl: base, relayNum: ch, state: "off", mock: mockMode });
      }
      setTables(function(prev) {
        return prev.map(function(t) {
          if (t.id !== tid) return t;
          let intervals = t.intervals.slice();
          if (t.startedAt) intervals.push({ start: t.startedAt, end: Date.now() });
          return { ...t, isOn: false, isPaused: false, startedAt: 0, intervals };
        });
      });
    } catch (e) {
      alert("Помилка: " + e.message);
    } finally {
      setBusy(false);
    }
  }
  const pauseTable = powerOffOrPause;
  const lightOff   = powerOffOrPause;

  /* Запис гри (перед скиданням) */
  function finalizeGameRecord(table) {
    const intervals = table.intervals.slice();
    if (table.isOn && table.startedAt) intervals.push({ start: table.startedAt, end: Date.now() });
    if (intervals.length === 0) return null;

    const amount = intervals.reduce(
      (acc, iv) => acc + costForInterval(iv.start, iv.end ?? Date.now(), rules, tariff),
      0
    );
    const startedAt  = intervals[0].start;
    const finishedAt = intervals[intervals.length - 1].end ?? Date.now();

    const playersSnapshot = getPlayerInfo(table);
    const playerIds = (table.players || []).filter(Boolean);

    return {
      id: "g_" + Date.now() + "_" + Math.random().toString(36).slice(2,7),
      tableId: table.id,
      tableName: table.name,
      intervals: intervals,
      amount: Math.round(amount * 100) / 100,
      startedAt: startedAt,
      finishedAt: finishedAt,
      shiftId: shift?.id ?? null,
      user: session?.username ?? "unknown",
      players: playersSnapshot,
      playerIds: playerIds,
    };
  }

  /* ======= БОНУСИ ======= */
  async function spendFromPlayers(ids, total){
    const list = customers.filter(function(c) { return ids.includes(c.id) });
    if (!list.length || total <= 0) return 0;

    let remaining = round2(total);
    const per = list.map(function() { return 0 });
    const half = round2(total / list.length);

    list.forEach(function(p, i) {
      const take = Math.min(half, Number(p.bonusBalance||0), remaining);
      per[i] = round2(per[i] + take);
      remaining = round2(remaining - take);
    });
    if (remaining > 0){
      list.forEach(function(p, i) {
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
    setTables(function(prev) {
      return prev.map(function(t) {
        if (t.id !== tableId) return t;
        const turnOn = !t.bonusMode;

        if (turnOn) {
          const ids = (t.players || []).filter(Boolean);
          if (!ids.length) {
            alert("Спочатку оберіть гравців.");
            return t;
          }
          const cap = ids.reduce(function(s, id) { return s + (customersMap.get(id)?.bonusBalance || 0) }, 0);
          if (cap <= 0) {
            alert("У вибраних гравців немає бонусів.");
            return t;
          }
          const base = tableCost(t);
          return { ...t, bonusMode: true, bonusCap: round2(cap), bonusBaseAmount: round2(base), bonusExhausted: false };
        } else {
          return { ...t, bonusMode: false };
        }
      });
    });
  }

  async function pauseForBonusExhaustion(tableId){
    const t = tables.find(function(x) { return x.id === tableId });
    if (!t || !t.isOn) return;

    try { await pauseTable(tableId); }
    finally {
      const ids = (t.players||[]).filter(Boolean);
      const toSpend = Math.max(0, round2(t.bonusCap - (t.bonusSpent || 0)));
      if (ids.length && toSpend > 0){
        const done = await spendFromPlayers(ids, toSpend);
        setTables(function(prev) {
          return prev.map(function(x) {
            return x.id === tableId ? { ...x, bonusMode: false, bonusSpent: round2((x.bonusSpent || 0) + done), bonusExhausted: true } : x;
          });
        });
      } else {
        setTables(function(prev) {
          return prev.map(function(x) {
            return x.id === tableId ? { ...x, bonusMode: false, bonusExhausted: true } : x;
          });
        });
      }
      alert("Бонуси закінчилися — стіл поставлено на паузу.");
    }
  }

  useEffect(function() {
    const timer = setInterval(function() {
      for (const t of tables) {
        if (!t.isOn || !t.bonusMode) continue;
        const total = tableCost(t);
        const consumed = round2(total - (t.bonusBaseAmount || 0));
        const remaining = round2((t.bonusCap - (t.bonusSpent || 0)) - consumed);
        if (remaining <= 0) pauseForBonusExhaustion(t.id);
      }
    }, 1000);
    return function() { return clearInterval(timer) };
  }, [tables, rules, tariff]);

  async function finalizeBonusesForTable({ table, grossAmount }){
    const ids = (table?.players||[]).filter(Boolean);
    if (!ids.length) return { net: round2(grossAmount) };

    let net = round2(grossAmount);

    if (table?.bonusMode) {
      const available = ids.reduce(function(s,id) { return s + (customersMap.get(id)?.bonusBalance || 0) }, 0);
      const toSpend = Math.min(net, round2(available));
      if (toSpend > 0) {
        const done = await spendFromPlayers(ids, toSpend);
        net = round2(net - done);
      }
    } else if (table?.bonusExhausted) {
      net = round2(net);
    }

    let earnTotal = 0;
    const intervals = table.intervals.slice();
    if (table.isOn && table.startedAt) intervals.push({ start: table.startedAt, end: Date.now() });
    const totalMs = intervals.reduce(function(s,iv) { return s + ((iv.end ?? Date.now()) - iv.start) }, 0);
    const hours = totalMs / 3600000;

    if (bonusEarnMode === "per_hour") {
      earnTotal = round2(hours * (Number(bonusPerHour) || 0));
    } else {
      earnTotal = round2(net * (Number(bonusEarnPct) || 0) / 100);
    }

    const perEarn = ids.length ? round2(earnTotal / ids.length) : 0;
    for (const id of ids) {
      if (perEarn > 0) await api("customers:bonus:add", { id: id, amount: perEarn });
      await api("customers:visits:add", { id: id, amount: round2(net / ids.length) });
    }
    await reloadCustomers();

    return { net: net };
  }

  /* ====== Глобальне підтвердження + вибір оплати ====== */
  const [confirmState, setConfirmState] = useState(null);
  function askConfirm({ title="Підтвердити дію", text="", okText="OK", okClass="bg-emerald-600" }){
    return new Promise(function(resolve) {
      setConfirmState({ title: title, text: text, okText: okText, okClass: okClass, resolve: resolve });
    });
  }

  const [paymentState, setPaymentState] = useState(null);
  function askPayment(){
    return new Promise(function(resolve){
      setPaymentState({ resolve });
    });
  }

  /* ====== Скидання столу ====== */
  async function resetTable(tid, withPrint=false, paymentMethod=null) {
    const t = tables.find(function(x) { return x.id === tid });
    if (!t) return;

    /* БЕЗ ДРУКУ: чисте скидання */
    if (!withPrint) {
      const ok = await askConfirm({
        title: "Скинути стіл?",
        text: "Скинути час і суму для цього столу?",
        okText: "Скинути",
        okClass: "bg-rose-600"
      });
      if (!ok) return;

      const ch = relays[tid] ?? 0;
      const ipOverride = (relayIPs && typeof relayIPs[tid] === 'string') ? relayIPs[tid].trim() : '';
      const controllerId = tableCtrl[tid];
      const controller = (controllers || []).find(function(c) { return c.id === controllerId });
      const controllerIp = controller?.ip?.trim();

      let finalIp = '';
      if (ipOverride && isValidIPv4(ipOverride)) finalIp = ipOverride;
      else if (controllerIp && isValidIPv4(controllerIp)) finalIp = controllerIp;
      else if (espIP && isValidIPv4(espIP)) finalIp = espIP.trim();

      const base = finalIp ? makeBase(finalIp) : null;

      setBusy(true);
      try { if (base) await hitRelay({ baseUrl: base, relayNum: ch, state: "off", mock: mockMode }); }
      catch(e){ console.error(e); }
      finally {
        setTables(function(prev) {
          return prev.map(function(x) {
            return x.id === tid
              ? { ...x, isOn:false, isPaused:false, startedAt:0, intervals:[], bonusMode:false, bonusExhausted:false, bonusSpent:0 }
              : x;
          });
        });
        setBusy(false);
      }
      return;
    }

    /* ЧЕК + СКИНУТИ */
    const payMethod = paymentMethod || (await askPayment());
    if (!payMethod) return;

    const rec = finalizeGameRecord(t);
    const ch = relays[tid] ?? 0;
    const ipOverride = (relayIPs && typeof relayIPs[tid] === 'string') ? relayIPs[tid].trim() : '';
    const controllerId = tableCtrl[tid];
    const controller = (controllers || []).find(function(c) { return c.id === controllerId });
    const controllerIp = controller?.ip?.trim();

    let finalIp = '';
    if (ipOverride && isValidIPv4(ipOverride)) finalIp = ipOverride;
    else if (controllerIp && isValidIPv4(controllerIp)) finalIp = controllerIp;
    else if (espIP && isValidIPv4(espIP)) finalIp = espIP.trim();

    const base = finalIp ? makeBase(finalIp) : null;

    setBusy(true);
    try { if (base) await hitRelay({ baseUrl: base, relayNum: ch, state: "off", mock: mockMode }); }
    catch(e){ console.error(e); }
    finally {
      if (rec) {
        const totalMs = rec.intervals.reduce(function(s,iv){ return s+((iv.end??rec.finishedAt)-iv.start) },0);

        let netVal = rec.amount;
        try {
          const { net } = await finalizeBonusesForTable({ table: t, grossAmount: rec.amount, totalMs: totalMs });
          netVal = round2(net);
          const rec2 = { ...rec, amount: netVal, paymentMethod: payMethod };

          setStats(function(prev) { return prev.concat([rec2]) });
          saveRecordToDayBucket(rec2);
        } catch(e) {
          console.error("finalize bonuses error", e);
          const rec2 = { ...rec, paymentMethod: payMethod };
          setStats(function(prev) { return prev.concat([rec2]) });
          saveRecordToDayBucket(rec2);
        } finally {
          setTables(function(prev) {
            return prev.map(function(x) {
              return x.id === tid
                ? { ...x,
                    isOn:false, isPaused:false, startedAt:0, intervals:[],
                    bonusMode:false, bonusExhausted:false, bonusSpent:0,
                    players: [],
                    rentals: {}
                  }
                : x;
            });
          });
          setBusy(false);
        }

        /* ДРУК ЧЕКУ через шаблон */
        try {
          const { text: receiptText } = buildReceiptText({
            table: { ...t, intervals: rec.intervals, rentals: t.rentals || {} },
            gameAmount: netVal,          // сума за гру
            cues,
            title: 'Більярдний клуб "Duna"',
            tableLabel: rec.tableName,
            operatorName: session?.username || "Адміністратор",
            totalMs,
            baseTariff: tariff,          // тариф за годину
            paymentMethod: payMethod     // ← НОВЕ: спосіб оплати в чеку
          });

          const pr = await printReceipt(printerIP, receiptText, printerMock);
          if (pr?.ok === false) alert("Помилка друку: " + (pr?.error || "невідомо"));
        } catch (e) {
          alert("Помилка друку: " + (e?.message || "невідомо"));
        }
      } else {
        setTables(function(prev) {
          return prev.map(function(x) {
            return x.id === tid
              ? { ...x, isOn:false, isPaused:false, startedAt:0, intervals:[], bonusMode:false, bonusExhausted:false, bonusSpent:0, players: [], rentals: {} }
              : x;
          });
        });
        setBusy(false);
      }
    }
  }

  async function handlePrintAndReset(tid){
    await resetTable(tid, true);
  }

  /* Перенесення гри */
  async function transfer(fromId, toId) {
    if (!canOperate) { alert("Спочатку відкрийте зміну."); return; }
    if (fromId === toId) return;

    const from = tables.find(function(t) { return t.id === fromId });
    const to   = tables.find(function(t) { return t.id === toId });
    if (!from || !to) return;

    const wasOn   = !!from.isOn;
    const keepSA  = from.startedAt || 0;
    const keepIVs = from.intervals.slice();

    const fromIp = (relayIPs && typeof relayIPs[fromId] === 'string') ? relayIPs[fromId].trim() : '';
    const toIp   = (relayIPs && typeof relayIPs[toId]   === 'string') ? relayIPs[toId].trim()   : '';
    const fromBase = (fromIp && isValidIPv4(fromIp)) ? makeBase(fromIp) : null;
    const toBase   = (toIp   && isValidIPv4(toIp))   ? makeBase(toIp)   : null;
    const fromCh = relays[fromId] ?? 0;
    const toCh   = relays[toId]   ?? 1;

    setBusy(true);
    try {
      if (wasOn && !mockMode) {
        try { await hitRelay({ baseUrl: fromBase, relayNum: fromCh, state: "off", mock: false }); } catch (e) { console.error(e) }
        try { await hitRelay({ baseUrl: toBase, relayNum: toCh,   state: "on",  mock: false }); } catch (e) { console.error(e) }
      }
      setTables(function(prev) {
        return prev.map(function(t) {
          if (t.id === fromId) return { ...t, isOn:false, isPaused:false, startedAt:0, intervals:[] };
          if (t.id === toId)   return { ...t, isOn:wasOn, isPaused:false, startedAt:wasOn?keepSA:0, intervals:keepIVs };
          return t;
        });
      });
    } finally { setBusy(false); }
  }

  /* Гравці */
  function openPlayersModal(tableId){ setPlayersModal({ open:true, tableId: tableId }); }
  function setPlayersForTable(tableId, playerIds, rentals){
    const ids = (Array.isArray(playerIds) ? playerIds : []).filter(Boolean).slice(0, 4);
    const rentalsMap = (rentals && typeof rentals === "object") ? rentals : null;

    setTables(function(prev) {
      return prev.map(function(t) {
        if (t.id !== tableId) return t;

        let next;
        if (t.bonusMode && ids.length === 0) {
          next = {
            ...t,
            players: [],
            bonusMode: false,
            bonusCap: 0,
            bonusBaseAmount: 0,
            bonusSpent: 0,
            bonusExhausted: false,
          };
        } else {
          next = { ...t, players: ids };
        }

        if (rentalsMap) {
          next = { ...next, rentals: rentalsMap };
        } else if (next.rentals) {
          const r = {};
          for (const pid of ids) {
            if (next.rentals[pid]) r[pid] = next.rentals[pid];
          }
          next = { ...next, rentals: r };
        }

        return next;
      });
    });
  }

  /* Додавання/видалення столу */
  function handleAddTable() {
    const LIM = getTablesLimitFromLicense(licenseInfo) || MAX_TABLES;
    if (tables.length >= LIM) { alert("За ліцензією дозволено до " + LIM + " столів"); return; }
    const nextId = tables.length ? Math.max.apply(null, tables.map(function(t) { return t.id })) + 1 : 1;
    const newTable = blankTable(nextId);
    setTables(function(prev) { return prev.concat([newTable]) });
    setRelays(function(prev) {
      const next = { ...prev };
      next[nextId] = Object.keys(prev||{}).length;
      return next;
    });
  }
  function handleRemoveTable() {
    if (tables.length <= 1) { alert("Має залишитись хоча б один стіл."); return; }
    const lastInactiveIndex = tables.slice().reverse().findIndex(function(t) { return !t.isOn && !t.isPaused });
    if (lastInactiveIndex === -1) { alert("Немає неактивних столів для видалення."); return; }
    const removeIndex = tables.length - 1 - lastInactiveIndex;
    const removed = tables[removeIndex];
    setTables(function(prev) { return prev.filter(function(_, i) { return i !== removeIndex }) });
    setRelays(function(prev) { const copy = { ...(prev||{}) }; delete copy[removed.id]; return copy; });
  }

  /* Оновлення (Electron) */
  const [upd, setUpd] = useState({ phase: "idle", progress: 0, message: "" });
  useEffect(function() {
    if (!window?.updates) return;
    const off = window.updates.on(function(ev) {
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

  /* Зміни (Shift) */
  function openShift() {
    if (shift) return alert("Зміна вже відкрита.");
    setShift({ id:"s_" + Date.now(), openedAt:Date.now(), openedBy:session.username, closedAt:null, totals:null });
    alert("Зміну відкрито.");
  }
  function summarizeRecords(recs) {
    const byTable={}; let amount=0, ms=0; for (const r of recs) {
      const tms = r.intervals.reduce(function(s,iv) { return s + ((iv.end ?? r.finishedAt) - iv.start) }, 0);
      ms += tms; amount += Number(r.amount||0);
      if (!byTable[r.tableId]) byTable[r.tableId] = { tableName:r.tableName, ms:0, amount:0, games:0 };
      byTable[r.tableId].ms += tms; byTable[r.tableId].amount += Number(r.amount||0); byTable[r.tableId].games += 1;
    }
    return { totalAmount:amount, totalMs:ms, count:recs.length, byTable: byTable };
  }
  function closeShift() {
    if (!shift) return;
    setTables(function(prev) {
      return prev.map(function(t) {
        return t.isOn ? ({ ...t, isOn:false, startedAt:0, intervals:t.intervals.concat([{start:t.startedAt, end:Date.now()}]) }) : t
      });
    });
    const end = Date.now();
    const recs = stats.filter(function(r) { return r.shiftId === shift.id && r.finishedAt <= end });
    const totals = summarizeRecords(recs);

    const cash = recs.filter(r=> (r.paymentMethod||"") === "cash").reduce((s,r)=> s + Number(r.amount||0), 0);
    const card = recs.filter(r=> (r.paymentMethod||"") === "card").reduce((s,r)=> s + Number(r.amount||0), 0);

    const closed = { ...shift, closedAt:end, totals:{ ...totals, payments:{ cash, card } } };
    setShifts(function(prev) { return [closed].concat(prev) });
    setShift(null);

    const lines = [];
    lines.push("Duna Billiard Club — Z-REPORT");
    lines.push("Shift ID: " + closed.id);
    lines.push("Opened: " + new Date(closed.openedAt).toLocaleString() + " by " + closed.openedBy);
    lines.push("Closed: " + new Date(closed.closedAt).toLocaleString());
    lines.push("--------------------------------------");
    lines.push("TOTAL: " + money(totals.totalAmount) + " | time " + fmtDur(totals.totalMs) + " | games " + totals.count);
    lines.push("CASH:  " + money(cash) + " | CARD " + money(card));
    lines.push("--------------------------------------");
    for (const [_tid, v] of Object.entries(totals.byTable)) {
      lines.push((v.tableName||"").padEnd(10) + " · " + fmtDur(v.ms) + " · " + money(v.amount) + " · games " + v.games);
    }
    const blob = new Blob([lines.join("\n")], { type:"text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:T]/g,'-').slice(0,19);
    a.href=url; a.download="z_report_" + stamp + ".txt"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function() { URL.revokeObjectURL(url) },2_000);

    alert("Зміну закрито. Z-звіт збережено.");
  }

  /* Авторизація */
  function tryLogin(username, password) {
    const u = (lsGet(LS_USERS, DEFAULT_USERS)).find(function(u) { return u.username === username && u.password === password });
    if (!u) return false; setSession({ username:u.username, role:u.role }); return true;
  }
  function logout() { setSession(null); }

  /* Керування користувачами */
  function addUser({ username, password, role }) {
    if (!username || !password) return alert("Заповніть логін і пароль.");
    if (users.find(function(u) { return u.username===username })) return alert("Такий користувач вже існує.");
    setUsers(function(prev) { return prev.concat([{ username: username, password: password, role: role || "marker" }]) });
  }
  function removeUser(username) {
    if (username === "admin") return alert("Користувача admin видаляти не можна.");
    if (username === session?.username) return alert("Не можна видалити поточного користувача.");
    setUsers(function(prev) { return prev.filter(function(u) { return u.username !== username }) });
  }
  function resetPwd(username, newPwd) {
    if (!newPwd) return;
    setUsers(function(prev) {
      return prev.map(function(u) { return u.username === username ? ({ ...u, password:newPwd }) : u });
    });
  }

  /* Бейдж зміни у TopBar */
  const shiftBadge = shift
    ? "Зміна відкрита • " + new Date(shift.openedAt).toLocaleDateString() + " " + new Date(shift.openedAt).toLocaleTimeString().slice(0,5)
    : "";

  /* =========================== РЕНДЕР =========================== */

  if (!licenseChecked) return null;
  if (!licenseInfo?.ok) return <ActivationScreen onActivated={refreshLicense} />;
  if (!session) return <LoginScreen tryLogin={tryLogin} />;

  return (
    React.createElement("div", { className: "min-h-screen bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,.10),transparent_55%),linear-gradient(180deg,#f3fff9,#eaf2ff)] text-slate-900" },

      React.createElement(TopBar, {
        user: session?.username,
        role: session?.role,
        baseRate: tariff,
        espIp: espIP,
        espOnline: espOnline,
        licenseInfo: licenseInfo,
        version: APP_VERSION,
        liveBadge: shiftBadge,
        onOpenMenu: openMenuAt,
        onAddTable: handleAddTable,
        onRemoveTable: handleRemoveTable,
        onFeedback: function() { return alert("Напишіть нам у Telegram: @duna_billiard_support")}
      }),

      React.createElement(ReservationsTicker, {
        tables: tables,
        onOpenReservations: function() { return setShowReservations(true) }
      }),

      /* Меню */
      menu.open && (
        React.createElement("div", { className: "fixed inset-0 z-[60]", onClick: closeMenu },
          React.createElement("div", {
            className: "absolute origin-top-right bg-white/95 backdrop-blur ring-1 ring-slate-200/70 shadow-2xl rounded-xl py-2",
            style: { top: menu.y, left: menu.x, transform: "translateX(-100%)", minWidth: 280 },
            onClick: function(e) { return e.stopPropagation()}
          },
            React.createElement("span", { className: "absolute -top-2 right-4 w-3 h-3 rotate-45 bg-white ring-1 ring-slate-200/70", "aria-hidden": true }),
            React.createElement(MenuItem, { onClick: function(){ closeMenu(); setStatsOpen(true); } }, "📈 Статистика"),
            React.createElement(MenuItem, { onClick: function(){ closeMenu(); setShiftOpen(true); } }, "🕒 Зміна"),
            React.createElement(MenuItem, { onClick: function(){ closeMenu(); setShowCustomers(true); } }, "👥 Клієнти"),
            React.createElement(MenuItem, { onClick: function(){ closeMenu(); setShowPromos(true); } }, "🏷️ Акції/Знижки"),
            React.createElement(MenuItem, { onClick: function(){ closeMenu(); setShowReservations(true); } }, "📅 Бронювання"),
            React.createElement(MenuItem, { onClick: function(){ closeMenu(); setBonusModalOpen(true); } }, "🎁 Бонуси"),
            React.createElement(MenuItem, { onClick: function(){ closeMenu(); setShowRentals(true); } }, "🎯 Оренда київ"),
            isAdmin && React.createElement(React.Fragment, null,
              React.createElement(Hr, null),
              React.createElement(MenuItem, { onClick: function(){ closeMenu(); setTariffsOpen(true); } }, "💸 Тарифи"),
              React.createElement(MenuItem, { onClick: function(){ closeMenu(); setSettingsOpen(true); } }, "⚙️ Налаштування"),
              React.createElement(MenuItem, { onClick: function(){ closeMenu(); setLicenseOpen(true); } }, "🧷 Ліцензія"),
              React.createElement(MenuItem, { onClick: function(){ closeMenu(); setUsersOpen(true); } }, "👤 Користувачі"),
            ),
            React.createElement(MenuItem, { onClick: function(){ closeMenu(); setUpdatesOpen(true); } }, "⬇️ Перевірити оновлення"),
            React.createElement(Hr, null),
            React.createElement(MenuItem, { onClick: function(){ closeMenu(); setLogoutOpen(true); } }, "🚪 Вийти")
          )
        )
      ),

      React.createElement("main", { className: "max-w-7xl mx-auto px-4 py-6" },
        React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-7" },
          tables.map(function(t) {
            return React.createElement(TableCard, {
              key: t.id,
              table: t,
              relayChannel: relays[t.id],
              cost: tableCost(t),
              liveMs: tableMs(t),
              canOperate: canOperate,
              busy: busy,
              onLightOn: lightOn,
              onLightOff: lightOff,
              onPause: pauseTable,
              onReset: resetTable,
              onPrintReset: handlePrintAndReset,
              onTransfer: transfer,
              tables: tables,
              onSetPlayers: openPlayersModal,
              playerInfo: getPlayerInfo(t),
              bonusActive: t.bonusMode,
              onToggleBonus: function() { return toggleBonusMode(t.id) }
            });
          })
        ),

        upd.phase === "downloading" && (
          React.createElement(Toast, null, "Завантаження оновлення… ", upd.progress, "%")
        ),
        upd.phase === "downloaded" && (
          React.createElement(Toast, { green: true }, "Оновлення готове • ",
            React.createElement("button", { className: "underline", onClick: function() { return window.updates.quitAndInstall()} }, "Перезапустити й встановити"),
            React.createElement("button", { className: "h-9 px-4 rounded-lg border", onClick: function() { return setLicenseOpen(true) } }, "Ліцензія"))
        ),
        upd.phase === "error" && (
          React.createElement(Toast, { red: true }, "Помилка оновлення: ", upd.message)
        ),

        React.createElement(VersionStrip, {
          version: APP_VERSION,
          tagline: footerTagline,
          onOpen: function() { return setChangelogOpen(true)}
        })
      ),

      settingsOpen && (
        React.createElement(SettingsModal, {
          onClose: function() { return setSettingsOpen(false)},
          espIP: espIP, setEspIP: setEspIP,
          mockMode: mockMode, setMockMode: setMockMode,
          printerIP: printerIP, setPrinterIP: setPrinterIP,
          printerMock: printerMock, setPrinterMock: setPrinterMock,
          tables: tables, relays: relays, setRelays: setRelays, relayIPs: relayIPs, setRelayIPs: setRelayIPs,
          bonusEarnPct: bonusEarnPct, setBonusEarnPct: setBonusEarnPct,
          bonusPerHour: bonusPerHour, setBonusPerHour: setBonusPerHour,
          onTestPrint: async function(){
            const payload = "TEST RECEIPT\n\n";
            await printReceipt(printerIP, payload, printerMock);
            alert(printerMock ? "Тестовий файл збережено" : "Надруковано");
          },
          controllers: controllers, setControllers: setControllers,
          tableCtrl: tableCtrl, setTableCtrl: setTableCtrl,
          facilityMap: facilityMap, setFacilityMap: setFacilityMap,
          cues: cues, setCues: setCues
        })
      ),

      licenseOpen && (
        React.createElement(LicenseCenter, { onClose: function() { return setLicenseOpen(false)} })
      ),

      statsOpen && (
        React.createElement(StatsModal, {
          onClose: function() { return setStatsOpen(false)},
          stats: stats,
          summarize: summarizeRecords
        })
      ),

      shiftOpen && (
        React.createElement(ShiftModal, {
          onClose: function() { return setShiftOpen(false)},
          shift: shift,
          openShift: openShift,
          closeShift: closeShift,
          stats: stats,
          summarize: summarizeRecords
        })
      ),

      tariffsOpen && (
        React.createElement(TariffsModal, {
          onClose: function() { return setTariffsOpen(false)},
          rules: rules,
          setRules: setRules,
          baseRate: tariff,
          setBaseRate: setTariff,
          bonusEarnMode: bonusEarnMode,
          setBonusEarnMode: setBonusEarnMode,
          bonusPerHour: bonusPerHour,
          setBonusPerHour: setBonusPerHour,
          bonusEarnPct: bonusEarnPct,
          setBonusEarnPct: setBonusEarnPct
        })
      ),

      usersOpen && (
        React.createElement(UsersModal, {
          users: users,
          me: session?.username,
          onClose: function() { return setUsersOpen(false)},
          onAdd: addUser,
          onRemove: removeUser,
          onResetPwd: resetPwd
        })
      ),

      updatesOpen && (
        React.createElement(UpdatesModal, {
          onClose: function() { return setUpdatesOpen(false)},
          upd: upd,
          onCheck: manualCheck
        })
      ),

      logoutOpen && (
        React.createElement(ConfirmModal, {
          title: "Вийти з облікового запису?",
          okText: "Вийти",
          okClass: "bg-rose-600",
          onClose: function() { return setLogoutOpen(false)},
          onOk: function(){ setLogoutOpen(false); logout(); }
        },
          "Після виходу потрібно буде знову увійти (логін/пароль)."
        )
      ),

      changelogOpen && (
        React.createElement(ChangelogModal, {
          version: APP_VERSION,
          entries: CHANGELOG_ENTRIES,
          onClose: function() { return setChangelogOpen(false)}
        })
      ),

      showReservations && (
        React.createElement(ReservationsModal, {
          open: showReservations,
          onClose: function() { return setShowReservations(false)},
          tables: tables
        })
      ),

      showCustomers && React.createElement(CustomersModal, { onClose: function(){ setShowCustomers(false); reloadCustomers(); } }),
      showPromos && React.createElement(PromosModal, { onClose: function(){ return setShowPromos(false)} }),
      bonusModalOpen && React.createElement(BonusesModal, { onClose: function(){ setBonusModalOpen(false); reloadCustomers(); }, customers: customers }),
      playersModal.open && (
        React.createElement(PlayersModal, {
          onClose: function() { return setPlayersModal({ open:false, tableId:null })},
          customers: customers,
          table: tables.find(function(t) { return t.id === playersModal.tableId }),
          cues: cues,
          onSave: function(arg1, arg2){
            var ids, rentals;
            if (Array.isArray(arg1)) {
              ids = arg1;
              rentals = (arg2 && typeof arg2 === "object") ? arg2 : null;
            } else if (arg1 && Array.isArray(arg1.ids)) {
              ids = arg1.ids;
              rentals = (arg1 && typeof arg1.rentals === "object") ? arg1.rentals : null;
            } else {
              ids = [];
              rentals = null;
            }
            setPlayersForTable(playersModal.tableId, ids, rentals);
            setPlayersModal({ open:false, tableId:null });
          }
        })
      ),
      showRentals && (
        React.createElement(RentalsModal, {
          onClose: function(){ setShowRentals(false); },
          cues: cues,
          setCues: setCues
        })
      ),

      confirmState && (
        React.createElement(ConfirmModal, {
          title: confirmState.title,
          okText: confirmState.okText,
          okClass: confirmState.okClass,
          onClose: function() { confirmState.resolve(false); setConfirmState(null); },
          onOk: function() { confirmState.resolve(true); setConfirmState(null); }
        },
          confirmState.text
        )
      ),

      paymentState && createPortal(
        React.createElement(PaymentChooser, {
          onClose: function(){ paymentState.resolve(null); setPaymentState(null); },
          onChoose: function(m){ paymentState.resolve(m); setPaymentState(null); }
        }),
        document.body
      )
    )
  );
}

/* ======================= Дрібні допоміжні JSX ======================= */
function MenuItem({ children, onClick }) {
  return React.createElement("button", { className: "w-full text-left px-3 py-2 text-sm hover:bg-slate-100", onClick: onClick }, children);
}
function Hr() { return React.createElement("div", { className: "my-1 h-px bg-slate-200" }); }
function Toast({ children, green, red }) {
  const cls = red
    ? "bg-rose-600"
    : green
    ? "bg-emerald-600"
    : "bg-black/80";
  return (
    React.createElement("div", { className: "fixed bottom-4 left-1/2 -translate-x-1/2 " + cls + " text-white px-3 py-2 rounded-lg text-sm z-[70]" },
      children
    )
  );
}

/* Простий селектор способу оплати */
function PaymentChooser({ onClose, onChoose }){
  return (
    React.createElement("div", { className: "fixed inset-0 z-[80] flex items-center justify-center bg-black/40", onClick:onClose },
      React.createElement("div", { className: "w-[360px] rounded-2xl bg-white p-4 ring-1 ring-slate-200 shadow-2xl", onClick: (e)=>e.stopPropagation() },
        React.createElement("div", { className: "text-lg font-semibold mb-2" }, "Спосіб оплати"),
        React.createElement("div", { className: "text-sm text-slate-600 mb-4" }, "Оберіть спосіб оплати для чеку."),
        React.createElement("div", { className: "flex gap-2" },
          React.createElement("button", { className: "h-10 px-4 rounded-xl bg-emerald-600 text-white", onClick: ()=>onChoose("cash") }, "Готівка"),
          React.createElement("button", { className: "h-10 px-4 rounded-xl bg-sky-600 text-white", onClick: ()=>onChoose("card") }, "Карта"),
          React.createElement("button", { className: "h-10 px-4 rounded-xl border ml-auto", onClick: onClose }, "Скасувати")
        )
      )
    )
  );
}
