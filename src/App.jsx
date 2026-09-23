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
import useOnlineBookings from "./hooks/useOnlineBookings";

import { CURRENCY, fmtDur, money } from "./utils/format";
import { lsGet, lsSet } from "./utils/storage";
import { costForInterval } from "./utils/tariffs";
import { makeBase, hitRelay } from "./services/esp";
import { printReceipt } from "./services/print";
import { buildReceiptText } from "./utils/receipt";
import { api } from "./lib/api";
import {
  getCheckboxSettings,
  fiscalizeReceipt,
  formatFiscalBlock,
  openCheckboxShift,
  closeCheckboxShift,
  closeOtherCashierShiftAndOpen,
  serviceDeposit,
  serviceWithdrawal,
  CheckboxOtherCashierError,
} from "./services/checkbox";

import ReservationsModal from "./modals/ReservationsModal";
import OnlineBookingsModal from "./modals/OnlineBookingsModal";
import SettingsModal from "./modals/SettingsModal";
import StatsModal from "./modals/StatsModal";
import ShiftModal from "./modals/ShiftModal";
import TariffsModal from "./modals/TariffsModal";
import UsersModal from "./modals/UsersModal";
import UpdatesModal from "./modals/UpdatesModal";
import ConfirmModal from "./modals/ConfirmModal";
import BonusesModal from "./modals/BonusesModal";
import PlayersModal from "./modals/PlayersModal";
import PaymentModal from "./modals/PaymentModal";
import LicenseCenter from "./modals/LicenseCenter.jsx";
import RentalsModal from "./modals/RentalsModal"; // ← пункт «Оренда київ»

/* ============================== helpers / const ============================== */
function isValidIPv4(ip){
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(ip||'').trim());
}
function round2(v){ return Math.round((Number(v)||0)*100)/100; }
function genOnlineBookingToken() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return "tok_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
}
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
const LS_RESET_COUNTS = "stats:resetCounts";
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
function bumpResetCount(ts){
  try{
    const day = ymd(ts || Date.now());
    const cur = JSON.parse(localStorage.getItem(LS_RESET_COUNTS) || "{}");
    cur[day] = Number(cur[day] || 0) + 1;
    localStorage.setItem(LS_RESET_COUNTS, JSON.stringify(cur));
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
  discount: 0,           // знижка на стіл, %
});

function normalizeTablesData(bootTables, relays, relayIPs, tableCtrl) {
  if (!Array.isArray(bootTables) || bootTables.length === 0) return null;
  const sorted = bootTables.slice().sort(function(a, b) { return (a?.id || 0) - (b?.id || 0); });
  const map = new Map();
  let needsFix = false;
  for (let i = 0; i < sorted.length; i++) {
    const oldId = sorted[i]?.id;
    const newId = i + 1;
    if (oldId !== newId) needsFix = true;
    map.set(oldId, newId);
  }
  if (!needsFix) return null;

  const tables = sorted.map(function(t, idx) {
    const newId = idx + 1;
    return { ...t, id: newId };
  });

  function remapObj(obj) {
    if (!obj || typeof obj !== "object") return obj || {};
    const out = {};
    Object.keys(obj).forEach(function(k) {
      const oldId = Number(k);
      const newId = map.get(oldId) ?? oldId;
      out[newId] = obj[k];
    });
    return out;
  }

  return {
    tables,
    relays: remapObj(relays),
    relayIPs: remapObj(relayIPs),
    tableCtrl: remapObj(tableCtrl),
  };
}

/* ====================== Головний компонент ====================== */
export default function App() {
  /* початкові дані */
  const boot = useMemo(() => lsGet(LS_APP, null), []);

  /* --- Ліцензія --- */
    /* --- Ліцензія --- */
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [licenseChecked, setLicenseChecked] = useState(false);

  // Декодування payload з JWT (без перевірки підпису, просто читаємо exp/tier)
  function decodeJwtPayload(jwt) {
    try {
      if (!jwt) return null;
      const parts = String(jwt).split(".");
      if (parts.length < 2) return null;
      let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (payload.length % 4) payload += "=";
      const json = atob(payload);
      return JSON.parse(json);
    } catch (e) {
      console.error("Не вдалося декодувати ліцензійний токен:", e);
      return null;
    }
  }

  // Нормалізація статусу ліцензії: рахуємо mode, daysLeft, tablesLimit тощо
  async function loadLicenseStatus() {
    try {
      const base = await window.license?.getStatus?.();
      const jwt = base?.jwt;
      const result = {
        ok: !!(base && base.ok && base.active),
        active: !!base?.active,
        jwt: jwt || null,
      };

      if (!jwt || typeof jwt !== "string" || jwt.length < 40) {
        // Старий/спрощений режим: є активна ліцензія, але без JWT з exp
        if (base?.active) {
          return {
            ...result,
            ok: true,
            active: true,
            mode: "full",
            plan: base?.plan || null,
            tier: base?.tier || null,
            daysLeft: null,
            expiresAt: null,
            tablesLimit: 10,
          };
        }
        return { ...result, ok: false, active: false };
      }

      const payload = decodeJwtPayload(jwt) || {};
      const nowSec = Math.floor(Date.now() / 1000);
      const expSec = typeof payload.exp === "number" ? payload.exp : null;
      const secondsLeft = expSec != null ? expSec - nowSec : null;
      const daysLeft = secondsLeft != null ? Math.ceil(secondsLeft / 86400) : null;

      const tierRaw = payload.tier || payload.plan || payload.t || base?.tier || base?.plan || "";
      const tier = tierRaw || null;
      const t = String(tierRaw).toLowerCase();

      // Помісячні тарифи: lite-m / pro-m / sub / monthly
      const isMonthly =
        /-m$/.test(t) || t.includes("sub") || t.includes("month") || t.includes("monthly");
      const mode = isMonthly ? "sub" : "full";

      const tablesLimit =
        payload.tablesLimit ??
        (t.includes("pro") || t.includes("10") ? 10 : 5);

      const ok = expSec == null
        ? !!base?.active
        : (secondsLeft > 0 && !!base?.active);

      return {
        ...result,
        ok,
        active: !!base?.active && ok,
        mode,
        plan: tier,
        tier,
        daysLeft: daysLeft != null ? daysLeft : null,
        expiresAt: expSec ? expSec * 1000 : null,
        tablesLimit,
      };
    } catch (e) {
      console.error("Помилка при завантаженні статусу ліцензії:", e);
      return { ok: false, active: false, error: String(e) };
    }
  }

  // Початковий запит ліцензії при старті програми
  useEffect(() => {
    (async function () {
      const info = await loadLicenseStatus();
      setLicenseInfo(info);
      setLicenseChecked(true);
    })();
  }, []);

  // Обмеження кількості столів від ліцензії
  function getTablesLimitFromLicense(info) {
    if (!info || !info.ok) return 2;
    if (info.tablesLimit) return Math.max(1, Math.min(10, Number(info.tablesLimit)));
    if (info.mode === "sub") {
      return String(info.tier || info.plan || "")
        .toLowerCase()
        .includes("pro")
        ? 10
        : 5;
    }
    return 10;
  }

  // Оновлення ліцензії після активації/оплати
  async function refreshLicense() {
    const info = await loadLicenseStatus();
    setLicenseInfo(info || { ok: false });
  }

  // ==== Сповіщення за 3 дні до закінчення помісячної підписки ====
  useEffect(() => {
    if (!licenseChecked) return;
    const info = licenseInfo;
    if (!info || !info.ok) return;

    // Працюємо тільки з помісячними тарифами (₴600 / ₴900)
    const mode = info.mode || (info.tier && /-m$/i.test(String(info.tier)) ? "sub" : undefined);
    if (mode !== "sub") return;

    const days = typeof info.daysLeft === "number" ? info.daysLeft : null;
    if (days !== 3) return; // строго за 3 дні, як ти просив

    // Щоб не спамити — памʼятаємо, що вже показували для цього токена
    try {
      const key = "license.subReminder.jwt";
      const last = localStorage.getItem(key);
      if (last && last === info.jwt) return;
      if (info.jwt) localStorage.setItem(key, info.jwt);
    } catch {
      // якщо LocalStorage недоступний — просто показуємо
    }

    window.alert(
      "Через 3 дні закінчується оплачений місяць підписки. " +
      "Будь ласка, зробіть оплату, інакше програма буде заблокована до моменту оплати."
    );
  }, [licenseChecked, licenseInfo]);


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

  const normalizedBoot = normalizeTablesData(boot?.tables, boot?.relays, boot?.relayIPs, boot?.tableCtrl);
  const [relays, setRelays] = useState(normalizedBoot?.relays ?? boot?.relays ?? {1:0,2:1,3:2,4:3});
  const [relayIPs, setRelayIPs] = useState(normalizedBoot?.relayIPs ?? boot?.relayIPs ?? {});
  const [controllers, setControllers] = useState(boot?.controllers ?? []);
  const [tableCtrl, setTableCtrl] = useState(normalizedBoot?.tableCtrl ?? boot?.tableCtrl ?? {});
  const [facilityMap, setFacilityMap] = useState(boot?.facilityMap ?? { items: [], bgUrl: '' });
  const [cues, setCues] = useState(boot?.cues ?? []);

  /* Онлайн-бронювання (VPS сервер) */
  const [bookingServerEnabled, setBookingServerEnabled] = useState(boot?.bookingServerEnabled ?? true);
  const [bookingServerUrl, setBookingServerUrl] = useState(boot?.bookingServerUrl ?? "");
  const [bookingServerToken, setBookingServerToken] = useState(boot?.bookingServerToken ?? genOnlineBookingToken());

  /* БОНУСИ */
  const [bonusEarnPct, setBonusEarnPct]   = useState(boot?.bonusEarnPct ?? 5);
  const [bonusEarnMode, setBonusEarnMode] = useState(boot?.bonusEarnMode ?? "per_hour"); // "per_hour" | "percent"
  const [bonusPerHour, setBonusPerHour]   = useState(boot?.bonusPerHour ?? 31.25);

  const [tables, setTables] = useState(function() {
    const base = normalizedBoot?.tables ?? boot?.tables;
    const count = Math.max(1, Math.min(base?.length ?? 4, MAX_TABLES));
    const restored = Array.isArray(base)
      ? base.slice(0, count)
      : Array.from({ length: count }, function(_, i) { return blankTable(i + 1) });
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
        discount: Number(t?.discount || 0),
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
  const [reservationEditId, setReservationEditId] = useState(null);
  const [showOnlineBookings, setShowOnlineBookings] = useState(false);
  const [showRentals, setShowRentals]     = useState(false); // ← Оренда київ

  /* Меню */
  const [menu, setMenu] = useState({ open:false, x:0, y:0 });
  const openMenuAt = function(rect) { setMenu({ open:true, x:rect.right, y:rect.bottom+8 }) };
  const closeMenu  = function() { setMenu({ open:false, x:0, y:0 }) };

  function openReservationEditor(reservationId) {
    if (!reservationId) return;
    setReservationEditId(reservationId);
    setShowReservations(true);
  }

  /* Персист */
  useEffect(function(){ lsSet(LS_USERS, users); },[users]);
  useEffect(function(){ lsSet(LS_RULES, rules); },[rules]);
  useEffect(function(){ lsSet(LS_STATS, stats); },[stats]);
  useEffect(function(){ lsSet(LS_SHIFT, shift); },[shift]);
  useEffect(function(){ lsSet(LS_SHIFTS, shifts); },[shifts]);
  useEffect(function(){
    lsSet(LS_APP, {
      tariff, espIP, mockMode, printerIP, printerMock, relays, relayIPs, tables, session,
      bookingServerEnabled, bookingServerUrl, bookingServerToken,
      bonusEarnPct, bonusEarnMode, bonusPerHour,
      controllers, tableCtrl, facilityMap,
      cues
    });
  }, [
    tariff, espIP, mockMode, printerIP, printerMock, relays, relayIPs, tables, session,
    bookingServerEnabled, bookingServerUrl, bookingServerToken,
    bonusEarnPct, bonusEarnMode, bonusPerHour,
    controllers, tableCtrl, facilityMap,
    cues
  ]);

  /* Онлайн бронювання: sync з VPS */
  const onlineTablesSnapshot = useMemo(function() {
    return (tables || []).map(function(t) {
      return { id: t.id, name: t.name || ("Стіл " + t.id), kind: "table" };
    });
  }, [tables]);

  // ✅ для сайту: які столи зараз грають (busyNow)
  const onlineBusyTableIds = useMemo(function() {
    return (tables || [])
      .filter(function(t) { return !!t?.isOn; })
      .map(function(t) { return Number(t?.id); })
      .filter(function(id) { return Number.isFinite(id) && id > 0; })
      .sort(function(a, b) { return a - b; });
  }, [tables]);


  const online = useOnlineBookings({
    enabled: bookingServerEnabled,
    baseUrl: bookingServerUrl,
    token: bookingServerToken,
    facilityOpen: !!shift,
    openHours: { from: "12:00", to: "23:00" },
    tables: onlineTablesSnapshot,
    busyTableIds: onlineBusyTableIds,
  });
  const onlineNewCount = online?.newCount || online?.pendingCount || 0;

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
    changelogOpen || showCustomers || showPromos || bonusModalOpen || playersModal.open || menu.open || showReservations || showOnlineBookings || showRentals;

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
  /* Застосувати знижку столу (0–100 %) до суми */
  function applyDiscount(amount, t) {
    const d = Number(t?.discount || 0);
    return d > 0 && d <= 100 ? round2(amount * (1 - d / 100)) : amount;
  }
  function tableCost(t) {
    const intervals = t.intervals.slice();
    if (t.isOn && t.startedAt) intervals.push({ start: t.startedAt, end: Date.now() });
    const gross = intervals.reduce(function(acc, iv) { return acc + costForInterval(iv.start, iv.end ?? Date.now(), rules, tariff) }, 0);
    return applyDiscount(gross, t);
  }
  function setTableDiscount(tid, value) {
    const d = Math.max(0, Math.min(100, Number(value) || 0));
    setTables(function(prev) {
      return prev.map(function(t) { return t.id === tid ? { ...t, discount: d } : t; });
    });
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

    const grossAmount = intervals.reduce(
      (acc, iv) => acc + costForInterval(iv.start, iv.end ?? Date.now(), rules, tariff),
      0
    );
    const amount = applyDiscount(grossAmount, table);
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
      grossAmount: Math.round(grossAmount * 100) / 100,
      discount: Number(table.discount || 0),
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
  /* Checkbox ПРРО — налаштування (localStorage: bb_checkbox_v1) */
  const [checkboxSettings, setCheckboxSettings] = useState(() => getCheckboxSettings());
  /* askPayment → { method: "cash"|"card", fiscalize: boolean } | null */
  function askPayment(){
    return new Promise(function(resolve){
      setPaymentState({ resolve });
    });
  }

  /* ====== Фіскалізація чека в Checkbox ПРРО ======
     Реєструє продаж, дописує фіскальний блок до тексту чека і
     зберігає фіскальні реквізити в запис статистики. Помилка не блокує друк. */
  async function fiscalizeAndAppend({ receipt, payMethod, totalMs, savedRec, text }) {
    try {
      const total = (Number(receipt.gameAmount) || 0) + (Number(receipt.cueTotal) || 0);
      const fiscal = await fiscalizeReceipt({
        totalAmount: total,
        paymentMethod: payMethod,
        description: `Гра ${fmtDur(totalMs)} год x ${tariff} = ${total.toFixed(2)}`,
        settings: checkboxSettings,
      });
      text += "\n" + formatFiscalBlock(fiscal);
      if (savedRec && fiscal) {
        const withFiscal = {
          ...savedRec,
          fiscalCode: fiscal.fiscal_code ?? null,
          fiscalDate: fiscal.fiscal_date ?? null,
          fiscalId: fiscal.id ?? null,
          fiscalQrUrl: fiscal.qr_url ?? null,
        };
        setStats(function(prev) { return prev.map(function(r) { return r.id === savedRec.id ? withFiscal : r; }) });
        saveRecordToDayBucket(withFiscal);
      }
    } catch (e) {
      alert("Checkbox ПРРО: " + (e?.message || "Помилка фіскалізації"));
    }
    return text;
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
        bumpResetCount(Date.now());
        setBusy(false);
      }
      return;
    }

    /* ЧЕК + СКИНУТИ */
    const pay = paymentMethod ? { method: paymentMethod, fiscalize: false } : await askPayment();
    if (!pay) return;
    const payMethod = pay.method || pay;
    const doFiscalize = !!(pay.fiscalize && checkboxSettings && checkboxSettings.enabled);

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
        let savedRec = null;
        try {
          const { net } = await finalizeBonusesForTable({ table: t, grossAmount: rec.amount, totalMs: totalMs });
          netVal = round2(net);
          savedRec = { ...rec, amount: netVal, paymentMethod: payMethod };

          setStats(function(prev) { return prev.concat([savedRec]) });
          saveRecordToDayBucket(savedRec);
        } catch(e) {
          console.error("finalize bonuses error", e);
          savedRec = { ...rec, paymentMethod: payMethod };
          setStats(function(prev) { return prev.concat([savedRec]) });
          saveRecordToDayBucket(savedRec);
        } finally {
          setTables(function(prev) {
            return prev.map(function(x) {
              return x.id === tid
                ? { ...x,
                    isOn:false, isPaused:false, startedAt:0, intervals:[],
                    bonusMode:false, bonusExhausted:false, bonusSpent:0,
                    players: [],
                    rentals: {},
                    discount: 0
                  }
                : x;
            });
          });
          setBusy(false);
        }

        /* ДРУК ЧЕКУ через шаблон (+ фіскалізація в Checkbox ПРРО) */
        try {
          const receipt = buildReceiptText({
            table: { ...t, intervals: rec.intervals, rentals: t.rentals || {} },
            gameAmount: netVal,          // сума за гру
            cues,
            title: 'Більярдний клуб "Duna"',
            tableLabel: rec.tableName,
            operatorName: session?.username || "Адміністратор",
            totalMs,
            baseTariff: tariff,          // тариф за годину
            paymentMethod: payMethod,    // ← спосіб оплати в чеку
            grossAmount: rec.grossAmount,
            discountPct: rec.discount
          });
          let receiptText = receipt.text;

          if (doFiscalize) {
            receiptText = await fiscalizeAndAppend({ receipt, payMethod, totalMs, savedRec, text: receiptText });
          }

          const pr = await printReceipt(printerIP, receiptText, printerMock);
          if (pr?.ok === false) alert("Помилка друку: " + (pr?.error || "невідомо"));
        } catch (e) {
          alert("Помилка друку: " + (e?.message || "невідомо"));
        }
      } else {
        setTables(function(prev) {
          return prev.map(function(x) {
            return x.id === tid
              ? { ...x, isOn:false, isPaused:false, startedAt:0, intervals:[], bonusMode:false, bonusExhausted:false, bonusSpent:0, players: [], rentals: {}, discount: 0 }
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

  async function closeGameKeepLight(tid){
    const t = tables.find(function(x) { return x.id === tid });
    if (!t) return;

    const rec = finalizeGameRecord(t);
    if (!rec) return;

    const pay = await askPayment();
    if (!pay) return;
    const payMethod = pay.method || pay;
    const doFiscalize = !!(pay.fiscalize && checkboxSettings && checkboxSettings.enabled);

    setBusy(true);
    try {
      const totalMs = rec.intervals.reduce(function(s,iv){ return s+((iv.end??rec.finishedAt)-iv.start) },0);

      let netVal = rec.amount;
      let savedRec = null;
      try {
        const { net } = await finalizeBonusesForTable({ table: t, grossAmount: rec.amount, totalMs: totalMs });
        netVal = round2(net);
        savedRec = { ...rec, amount: netVal, paymentMethod: payMethod };

        setStats(function(prev) { return prev.concat([savedRec]) });
        saveRecordToDayBucket(savedRec);
      } catch(e) {
        console.error("finalize bonuses error", e);
        savedRec = { ...rec, paymentMethod: payMethod };
        setStats(function(prev) { return prev.concat([savedRec]) });
        saveRecordToDayBucket(savedRec);
      } finally {
        setTables(function(prev) {
          return prev.map(function(x) {
            return x.id === tid
              ? { ...x,
                  isOn:true, isPaused:false, startedAt: Date.now(), intervals:[],
                  bonusMode:false, bonusExhausted:false, bonusSpent:0
                }
              : x;
          });
        });
        setBusy(false);
      }

      try {
        const receipt = buildReceiptText({
          table: { ...t, intervals: rec.intervals, rentals: t.rentals || {} },
          gameAmount: netVal,
          cues,
          title: 'Більярдний клуб "Duna"',
          tableLabel: rec.tableName,
          operatorName: session?.username || "Адміністратор",
          totalMs,
          baseTariff: tariff,
          paymentMethod: payMethod,
          grossAmount: rec.grossAmount,
          discountPct: rec.discount
        });
        let receiptText = receipt.text;

        if (doFiscalize) {
          receiptText = await fiscalizeAndAppend({ receipt, payMethod, totalMs, savedRec, text: receiptText });
        }

        const pr = await printReceipt(printerIP, receiptText, printerMock);
        if (pr?.ok === false) alert("Помилка друку: " + (pr?.error || "Невідомо"));
      } catch (e) {
        alert("Помилка друку: " + (e?.message || "Невідомо"));
      }
    } finally {
      // setBusy handled in finally above
    }
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
    const maxId = Math.max.apply(null, tables.map(function(t) { return t.id }));
    const candidate = tables.find(function(t) { return t.id === maxId });
    if (!candidate) return;
    if (candidate.isOn || candidate.isPaused) {
      alert("Неможливо видалити активний стіл. Спочатку зупиніть останній стіл.");
      return;
    }
    setTables(function(prev) { return prev.filter(function(t) { return t.id !== maxId }) });
    setRelays(function(prev) { const copy = { ...(prev||{}) }; delete copy[maxId]; return copy; });
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
  /* Відкриття зміни. openingBalance — початковий залишок готівки (грн), реєструється
     в Checkbox як службове внесення, якщо ПРРО ввімкнено і зміна в Checkbox відкрилась. */
  async function openShift(openingBalance = 0) {
    if (shift) return alert("Зміна вже відкрита.");
    const cb = checkboxSettings;
    let checkboxShiftId = null;

    if (cb && cb.enabled) {
      try {
        const cbShift = await openCheckboxShift(cb);
        checkboxShiftId = cbShift?.id ?? null;
      } catch (e) {
        if (e instanceof CheckboxOtherCashierError || e?.name === "CheckboxOtherCashierError") {
          // На касі відкрита зміна іншого касира — пропонуємо закрити її його даними
          if (window.confirm(
            "На касі відкрита зміна іншого касира.\n\n" +
            "Натисніть OK щоб ввести дані попереднього касира і закрити його зміну.\n" +
            "Натисніть Скасувати щоб відкрити зміну без фіскалізації."
          )) {
            const oldLogin = window.prompt("Логін старого касира (або залиште порожнім якщо тільки ПІН):", "");
            const oldPassword = oldLogin ? window.prompt("Пароль старого касира:", "") : null;
            const oldPin = oldLogin ? null : window.prompt("ПІН-код старого касира:", "");
            if (oldLogin || oldPin) {
              try {
                const cbShift = await closeOtherCashierShiftAndOpen(
                  { login: oldLogin || "", password: oldPassword || "", pinCode: oldPin || "" },
                  cb
                );
                checkboxShiftId = cbShift?.id ?? null;
              } catch (e2) {
                if (!window.confirm("Checkbox ПРРО: " + (e2?.message || "Помилка") + "\n\nВідкрити зміну без фіскалізації?")) return;
              }
            } else if (!window.confirm("Дані не введено.\n\nВідкрити зміну без фіскалізації?")) {
              return;
            }
          }
        } else if (!window.confirm("Checkbox ПРРО: " + (e?.message || "Помилка відкриття зміни") + "\n\nВідкрити зміну без фіскалізації?")) {
          return;
        }
      }
    }

    if (openingBalance > 0 && cb?.enabled && checkboxShiftId) {
      try {
        await serviceDeposit(cb, openingBalance);
      } catch (e) {
        alert("Checkbox: помилка реєстрації початкового залишку: " + (e?.message || String(e)));
      }
    }

    setShift({
      id: "s_" + Date.now(),
      openedAt: Date.now(),
      openedBy: session.username,
      closedAt: null,
      totals: null,
      checkboxShiftId,
      openingBalance: openingBalance || 0,
    });
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
  /* Закриття зміни. collectionAmount — сума інкасації (грн), реєструється
     в Checkbox як службова видача; потім зміна в Checkbox закривається. */
  async function closeShift(collectionAmount = 0) {
    if (!shift) return;
    const end = Date.now();
    const recs = stats.filter(function(r) { return r.shiftId === shift.id && r.finishedAt <= end });
    const totals = summarizeRecords(recs);

    const cash = recs.filter(r=> (r.paymentMethod||"") === "cash").reduce((s,r)=> s + Number(r.amount||0), 0);
    const card = recs.filter(r=> (r.paymentMethod||"") === "card").reduce((s,r)=> s + Number(r.amount||0), 0);

    const cb = checkboxSettings;
    if (cb && cb.enabled) {
      if (collectionAmount > 0) {
        try { await serviceWithdrawal(cb, collectionAmount); }
        catch (e) { alert("Checkbox: помилка реєстрації інкасації: " + (e?.message || String(e))); }
      }
      try { await closeCheckboxShift(cb); }
      catch (e) { alert("Checkbox ПРРО: " + (e?.message || "Помилка закриття зміни в Checkbox")); }
    }

    setTables(function(prev) {
      return prev.map(function(t) {
        return t.isOn ? ({ ...t, isOn:false, startedAt:0, intervals:t.intervals.concat([{start:t.startedAt, end:end}]) }) : t
      });
    });

    const closed = { ...shift, closedAt:end, collectionAmount: collectionAmount || 0, totals:{ ...totals, payments:{ cash, card } } };
    setShifts(function(prev) { return [closed].concat(prev) });
    setShift(null);

    const lines = [];
    lines.push("Duna Billiard Club — Z-REPORT");
    lines.push("Shift ID: " + closed.id);
    lines.push("Opened: " + new Date(closed.openedAt).toLocaleString() + " by " + closed.openedBy);
    lines.push("Closed: " + new Date(closed.closedAt).toLocaleString());
    if (closed.checkboxShiftId) lines.push("Checkbox Shift ID: " + closed.checkboxShiftId);
    if (closed.openingBalance) lines.push("Початковий залишок: " + money(closed.openingBalance));
    lines.push("--------------------------------------");
    lines.push("TOTAL: " + money(totals.totalAmount) + " | time " + fmtDur(totals.totalMs) + " | games " + totals.count);
    lines.push("CASH:  " + money(cash) + " | CARD " + money(card));
    if (collectionAmount > 0) lines.push("Інкасація: " + money(collectionAmount));
    if (cb && cb.enabled) {
      const fiscalized = recs.filter(function(r) { return r.fiscalCode }).length;
      lines.push("ПРРО (Checkbox): фіскалізовано " + fiscalized + " / " + recs.length + " чеків");
    }
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
      + (checkboxSettings?.enabled ? (shift.checkboxShiftId ? " • ПРРО ✓" : " • ПРРО —") : "")
    : "";

  /* =========================== РЕНДЕР =========================== */

  if (!licenseChecked) return null;
  if (!licenseInfo?.ok) return <ActivationScreen onActivated={refreshLicense} />;
  if (!session) return <LoginScreen tryLogin={tryLogin} />;

  return (
    React.createElement("div", { className: "relative min-h-screen bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.18),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(6,78,59,0.35),transparent_55%),linear-gradient(180deg,#071410,#04100c_45%,#020806)] text-emerald-50" },

      /* Фетрова текстура столу + віньєтка */
      React.createElement("div", {
        className: "pointer-events-none fixed inset-0 opacity-[0.35]",
        style: {
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(52,211,153,0.025) 2px, rgba(52,211,153,0.025) 4px)," +
            "repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(52,211,153,0.025) 2px, rgba(52,211,153,0.025) 4px)",
        },
        "aria-hidden": true,
      }),
      React.createElement("div", {
        className: "pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55))]",
        "aria-hidden": true,
      }),

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
        onlineNewCount: onlineNewCount,
        onOpenOnlineBookings: function(){ return setShowOnlineBookings(true); },
        onFeedback: function() { return alert("Напишіть нам у Telegram: @duna_billiard_support")}
      }),

      React.createElement(ReservationsTicker, {
        tables: tables,
        onOpenReservations: function() { return setShowReservations(true) },
        onRescheduleReservation: openReservationEditor
      }),

      /* Меню */
         menu.open && (
        React.createElement(
          "div",
          {
            className:
              "fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm",
            onClick: closeMenu,
          },
          React.createElement(
            "div",
            {
              className:
                "absolute origin-top-right overflow-hidden rounded-3xl border border-emerald-400/40 " +
                "bg-gradient-to-b from-slate-900/97 via-emerald-950/95 to-slate-950/97 backdrop-blur-2xl " +
                "shadow-[0_28px_70px_rgba(0,0,0,0.9),0_0_50px_rgba(52,211,153,0.12)] text-emerald-50 " +
                "animate-[menuIn_140ms_ease-out]",

              style: {
                top: menu.y,
                left: menu.x,
                transform: "translateX(-100%)",
                minWidth: 280,
              },
              onClick: function (e) {
                return e.stopPropagation();
              },
            },
            React.createElement("span", {
              className:
                "absolute -top-2 right-6 w-3 h-3 rotate-45 bg-slate-900 ring-1 ring-emerald-400/50",
              "aria-hidden": true,
            }),
            React.createElement("div", {
              className: "absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent",
              "aria-hidden": true,
            }),
            React.createElement("div", {
              className: "px-3.5 pt-3 pb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300/60",
            }, "Меню"),
            React.createElement("div", { className: "px-1.5 pb-2 space-y-0.5" },
            React.createElement(
              MenuItem,
              {
                onClick: function () {
                  closeMenu();
                  setStatsOpen(true);
                },
              },
              "📈 Статистика"
            ),
            React.createElement(
              MenuItem,
              {
                onClick: function () {
                  closeMenu();
                  setShiftOpen(true);
                },
              },
              "🕒 Зміна"
            ),
            React.createElement(
              MenuItem,
              {
                onClick: function () {
                  closeMenu();
                  setShowCustomers(true);
                },
              },
              "👥 Клієнти"
            ),
            React.createElement(
              MenuItem,
              {
                onClick: function () {
                  closeMenu();
                  setShowPromos(true);
                },
              },
              "🏷️ Акції/Знижки"
            ),
            React.createElement(
              MenuItem,
              {
                onClick: function () {
                  closeMenu();
                  setShowReservations(true);
                },
              },
              "📅 Бронювання"
            ),
            React.createElement(
              MenuItem,
              {
                onClick: function () {
                  closeMenu();
                  setShowOnlineBookings(true);
                },
              },
              onlineNewCount > 0 ? ("🌐 Онлайн бронювання (" + onlineNewCount + ")") : "🌐 Онлайн бронювання"
            ),
            React.createElement(
              MenuItem,
              {
                onClick: function () {
                  closeMenu();
                  setBonusModalOpen(true);
                },
              },
              "🎁 Бонуси"
            ),
            React.createElement(
              MenuItem,
              {
                onClick: function () {
                  closeMenu();
                  setShowRentals(true);
                },
              },
              "🎯 Оренда київ"
            ),
            isAdmin &&
              React.createElement(
                React.Fragment,
                null,
                React.createElement(Hr, { title: "Адміністрування" }),
                React.createElement(
                  MenuItem,
                  {
                    onClick: function () {
                      closeMenu();
                      setTariffsOpen(true);
                    },
                  },
                  "💸 Тарифи"
                ),
                React.createElement(
                  MenuItem,
                  {
                    onClick: function () {
                      closeMenu();
                      setSettingsOpen(true);
                    },
                  },
                  "⚙️ Налаштування"
                ),
                React.createElement(
                  MenuItem,
                  {
                    onClick: function () {
                      closeMenu();
                      setLicenseOpen(true);
                    },
                  },
                  "🧷 Ліцензія"
                ),
                React.createElement(
                  MenuItem,
                  {
                    onClick: function () {
                      closeMenu();
                      setUsersOpen(true);
                    },
                  },
                  "👤 Користувачі"
                )
              ),
            React.createElement(Hr, { title: "Система" }),
            React.createElement(
              MenuItem,
              {
                onClick: function () {
                  closeMenu();
                  setUpdatesOpen(true);
                },
              },
              "⬇️ Перевірити оновлення"
            ),
            React.createElement(Hr, null),
            React.createElement(
              MenuItem,
              {
                onClick: function () {
                  closeMenu();
                  setLogoutOpen(true);
                },
              },
              "🚪 Вийти"
            )
            )
          )
        )
      ),


      React.createElement("main", { className: "relative z-[1] max-w-[1700px] mx-auto px-5 py-6" },
        React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6" },
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
              onCloseGameKeepLight: closeGameKeepLight,
              tables: tables,
              onSetPlayers: openPlayersModal,
              playerInfo: getPlayerInfo(t),
              bonusActive: t.bonusMode,
              onToggleBonus: function() { return toggleBonusMode(t.id) },
              discount: t.discount || 0,
              onSetDiscount: function(v) { return setTableDiscount(t.id, v) }
            });
          })
        ),

        (!tables || tables.length === 0) && (
          React.createElement("div", { className: "mt-10 flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-emerald-500/30 bg-emerald-950/30 px-6 py-14 text-center" },
            React.createElement("div", { className: "text-5xl" }, "🎱"),
            React.createElement("div", { className: "text-lg font-semibold text-emerald-100" }, "Столів ще немає"),
            React.createElement("div", { className: "text-sm text-emerald-200/60" }, "Додайте перший стіл кнопкою «+» у верхній панелі.")
          )
        ),

        upd.phase === "downloading" && (
          React.createElement(Toast, null, "Завантаження оновлення… ", upd.progress, "%")
        ),
        upd.phase === "downloaded" && (
          React.createElement(Toast, { green: true }, "Оновлення готове • ",
            React.createElement("button", { className: "underline", onClick: function() { return window.updates.quitAndInstall()} }, "Перезапустити й встановити"),
            React.createElement("button", { className: "h-8 px-3 rounded-lg border border-emerald-400/40 bg-emerald-900/50 text-emerald-100 text-xs hover:bg-emerald-800/60 transition", onClick: function() { return setLicenseOpen(true) } }, "Ліцензія"))
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
          bookingServerEnabled: bookingServerEnabled,
          setBookingServerEnabled: setBookingServerEnabled,
          bookingServerUrl: bookingServerUrl,
          setBookingServerUrl: setBookingServerUrl,
          bookingServerToken: bookingServerToken,
          setBookingServerToken: setBookingServerToken,
          checkboxSettings: checkboxSettings,
          setCheckboxSettings: setCheckboxSettings,
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
          summarize: summarizeRecords,
          checkboxEnabled: !!(checkboxSettings && checkboxSettings.enabled)
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
          tables: tables,
          clients: customers,
          editorReservationId: reservationEditId,
          onConsumeEditorRequest: function() { return setReservationEditId(null); }
        })
      ),

      showOnlineBookings && (
        React.createElement(OnlineBookingsModal, {
          onClose: function(){ return setShowOnlineBookings(false); },
          online: online,
          baseUrl: bookingServerUrl,
          token: bookingServerToken,
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

      paymentState && React.createElement(PaymentModal, {
        onClose: function(){ paymentState.resolve(null); setPaymentState(null); },
        onSelect: function(m){ paymentState.resolve(m); setPaymentState(null); },
        checkboxEnabled: !!(checkboxSettings && checkboxSettings.enabled)
      })
    )
  );
}

/* ======================= Дрібні допоміжні JSX ======================= */
/**
 * Пункт меню. Приймає рядок виду "📈 Статистика" або
 * "🌐 Онлайн бронювання (3)" — емодзі виноситься в окрему колонку,
 * число в дужках стає бейджем праворуч.
 */
function MenuItem({ children, onClick }) {
  let icon = null;
  let label = children;
  let badge = null;

  if (typeof children === "string") {
    const m = children.match(/^(\S+)\s+(.*)$/u);
    if (m && /[^\u0000-\u024F]/u.test(m[1])) {
      icon = m[1];
      label = m[2];
    }
    const b = String(label).match(/^(.*?)\s*\((\d+)\)\s*$/u);
    if (b) {
      label = b[1];
      badge = b[2];
    }
  }

  const danger = icon === "🚪";

  return React.createElement(
    "button",
    {
      className:
        "group w-full flex items-center gap-3 text-left px-2.5 py-2.5 text-[13px] rounded-2xl " +
        "transition-all duration-150 hover:translate-x-0.5 " +
        (danger
          ? "text-rose-200/85 hover:bg-rose-900/40 hover:text-rose-100"
          : "text-emerald-100/85 hover:bg-emerald-800/45 hover:text-emerald-50"),
      onClick: onClick,
    },
    icon &&
      React.createElement(
        "span",
        {
          className:
            "grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[15px] leading-none ring-1 transition-colors duration-150 " +
            (danger
              ? "bg-rose-500/10 ring-rose-400/20 group-hover:bg-rose-500/20"
              : "bg-emerald-500/10 ring-emerald-400/20 group-hover:bg-emerald-500/20"),
        },
        icon
      ),
    React.createElement("span", { className: "flex-1 min-w-0 truncate font-medium" }, label),
    badge &&
      React.createElement(
        "span",
        {
          className:
            "shrink-0 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white " +
            "shadow-[0_0_10px_rgba(52,211,153,0.6)]",
        },
        badge
      )
  );
}

function Hr({ title }) {
  if (title) {
    return React.createElement(
      "div",
      { className: "mt-3 mb-1 flex items-center gap-2 px-2.5" },
      React.createElement("span", {
        className: "text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-300/45 whitespace-nowrap",
      }, title),
      React.createElement("span", {
        className: "h-px flex-1 bg-gradient-to-r from-emerald-500/25 to-transparent",
      })
    );
  }
  return React.createElement("div", {
    className: "my-1.5 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent",
  });
}
function Toast({ children, green, red }) {
  const cls = red
    ? "border-rose-400/40 bg-rose-950/80 text-rose-100 shadow-[0_12px_40px_rgba(244,63,94,0.25)]"
    : green
    ? "border-emerald-400/40 bg-emerald-950/80 text-emerald-100 shadow-[0_12px_40px_rgba(52,211,153,0.3)]"
    : "border-emerald-500/25 bg-slate-950/85 text-emerald-100 shadow-[0_12px_40px_rgba(0,0,0,0.6)]";
  return (
    React.createElement("div", {
      className:
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] inline-flex items-center gap-3 " +
        "rounded-2xl border px-4 py-2.5 text-sm backdrop-blur-xl " + cls,
    }, children)
  );
}

/* Простий селектор способу оплати */


