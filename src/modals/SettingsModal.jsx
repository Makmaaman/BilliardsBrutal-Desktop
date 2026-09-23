// src/modals/SettingsModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import ModalShell from "../components/ModalShell";
import FacilityMapEditor from "../components/map/FacilityMapEditor";

import ReceiptTab from "./Settings/ReceiptTab";
import CheckboxTab from "./Settings/CheckboxTab";
import { loadPrinterSettings, savePrinterSettings } from "../utils/printerSettings";

// settings for VPS online booking server
import {
  generateTerminalToken,
  loadBookingServerSettings,
  saveBookingServerSettings,
} from "../utils/bookingServerSettings.js";

const TabBtn = ({ active, onClick, icon, children }) => (
  <button
    onClick={onClick}
    className={[
      "h-10 px-4 rounded-xl text-sm font-medium border transition-all duration-200",
      "inline-flex items-center gap-2 whitespace-nowrap",
      active
        ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-emerald-400/60 shadow-lg shadow-emerald-500/30"
        : "bg-slate-900/60 text-emerald-100/80 border-emerald-500/25 hover:bg-emerald-900/40 hover:text-emerald-50 hover:border-emerald-400/45",
    ].join(" ")}
  >
    {icon && <span className="text-base leading-none">{icon}</span>}
    {children}
  </button>
);

function isValidIPv4(ip) {
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(
    String(ip || "").trim()
  );
}

function normalizeServerUrl(url) {
  let u = String(url || "").trim();
  if (!u) return "";
  u = u.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

function isValidTimeHHMM(v) {
  const s = String(v || "").trim();
  if (!/^\d{2}:\d{2}$/.test(s)) return false;
  const [h, m] = s.split(":").map((x) => Number(x));
  return Number.isFinite(h) && Number.isFinite(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

export default function SettingsModal(props) {
  const {
    onClose = () => {},
    // general
    espIP,
    setEspIP = () => {},
    mockMode,
    setMockMode = () => {},
    // printer
    printerIP,
    setPrinterIP = () => {},
    printerMock,
    setPrinterMock = () => {},
    onTestPrint = () => {},
    // controllers & tables
    controllers = [],
    setControllers = () => {},
    tables = [],
    tableCtrl = {},
    setTableCtrl = () => {},
    relays = {},
    setRelays = () => {},
    relayIPs = {},
    setRelayIPs = () => {},
    // bonuses
    bonusEarnPct,
    setBonusEarnPct = () => {},
    bonusPerHour,
    setBonusPerHour = () => {},
    // facility map
    facilityMap,
    setFacilityMap = () => {},

    // ✅ NEW: online booking props from App (щоб зберігалося у LS_APP)
    bookingServerEnabled,
    setBookingServerEnabled = null,
    bookingServerUrl,
    setBookingServerUrl = null,
    bookingServerToken,
    setBookingServerToken = null,

    // Checkbox ПРРО (фіскалізація)
    checkboxSettings = {},
    setCheckboxSettings = null,
  } = props || {};

  const [tab, setTab] = useState("map");

  // Принтерні налаштування (кодування, довжина чеку, логотип)
  const [printerSettings, setPrinterSettings] = useState(() => loadPrinterSettings());

  useEffect(() => {
    setPrinterSettings(loadPrinterSettings());
  }, []);

  async function printCodepageTest() {
    const ip = (printerIP || printerSettings.ip || "").trim();
    if (!ip) {
      alert("Спочатку вкажіть IP принтера.");
      return;
    }
    try {
      const res = await window.printers?.printCodepageTest?.(ip);
      if (!res?.ok) {
        alert("Не вдалося надрукувати тест: " + (res?.error || "невідома помилка"));
        return;
      }
      alert(
        "Надруковано список кодових таблиць.\n\n" +
          "Знайдіть рядок, де українські літери читаються правильно, впишіть його номер n " +
          "у поле «Кодова таблиця принтера», а в «Кодування» виберіть те, що вказане в тому ж рядку."
      );
    } catch (e) {
      alert("Помилка друку: " + (e?.message || e));
    }
  }

  function updatePrinterSettings(patch) {
    const next = savePrinterSettings(patch);
    setPrinterSettings(next);
  }

  function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      updatePrinterSettings({ logoBase64: ev.target.result });
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    updatePrinterSettings({ logoBase64: null });
  }

  // ---- Connectivity check ----
  const [online, setOnline] = useState({}); // {ctrlId: boolean}
  const [fallbackOnline, setFallbackOnline] = useState(null); // null | boolean
  const [checking, setChecking] = useState(false);

  const bases = useMemo(() => {
    const out = {};
    (controllers || []).forEach((c) => {
      const ip = (c?.ip || "").trim();
      if (ip && isValidIPv4(ip)) out[c.id] = "http://" + ip;
    });
    return out;
  }, [controllers]);

  async function pingURL(url) {
    try {
      const opt = {};
      if (typeof import.meta !== "undefined" && import.meta.env?.DEV) opt.mode = "no-cors";
      const r = await Promise.race([
        fetch(url, opt),
        new Promise((_, rej) => setTimeout(() => rej(new Error("TO")), 1200)),
      ]);
      return !!r;
    } catch {
      return false;
    }
  }
  async function pingCtrl(id) {
    const base = bases[id];
    if (!base) return false;
    return pingURL(base + "/ping");
  }
  async function pingEspIP() {
    const ip = String(espIP || "").trim();
    if (!ip || !isValidIPv4(ip)) return null;
    return pingURL("http://" + ip + "/ping");
  }

  async function recheckAll() {
    setChecking(true);
    const ids = (controllers || []).filter((x) => x && x.enabled !== false).map((x) => x.id);
    const result = {};
    for (const id of ids) {
      result[id] = await pingCtrl(id);
    }
    setOnline(result);
    const espOk = await pingEspIP();
    setFallbackOnline(espOk);
    setChecking(false);
  }

  useEffect(() => {
    let stop = false;
    async function tick() {
      const ids = (controllers || []).filter((x) => x && x.enabled !== false).map((x) => x.id);
      const result = {};
      for (const id of ids) {
        result[id] = await pingCtrl(id);
      }
      if (!stop) setOnline(result);
      const espOk = await pingEspIP();
      if (!stop) setFallbackOnline(espOk);
    }
    tick();
    const t = setInterval(tick, 7000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [controllers, bases, espIP]);

  // ---- CRUD for controllers ----
  function updateController(idx, patch) {
    setControllers((arr) => {
      const next = [].concat(arr || []);
      const curr = { ...(next[idx] || {}) };
      const merged = { ...curr, ...patch };
      if (curr.isNew) delete merged.isNew;
      next[idx] = merged;
      return next;
    });
  }
  function addController() {
    setControllers((arr) => {
      const id = "ctrl-" + Math.random().toString(36).slice(2, 8);
      return [].concat(arr || [], [
        { id, name: "Контролер", ip: "", channels: 8, enabled: true, isNew: true },
      ]);
    });
    setTimeout(() => {
      const el = document.querySelector("#controllers-list-end");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 30);
  }
  function removeController(idx) {
    setControllers((arr) => (arr || []).filter((_, i) => i !== idx));
  }

  const anyOnline = Object.values(online || {}).some(Boolean) || !!fallbackOnline;

  // ============== ПРИНТЕР: сканер/тест RAW ==============
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState([]); // [{ip, kind, ports:{raw9100, ipp, lpd}}]
  const [scanMsg, setScanMsg] = useState("");
  const [manualIP, setManualIP] = useState("");

  async function scanPrinters() {
    setFinding(true);
    setScanMsg("Сканую мережу…");
    setFound([]);
    try {
      const list = (await window.printers?.scan?.({})) || [];
      setFound(Array.isArray(list) ? list : []);
      setScanMsg(!list?.length ? "Нічого не знайдено" : "");
    } catch (e) {
      setScanMsg("Помилка: " + (e?.message || String(e)));
    } finally {
      setFinding(false);
    }
  }
  async function probeIP() {
    const ip = (manualIP || "").trim();
    if (!isValidIPv4(ip)) {
      setScanMsg("Вкажіть коректний IP (IPv4).");
      return;
    }
    setFinding(true);
    setScanMsg("Перевіряю IP…");
    try {
      const res = await window.printers?.probeIp?.(ip);
      if (res?.ok && res?.probe) {
        setFound([{ ip, kind: res.probe.kind || "unknown", ports: res.probe.ports || {} }]);
        setScanMsg("");
      } else {
        setFound([]);
        setScanMsg("Портів для друку не знайдено на цьому IP.");
      }
    } catch (e) {
      setFound([]);
      setScanMsg("Помилка перевірки: " + (e?.message || String(e)));
    } finally {
      setFinding(false);
    }
  }
  async function testRaw() {
    const ip = (printerIP || "").trim();
    if (!isValidIPv4(ip)) {
      alert("Спочатку оберіть/введіть коректний IP принтера.");
      return;
    }
    const r = await window.printers?.testRaw?.(ip);
    if (r?.ok) alert("RAW:9100 тест → OK (принтер прийняв дані)");
    else alert("RAW:9100 тест не вдався: " + (r?.error || "невідомо"));
  }

  // =================== ONLINE BOOKING SERVER SETTINGS ===================
  const [bookingCfg, setBookingCfg] = useState(() => loadBookingServerSettings());
  useEffect(() => {
    const cur = loadBookingServerSettings();
    // синхронізуємо з App-стейтами (якщо передані)
    const merged = {
      ...cur,
      enabled: typeof bookingServerEnabled === "boolean" ? bookingServerEnabled : cur.enabled,
      serverUrl: typeof bookingServerUrl === "string" ? bookingServerUrl : cur.serverUrl,
      token: typeof bookingServerToken === "string" ? bookingServerToken : cur.token,
    };
    setBookingCfg(merged);
  }, []);

  // якщо App-стейти змінились ззовні — підтягуємо в UI
  useEffect(() => {
    setBookingCfg((prev) => ({
      ...(prev || {}),
      enabled: typeof bookingServerEnabled === "boolean" ? bookingServerEnabled : (prev?.enabled ?? true),
      serverUrl: typeof bookingServerUrl === "string" ? bookingServerUrl : (prev?.serverUrl || ""),
      token: typeof bookingServerToken === "string" ? bookingServerToken : (prev?.token || ""),
    }));
  }, [bookingServerEnabled, bookingServerUrl, bookingServerToken]);

  function patchBookingCfg(patch) {
    const next = saveBookingServerSettings(patch); // як було
    setBookingCfg(next);

    // ✅ головне: пушимо в App, щоб воно зберігалося в LS_APP і використовувалось хуком
    try {
      if (Object.prototype.hasOwnProperty.call(patch, "enabled") && typeof setBookingServerEnabled === "function") {
        setBookingServerEnabled(!!patch.enabled);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "serverUrl") && typeof setBookingServerUrl === "function") {
        setBookingServerUrl(patch.serverUrl);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "token") && typeof setBookingServerToken === "function") {
        setBookingServerToken(patch.token);
      }
    } catch {}
  }

  const [copyMsg, setCopyMsg] = useState("");

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      setCopyMsg("Скопійовано ✅");
      setTimeout(() => setCopyMsg(""), 1200);
    } catch {
      setCopyMsg("Не вдалося скопіювати");
      setTimeout(() => setCopyMsg(""), 1500);
    }
  }

  function regenToken() {
    const t = generateTerminalToken();
    patchBookingCfg({ token: t });
  }

  const serverUrlOk = !!normalizeServerUrl(bookingCfg.serverUrl);
  const tokenOk = !!String(bookingCfg.token || "").trim();

  return (
    <ModalShell
      title="Налаштування"
      onClose={onClose}
      containerStyle={{ width: "1200px", maxWidth: "92vw", height: "820px", maxHeight: "88vh" }}
      footer={
        <div className="flex justify-between w-full items-center">
          <div className="text-xs text-emerald-200">
            {mockMode ? (
              <span className="px-2 py-1 rounded-lg bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/40">
                Тестовий режим увімкнено
              </span>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <button className="h-9 px-3 rounded-lg border border-emerald-500/40 text-emerald-100 hover:bg-emerald-800/40" onClick={recheckAll}>
              {checking ? "Перевіряю…" : "Перевірити зараз"}
            </button>
            {!mockMode && (
              <button
                className="h-9 px-3 rounded-lg border border-emerald-500/30 bg-emerald-900/40 text-emerald-100 text-sm hover:bg-emerald-800/60 transition"
                onClick={() => setMockMode(true)}
              >
                Увімкнути тестовий режим
              </button>
            )}
            <button className="h-9 px-4 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500" onClick={onClose}>
              Готово
            </button>
          </div>
        </div>
      }
    >
      {/* Tabs */}
      <div className="sticky top-0 z-10 -mx-1 px-1 pb-3 mb-4 bg-gradient-to-b from-slate-950/95 via-slate-950/85 to-transparent backdrop-blur-sm border-b border-emerald-500/15">
        <div className="flex flex-wrap gap-2">
          <TabBtn icon="🗺" active={tab === "map"} onClick={() => setTab("map")}>
            Карта закладу
          </TabBtn>
          <TabBtn icon="🧾" active={tab === "receipt"} onClick={() => setTab("receipt")}>
            Чек
          </TabBtn>
          <TabBtn icon="📡" active={tab === "controllers"} onClick={() => setTab("controllers")}>
            Контролери
          </TabBtn>
          <TabBtn icon="🎱" active={tab === "tables"} onClick={() => setTab("tables")}>
            Столи
          </TabBtn>
          <TabBtn icon="⚙️" active={tab === "general"} onClick={() => setTab("general")}>
            Загальні
          </TabBtn>
          <TabBtn icon="🖨" active={tab === "printer"} onClick={() => setTab("printer")}>
            Принтер
          </TabBtn>
          <TabBtn icon="🌐" active={tab === "online"} onClick={() => setTab("online")}>
            Онлайн бронювання
          </TabBtn>
          <TabBtn icon="🏦" active={tab === "checkbox"} onClick={() => setTab("checkbox")}>
            Фіскалізація
          </TabBtn>
        </div>
      </div>

      {tab === "receipt" && <ReceiptTab />}

      {/* BODY */}
      <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden pr-2 space-y-6 custom-scrollbar">
        {tab === "map" && (
          <section className="space-y-4">
            <FacilityMapEditor value={facilityMap} onChange={setFacilityMap} tables={tables} />
          </section>
        )}

        {tab === "controllers" && (
          <section className="space-y-4">
            {/* Overall status banner */}
            <div
              className={
                "p-3 rounded-xl ring-1 " +
                (anyOnline
                  ? "bg-emerald-50 ring-emerald-200 text-emerald-700"
                  : "bg-amber-50 ring-amber-200 text-amber-700")
              }
            >
              {anyOnline ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-emerald-100">
                    Підключення знайдено. Онлайн: {Object.values(online || {}).filter(Boolean).length}{" "}
                    / {(controllers || []).filter((c) => c?.enabled !== false).length}
                    {fallbackOnline ? " (є звʼязок за ESP IP)" : ""}
                  </div>
                  <div className="flex gap-2">
                    <button className="h-8 px-3 rounded-lg border border-emerald-500/30 bg-emerald-900/40 text-emerald-100 text-xs hover:bg-emerald-800/60 transition" onClick={recheckAll}>
                      Оновити статус
                    </button>
                    {mockMode && (
                      <button className="h-8 px-3 rounded-lg border border-emerald-500/30 bg-emerald-900/40 text-emerald-100 text-xs hover:bg-emerald-800/60 transition" onClick={() => setMockMode(false)}>
                        Вимкнути тестовий режим
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-emerald-100">Немає підключення до ESP-реле.</div>
                  <div className="text-xs">
                    Переконайтесь у коректності IP-адрес контролерів
                    {espIP ? ` або fallback ESP IP: ${espIP}` : ""}.
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="h-8 px-3 rounded-lg border border-emerald-500/30 bg-emerald-900/40 text-emerald-100 text-xs hover:bg-emerald-800/60 transition" disabled={checking} onClick={recheckAll}>
                      {checking ? "Перевіряю…" : "Перевірити ще раз"}
                    </button>
                    {!mockMode && (
                      <button
                        className="h-8 px-3 rounded-lg border border-emerald-500/40 bg-emerald-600 text-white text-xs hover:bg-emerald-500 transition"
                        onClick={() => setMockMode(true)}
                      >
                        Увімкнути тестовий режим
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-emerald-100 tracking-wide pb-2 mb-1 border-b border-emerald-500/20">ESP контролери</div>
              <div className="flex flex-wrap gap-2">
                <button className="h-9 px-3 rounded-xl border" onClick={addController}>
                  Додати контролер
                </button>
              </div>
            </div>

            {/* List */}
            {(controllers || []).length === 0 && (
              <div className="text-xs text-emerald-200/60">
                Немає контролерів. Натисніть <b>Додати контролер</b>, щоб створити перший.
              </div>
            )}

            <div className="space-y-2" id="controllers-list">
              {(controllers || []).map((c, idx) => (
                <div
                  key={c.id || idx}
                  className={
                    "grid grid-cols-1 gap-2 md:grid-cols-12 md:gap-3 p-3 rounded-xl border transition-colors " +
                    (c.isNew
                      ? "border-amber-400/40 bg-amber-500/10"
                      : "border-emerald-500/20 bg-emerald-950/30 hover:border-emerald-400/40")
                  }
                >
                  <div className="md:col-span-3 min-w-0">
                    <label className="text-xs text-emerald-200/60">Назва</label>
                    <input
                      className="w-full h-9 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                      placeholder="Напр., Контролер зал 1"
                      value={c?.name || ""}
                      onChange={(e) => updateController(idx, { name: e.target.value })}
                    />
                  </div>

                  <div className="md:col-span-3 min-w-0">
                    <label className="text-xs text-emerald-200/60">IP</label>
                    <input
                      className="w-full h-9 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition font-mono text-xs break-words"
                      placeholder="192.168.0.10"
                      value={c?.ip || ""}
                      onChange={(e) => updateController(idx, { ip: e.target.value })}
                    />
                  </div>

                  <div className="md:col-span-2 min-w-0">
                    <label className="text-xs text-emerald-200/60">К-ть каналів</label>
                    <input
                      className="w-full h-9 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                      type="number"
                      min={1}
                      max={32}
                      value={Number(c?.channels ?? 8)}
                      onChange={(e) => updateController(idx, { channels: Number(e.target.value) || 8 })}
                    />
                  </div>

                  <div className="md:col-span-2 min-w-0">
                    <label className="text-xs text-emerald-200/60">Статус</label>
                    <div
                      className={
                        "h-9 px-3 rounded-xl border flex items-center truncate " +
                        (online[c.id]
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-emerald-500/30 text-emerald-200/60")
                      }
                    >
                      {online[c.id] ? "online" : "offline"}
                    </div>
                  </div>

                  <div className="md:col-span-2 min-w-0">
                    <label className="text-xs text-emerald-200/60">Дії</label>
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex items-center gap-2 text-sm text-emerald-100 whitespace-nowrap">
                        <input
                          type="checkbox" className="h-4 w-4 rounded accent-emerald-500"
                          checked={c?.enabled !== false}
                          onChange={(e) => updateController(idx, { enabled: e.target.checked })}
                        />
                        Увімкнено
                      </label>
                      <button
                        className="h-8 px-3 rounded-xl border"
                        onClick={() => pingCtrl(c.id).then((ok) => setOnline((o) => ({ ...(o || {}), [c.id]: ok })))}
                      >
                        Ping
                      </button>
                      <button
                        className="h-8 px-3 rounded-xl border border-rose-300 text-rose-600"
                        onClick={() => removeController(idx)}
                      >
                        Видалити
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <div id="controllers-list-end" />
            </div>
          </section>
        )}

        {tab === "tables" && (
          <section className="space-y-3 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-slate-900/80 via-emerald-950/40 to-slate-900/80 shadow-[inset_0_1px_0_rgba(52,211,153,0.08),0_8px_24px_rgba(0,0,0,0.35)] p-4">
            <div className="text-sm font-semibold text-emerald-100 tracking-wide pb-2 mb-3 border-b border-emerald-500/20">Столи → контролер та канал</div>
            {(tables || []).map((t) => {
              const cid = tableCtrl?.[t.id] || (controllers?.[0]?.id || "");
              const ctrl = (controllers || []).find((c) => c.id === cid) || (controllers || [])[0];
              return (
                <div key={t.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 items-center">
                  <div className="md:col-span-3 text-sm min-w-0">{t.name || `Стіл ${t.id}`}</div>
                  <div className="md:col-span-3 min-w-0">
                    <label className="text-xs text-emerald-200/60">Контролер</label>
                    <select
                      className="w-full h-9 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                      value={cid}
                      onChange={(e) => setTableCtrl((o) => ({ ...(o || {}), [t.id]: e.target.value }))}
                    >
                      {(controllers || [])
                        .filter((x) => x && x.enabled !== false)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name || c.id}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="md:col-span-2 min-w-0">
                    <label className="text-xs text-emerald-200/60">Канал</label>
                    <input
                      className="w-full h-9 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                      type="number"
                      min={0}
                      max={32}
                      value={Number(relays?.[t.id] ?? 0)}
                      onChange={(e) =>
                        setRelays((o) => ({ ...(o || {}), [t.id]: Number(e.target.value) || 0 }))
                      }
                    />
                  </div>
                  <div className="md:col-span-2 min-w-0">
                    <label className="text-xs text-emerald-200/60">IP</label>
                    <div className="h-9 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition flex items-center text-xs break-all">
                      {ctrl?.ip || "—"}
                    </div>
                  </div>
                  <div className="md:col-span-2 min-w-0">
                    <label className="text-xs text-emerald-200/60">Override IP</label>
                    <input
                      className="w-full h-9 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                      type="text"
                      value={relayIPs?.[t.id] || ""}
                      onChange={(e) => setRelayIPs((o) => ({ ...(o || {}), [t.id]: e.target.value }))}
                    />
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {tab === "general" && (
          <div className="grid md:grid-cols-2 gap-6">
            <section className="space-y-3 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-slate-900/80 via-emerald-950/40 to-slate-900/80 shadow-[inset_0_1px_0_rgba(52,211,153,0.08),0_8px_24px_rgba(0,0,0,0.35)] p-4">
              <div className="text-sm font-semibold text-emerald-100 tracking-wide pb-2 mb-1 border-b border-emerald-500/20">ESP контролер</div>
              <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">IP-адреса (фолбек)</label>
              <input
                className="w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                value={espIP || ""}
                onChange={(e) => setEspIP(e.target.value)}
              />
              <label className="flex items-center gap-2 text-sm text-emerald-100">
                <input type="checkbox" className="h-4 w-4 rounded accent-emerald-500" checked={!!mockMode} onChange={(e) => setMockMode(e.target.checked)} />
                Працювати в режимі «mock» (без реального обладнання)
              </label>
            </section>

            <section className="space-y-3 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-slate-900/80 via-emerald-950/40 to-slate-900/80 shadow-[inset_0_1px_0_rgba(52,211,153,0.08),0_8px_24px_rgba(0,0,0,0.35)] p-4">
              <div className="text-sm font-semibold text-emerald-100 tracking-wide pb-2 mb-1 border-b border-emerald-500/20">Бонуси</div>
              <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">% від нетто</label>
              <input
                className="w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                type="number"
                min={0}
                step={0.5}
                value={Number(bonusEarnPct ?? 0)}
                onChange={(e) => setBonusEarnPct(Number(e.target.value) || 0)}
              />
              <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">Грн/год (накопичення)</label>
              <input
                className="w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                type="number"
                min={0}
                step={1}
                value={Number(bonusPerHour ?? 0)}
                onChange={(e) => setBonusPerHour(Number(e.target.value) || 0)}
              />
            </section>
          </div>
        )}

        {tab === "printer" && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* ... твій printer таб без змін ... */}
            <section className="space-y-4 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-slate-900/80 via-emerald-950/40 to-slate-900/80 shadow-[inset_0_1px_0_rgba(52,211,153,0.08),0_8px_24px_rgba(0,0,0,0.35)] p-4">
              <div className="text-sm font-semibold text-emerald-100 tracking-wide pb-2 mb-1 border-b border-emerald-500/20">Принтер (RAW:9100)</div>
              <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">IP принтера</label>
              <div className="flex gap-2">
                <input
                  className="w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition font-mono"
                  placeholder="192.168.1.126"
                  value={printerIP || ""}
                  onChange={(e) => setPrinterIP(e.target.value)}
                />
                <button className="h-10 px-4 rounded-xl border border-emerald-500/30 bg-emerald-900/40 text-emerald-100 text-sm hover:bg-emerald-800/60 hover:border-emerald-400/50 transition px-3" onClick={testRaw}>
                  Тест RAW
                </button>
              </div>

              <label className="flex items-center gap-2 text-sm text-emerald-100">
                <input type="checkbox" className="h-4 w-4 rounded accent-emerald-500" checked={!!printerMock} onChange={(e) => setPrinterMock(e.target.checked)} />
                Режим «mock» (без реального принтера)
              </label>

              <div className="flex items-center gap-2">
                <button className="h-10 px-4 rounded-xl border border-emerald-500/30 bg-emerald-900/40 text-emerald-100 text-sm hover:bg-emerald-800/60 hover:border-emerald-400/50 transition" onClick={onTestPrint}>
                  Тестовий чек (App)
                </button>
              </div>

              <div className="h-px bg-emerald-500/20 my-3" />

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">Ширина паперу</label>
                  <select
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition text-sm"
                    value={String(printerSettings.paperWidth || "80")}
                    onChange={(e) => {
                      const pw = e.target.value;
                      updatePrinterSettings({
                        paperWidth: pw,
                        // лого не ширше за друкарську область принтера
                        logoWidth: Math.min(Number(printerSettings.logoWidth || 384), pw === "58" ? 384 : 576),
                      });
                    }}
                  >
                    <option value="80">80 мм (48 символів)</option>
                    <option value="58">58 мм (32 символи)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">Вигляд чека</label>
                  <select
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition text-sm"
                    value={printerSettings.receiptStyle || "pretty"}
                    onChange={(e) => updatePrinterSettings({ receiptStyle: e.target.value })}
                  >
                    <option value="pretty">Гарний (заголовок, колонки, жирна сума)</option>
                    <option value="template">Власний шаблон (вкладка «Чек»)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">Підпис унизу чека</label>
                  <input
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                    placeholder="Дякуємо за візит!"
                    value={printerSettings.receiptFooter ?? ""}
                    onChange={(e) => updatePrinterSettings({ receiptFooter: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">Кодування ESC/POS</label>
                  <select
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition text-sm"
                    value={printerSettings.encoding || "CP1251"}
                    onChange={(e) => updatePrinterSettings({ encoding: e.target.value })}
                  >
                    <option value="CP1251">CP1251 — рекомендовано (є і, ї, є, ґ)</option>
                    <option value="CP1125">CP1125 (українська DOS)</option>
                    <option value="CP866">CP866 — без «і» та «ґ»</option>
                    <option value="UTF-8">UTF-8</option>
                    <option value="KOI8-U">KOI8-U</option>
                    <option value="ASCII">ASCII</option>
                  </select>
                  <p className="mt-1 text-[11px] text-emerald-200/50">
                    CP866 не містить українських «і» та «ґ» — вони друкуються як «?».
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">Кодова таблиця принтера (ESC t)</label>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    placeholder="авто"
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                    value={printerSettings.codepageId ?? ""}
                    onChange={(e) => {
                      const v = String(e.target.value).trim();
                      updatePrinterSettings({ codepageId: v === "" ? null : Number(v) });
                    }}
                  />
                  <p className="mt-1 text-[11px] text-emerald-200/50">
                    Порожньо = авто (CP1251 → 46, CP866 → 17). Номери в різних моделей
                    відрізняються — якщо друкуються ієрогліфи, надрукуйте список варіантів:
                  </p>
                  <button
                    type="button"
                    className="mt-2 h-9 px-3 rounded-lg text-sm bg-amber-500 text-white hover:bg-amber-400"
                    onClick={printCodepageTest}
                  >
                    Підібрати кодову таблицю (друк тесту)
                  </button>
                </div>

                <label className="flex items-center gap-2 text-sm text-emerald-100">
                  <input
                    type="checkbox" className="h-4 w-4 rounded accent-emerald-500"
                    checked={printerSettings.autoCut !== false}
                    onChange={(e) => updatePrinterSettings({ autoCut: e.target.checked })}
                  />
                  Відрізати папір після чека
                </label>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">Довжина чеку (порожні рядки в кінці)</label>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                    value={Number(printerSettings.receiptExtraLines ?? 4)}
                    onChange={(e) =>
                      updatePrinterSettings({
                        receiptExtraLines: Math.min(40, Math.max(1, Number(e.target.value) || 1)),
                      })
                    }
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">Логотип для чеку</label>
                  {printerSettings.logoBase64 ? (
                    <div className="mt-2 space-y-2">
                      <div className="inline-flex items-center rounded-xl bg-emerald-950/60 border border-emerald-500/25 p-2">
                        <img
                          src={printerSettings.logoBase64}
                          alt="Логотип"
                          className="max-h-24 object-contain bg-white rounded-lg shadow-sm p-1"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button type="button" className="h-8 px-3 rounded-lg border border-emerald-500/30 bg-emerald-900/40 text-emerald-100 text-xs hover:bg-emerald-800/60 transition h-9" onClick={removeLogo}>
                          Видалити логотип
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="block w-full text-xs text-emerald-200/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 cursor-pointer"
                      />
                      <p className="mt-1 text-[11px] text-emerald-200/50">
                        Рекомендується світлий логотип ~300px шириною для 58мм принтера.
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">Ширина логотипу (px)</label>
                  <input
                    type="number"
                    min={150}
                    max={String(printerSettings.paperWidth || "80") === "58" ? 384 : 576}
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                    value={Number(printerSettings.logoWidth ?? 384)}
                    onChange={(e) => {
                      const max = String(printerSettings.paperWidth || "80") === "58" ? 384 : 576;
                      updatePrinterSettings({
                        logoWidth: Math.min(max, Math.max(150, Number(e.target.value) || 384)),
                      });
                    }}
                  />
                  <p className="mt-1 text-[11px] text-emerald-200/50">
                    Максимум: 58мм — 384 px, 80мм — 576 px. Логотип друкується по центру
                    над назвою клубу. Найкраще — чорно-біле зображення PNG.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-slate-900/80 via-emerald-950/40 to-slate-900/80 shadow-[inset_0_1px_0_rgba(52,211,153,0.08),0_8px_24px_rgba(0,0,0,0.35)] p-4">
              <div className="text-sm font-semibold text-emerald-100 tracking-wide pb-2 mb-1 border-b border-emerald-500/20">Пошук принтерів у мережі</div>

              <div className="flex gap-2">
                <button className="h-10 px-4 rounded-xl border border-emerald-500/30 bg-emerald-900/40 text-emerald-100 text-sm hover:bg-emerald-800/60 hover:border-emerald-400/50 transition" onClick={scanPrinters} disabled={finding}>
                  {finding ? "Сканую…" : "Сканувати мережу"}
                </button>
                <input
                  className="h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition font-mono w-[180px]"
                  placeholder="Перевірити IP"
                  value={manualIP}
                  onChange={(e) => setManualIP(e.target.value)}
                />
                <button className="h-10 px-4 rounded-xl border border-emerald-500/30 bg-emerald-900/40 text-emerald-100 text-sm hover:bg-emerald-800/60 hover:border-emerald-400/50 transition" onClick={probeIP} disabled={finding}>
                  Перевірити
                </button>
              </div>

              {scanMsg && <div className="text-xs text-emerald-200/70">{scanMsg}</div>}

              <div className="max-h-48 overflow-auto divide-y divide-emerald-500/15 rounded-xl border border-emerald-500/25">
                {(found || []).map((p) => (
                  <div key={p.ip} className="flex items-center justify-between px-3 py-2 hover:bg-emerald-900/30 transition">
                    <div className="text-sm">
                      <div className="font-mono">{p.ip}</div>
                      <div className="text-xs text-emerald-200/60">
                        {p.kind?.toUpperCase() || "unknown"} • RAW:{String(p?.ports?.raw9100)} IPP:
                        {String(p?.ports?.ipp)} LPD:{String(p?.ports?.lpd)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="h-8 px-3 rounded-lg border border-emerald-500/30 bg-emerald-900/40 text-emerald-100 text-xs hover:bg-emerald-800/60 transition" onClick={() => setPrinterIP(p.ip)}>
                        Вибрати
                      </button>
                      <button
                        className="h-8 px-3 rounded-lg border border-emerald-500/30 bg-emerald-900/40 text-emerald-100 text-xs hover:bg-emerald-800/60 transition"
                        onClick={async () => {
                          const r = await window.printers?.testRaw?.(p.ip);
                          alert(r?.ok ? "RAW:9100 тест → OK" : "Помилка: " + (r?.error || "невідомо"));
                        }}
                      >
                        Тест RAW
                      </button>
                    </div>
                  </div>
                ))}
                {!found?.length && !scanMsg && (
                  <div className="px-3 py-2 text-sm text-emerald-200/60">
                    Натисніть «Сканувати мережу» або «Перевірити»
                  </div>
                )}
              </div>

              <div className="text-xs text-emerald-200/70">
                Підказка: XPrinter по Wi-Fi зазвичай підтримує RAW:9100. Якщо RAW недоступний — перевірте, що ПК і принтер
                в одній підмережі та на принтері не вимкнений RAW-порт.
              </div>
            </section>
          </div>
        )}

        {/* =================== ONLINE BOOKING SERVER =================== */}
        {tab === "online" && (
          <section className="space-y-4 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-slate-900/80 via-emerald-950/40 to-slate-900/80 shadow-[inset_0_1px_0_rgba(52,211,153,0.08),0_8px_24px_rgba(0,0,0,0.35)] p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-emerald-100 tracking-wide pb-2 mb-1 border-b border-emerald-500/20">Онлайн бронювання (VPS)</div>
                <div className="text-xs text-emerald-200/60 mt-1">
                  Вкажіть адресу сервера та Token. Token генерує фізична програма — його треба вставити на сервері.
                </div>
              </div>
              <div className="text-xs text-emerald-200/60">{copyMsg}</div>
            </div>

            <label className="flex items-center gap-2 text-sm text-emerald-100">
              <input
                type="checkbox" className="h-4 w-4 rounded accent-emerald-500"
                checked={bookingCfg?.enabled !== false}
                onChange={(e) => patchBookingCfg({ enabled: e.target.checked })}
              />
              Увімкнути онлайн бронювання
            </label>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">Адреса сервера</label>
                <input
                  className="w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition font-mono text-xs"
                  placeholder="https://bkduna.com.ua"
                  value={bookingCfg.serverUrl || ""}
                  onChange={(e) => patchBookingCfg({ serverUrl: e.target.value })}
                  onBlur={(e) => patchBookingCfg({ serverUrl: normalizeServerUrl(e.target.value) })}
                />
                <div className="text-[11px] text-emerald-200/50">
                  Приклад: <span className="font-mono">https://bkduna.com.ua</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">Token (термінал)</label>
                <div className="flex gap-2">
                  <input
                    className="w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition font-mono text-xs"
                    placeholder="TERM_..."
                    value={bookingCfg.token || ""}
                    onChange={(e) => patchBookingCfg({ token: e.target.value })}
                  />
                  <button className="h-10 px-4 rounded-xl border border-emerald-500/30 bg-emerald-900/40 text-emerald-100 text-sm hover:bg-emerald-800/60 hover:border-emerald-400/50 transition" onClick={regenToken} title="Згенерувати новий token">
                    ↻
                  </button>
                  <button
                    className="h-10 px-4 rounded-xl border border-emerald-500/30 bg-emerald-900/40 text-emerald-100 text-sm hover:bg-emerald-800/60 hover:border-emerald-400/50 transition"
                    onClick={() => copyToClipboard(bookingCfg.token || "")}
                    disabled={!tokenOk}
                    title="Скопіювати"
                  >
                    Copy
                  </button>
                </div>
                <div className="text-[11px] text-emerald-200/50">
                  Згенеруй token тут, потім встав його в налаштуваннях сервера.
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">Інтервал підтягування (poll)</label>
                <input
                  type="number"
                  min={5000}
                  step={1000}
                  className="w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                  value={Number(bookingCfg.pollMs || 15000)}
                  onChange={(e) => patchBookingCfg({ pollMs: Number(e.target.value) || 15000 })}
                />
                <div className="text-[11px] text-emerald-200/50">Рекомендовано 10–20 секунд.</div>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">Heartbeat (для сайту)</label>
                <input
                  type="number"
                  min={8000}
                  step={1000}
                  className="w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                  value={Number(bookingCfg.heartbeatMs || 20000)}
                  onChange={(e) => patchBookingCfg({ heartbeatMs: Number(e.target.value) || 20000 })}
                />
                <div className="text-[11px] text-emerald-200/50">
                  Сервер показує «заклад працює», поки отримує heartbeat від програми.
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-300/70 mb-1">Графік прийому (для повідомлення на сайті)</label>
                <div className="flex gap-2">
                  <input
                    className="w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition font-mono"
                    placeholder="12:00"
                    value={bookingCfg.offlineHours?.from || "12:00"}
                    onChange={(e) =>
                      patchBookingCfg({ offlineHours: { ...(bookingCfg.offlineHours || {}), from: e.target.value } })
                    }
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (!isValidTimeHHMM(v))
                        patchBookingCfg({ offlineHours: { ...(bookingCfg.offlineHours || {}), from: "12:00" } });
                    }}
                  />
                  <input
                    className="w-full h-10 px-3 rounded-xl border border-emerald-500/30 bg-emerald-950/50 text-emerald-50 placeholder-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition font-mono"
                    placeholder="23:00"
                    value={bookingCfg.offlineHours?.to || "23:00"}
                    onChange={(e) =>
                      patchBookingCfg({ offlineHours: { ...(bookingCfg.offlineHours || {}), to: e.target.value } })
                    }
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (!isValidTimeHHMM(v))
                        patchBookingCfg({ offlineHours: { ...(bookingCfg.offlineHours || {}), to: "23:00" } });
                    }}
                  />
                </div>
                <div className="text-[11px] text-emerald-200/50">
                  Коли програма офлайн — сайт показує повідомлення «Заклад не працює, приймаємо бронювання з … до …».
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs text-emerald-200/60">Статус налаштувань</div>
                <div
                  className={[
                    "p-3 rounded-xl ring-1 text-sm",
                    serverUrlOk && tokenOk
                      ? "bg-emerald-50 ring-emerald-200 text-emerald-700"
                      : "bg-amber-50 ring-amber-200 text-amber-700",
                  ].join(" ")}
                >
                  {serverUrlOk && tokenOk ? (
                    <div>
                      Готово ✅ <div className="text-xs mt-1 opacity-80">Програма буде підтягувати онлайн-бронювання.</div>
                    </div>
                  ) : (
                    <div>
                      Потрібно заповнити{" "}
                      {!serverUrlOk ? <b>Server URL</b> : null}
                      {!serverUrlOk && !tokenOk ? " та " : null}
                      {!tokenOk ? <b>Token</b> : null}.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* =================== CHECKBOX ПРРО =================== */}
        {tab === "checkbox" && (
          <section className="space-y-4">
            <CheckboxTab
              settings={checkboxSettings}
              onChange={(next) => {
                if (typeof setCheckboxSettings === "function") setCheckboxSettings(next);
              }}
            />
          </section>
        )}
      </div>
    </ModalShell>
  );
}
