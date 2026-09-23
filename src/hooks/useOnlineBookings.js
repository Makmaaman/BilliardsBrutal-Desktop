// src/hooks/useOnlineBookings.js
// Хук для TopBar + OnlineBookingsModal
// Працює з VPS сервером (/api/online-bookings + /api/terminal/heartbeat).
// На сервері немає /consume — використовуємо: update status + /ack.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadBookingServerSettings } from "../utils/bookingServerSettings.js";
import {
  apiAckOnlineBooking,
  apiConsumeBooking, // лишаємо для сумісності (всередині = /ack)
  apiGetClients,
  apiGetTables,
  apiListBookings,
  apiServerHealth,
  apiTerminalHeartbeat,
  apiUpdateBookingStatus,
} from "../services/onlineBookingApi.js";

const LS_SEEN_KEY = "billiards_brutal_online_bookings_seen_v1";

function safeJsonParse(s, fallback = null) {
  try {
    if (!s) return fallback;
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function readSeen() {
  return safeJsonParse(localStorage.getItem(LS_SEEN_KEY), {});
}
function writeSeen(obj) {
  localStorage.setItem(LS_SEEN_KEY, JSON.stringify(obj || {}));
}

/**
 * Нормалізація бронювання з сервера в форму для UI
 */
function normalizeBooking(b) {
  const players = Array.isArray(b?.players) ? b.players : [];
  const p1 = players[0] || {};
  const p2 = players[1] || {};

  const customerName = b?.customerName || b?.clientName || b?.p1Name || p1?.name || "";
  const customerPhone = b?.customerPhone || b?.clientPhone || b?.p1Phone || p1?.phone || "";

  const opponentName = b?.opponentName || b?.p2Name || p2?.name || "";
  const opponentPhone = b?.opponentPhone || b?.p2Phone || p2?.phone || "";

  const durationMin = Number(b?.durationMin ?? b?.duration ?? 120) || 120;

  let startAt = Number(b?.startAt || 0);
  if (!Number.isFinite(startAt) || startAt <= 0) {
    const date = String(b?.date || "").trim(); // YYYY-MM-DD
    const time = String(b?.time || "").trim(); // HH:mm
    if (date && time) {
      const dt = new Date(`${date}T${time}:00`);
      const ts = dt.getTime();
      if (Number.isFinite(ts)) startAt = ts;
    }
  }

  const endAt =
    Number.isFinite(startAt) && startAt > 0
      ? startAt + durationMin * 60 * 1000
      : 0;

  return {
    ...b,
    id: String(b?.id || ""),
    status: String(b?.status || "new"),
    ackAt: Number(b?.ackAt || 0) || 0,
    consumed: b?.consumed === true,

    customerName,
    customerPhone,
    opponentName,
    opponentPhone,

    players: players.length
      ? players
      : [
          { name: customerName, phone: customerPhone },
          ...(opponentName || opponentPhone ? [{ name: opponentName, phone: opponentPhone }] : []),
        ],

    durationMin,
    startAt,
    endAt,

    tableId: Number(b?.tableId || 0) || b?.tableId,
    tableName: b?.tableName || "",
    comment: b?.comment || "",
  };
}

/**
 * Для створення локального бронювання (Reservations)
 * OnlineBookingsModal.jsx імпортує це як named export
 */
export function mapOnlineBookingToReservationPayload(booking) {
  const b = normalizeBooking(booking);
  return {
    tableId: b.tableId,
    tableName: b.tableName,
    startAt: b.startAt || Date.now(),
    endAt: b.endAt || Date.now() + (b.durationMin || 120) * 60 * 1000,
    durationMin: b.durationMin || 120,

    customerName: b.customerName || "",
    customerPhone: b.customerPhone || "",
    opponentName: b.opponentName || "",
    opponentPhone: b.opponentPhone || "",

    players: b.players || [],
    comment: b.comment || "",

    source: "online",
    onlineBookingId: b.id,
    status: "BOOKED",
  };
}

export default function useOnlineBookings(options = {}) {
  const enabledByCaller = options?.enabled !== false;

  const [cfg, setCfg] = useState(() => loadBookingServerSettings());

  // ----- options (App.jsx може передавати таблиці/статуси) -----
  const optServerUrl = String(options?.baseUrl || options?.serverUrl || options?.url || "").trim();
  const optToken = String(options?.token || options?.terminalToken || "").trim();
  const optOfflineHours = options?.offlineHours || options?.openHours || null;
  const optBusyTableIds = options?.busyTableIds || null;
  const optTablesSnapshot = options?.tables || null;

  const [ok, setOk] = useState(null); // null | boolean
  const [error, setError] = useState("");
  const [health, setHealth] = useState(null);

  const [tables, setTables] = useState([]);
  const [clients, setClients] = useState([]);

  const [bookings, setBookings] = useState([]);
  const [serverTime, setServerTime] = useState(0);

  // ✅ для UI модалки
  const [loading, setLoading] = useState(false);
  const [seenTick, setSeenTick] = useState(0);

  const pollTimer = useRef(null);
  const hbTimer = useRef(null);

  // слухаємо зміни налаштувань (SettingsModal диспатчить подію)
  useEffect(() => {
    const onCfg = (e) => {
      const next = e?.detail ? e.detail : loadBookingServerSettings();
      setCfg(next);
    };
    window.addEventListener("booking-server-settings-changed", onCfg);
    return () => window.removeEventListener("booking-server-settings-changed", onCfg);
  }, []);

  const serverUrl = useMemo(
    () => (optServerUrl || String(cfg?.serverUrl || "").trim()).replace(/\/+$/, ""),
    [cfg, optServerUrl]
  );
  const token = useMemo(
    () => (optToken || String(cfg?.token || cfg?.terminalToken || "").trim()),
    [cfg, optToken]
  );

  const isEnabled = enabledByCaller && cfg?.enabled !== false;
  const configured = !!(isEnabled && serverUrl && token);

  const pollMs = useMemo(() => Number(cfg?.pollMs || 15000) || 15000, [cfg]);
  const heartbeatMs = useMemo(() => Number(cfg?.heartbeatMs || 20000) || 20000, [cfg]);

  const offlineHours = useMemo(
    () => optOfflineHours || cfg?.offlineHours || { from: "12:00", to: "23:00" },
    [cfg, optOfflineHours]
  );

  const hbBusyTableIds = useMemo(() => {
    if (!Array.isArray(optBusyTableIds)) return null;
    return optBusyTableIds
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);
  }, [optBusyTableIds]);

  const hbTablesSnapshot = useMemo(() => {
    if (!Array.isArray(optTablesSnapshot)) return null;
    return optTablesSnapshot
      .map((t) => ({ id: Number(t?.id), name: String(t?.name || "").trim() }))
      .filter((t) => Number.isFinite(t.id) && t.id > 0)
      .sort((a, b) => a.id - b.id);
  }, [optTablesSnapshot]);

  const normalizedBookings = useMemo(
    () => (Array.isArray(bookings) ? bookings.map(normalizeBooking) : []),
    [bookings]
  );

  // ✅ New = ті, що ще не "seen" (кнопка "Позначити переглянутими")
  const newCount = useMemo(() => {
    const seen = readSeen();
    let n = 0;
    for (const b of normalizedBookings) {
      if (!b?.id) continue;
      if (!seen[b.id]) n += 1;
    }
    return n;
  }, [normalizedBookings, seenTick]);

  // -------- data refresh --------

  const refreshMeta = useCallback(async () => {
    if (!isEnabled || !serverUrl) return;
    try {
      const [t, c] = await Promise.allSettled([apiGetTables(serverUrl), apiGetClients(serverUrl)]);
      if (t.status === "fulfilled" && t.value?.ok && Array.isArray(t.value.tables)) {
        setTables(t.value.tables);
      }
      if (c.status === "fulfilled" && c.value?.ok && Array.isArray(c.value.clients)) {
        setClients(c.value.clients);
      }
    } catch {
      // not critical
    }
  }, [isEnabled, serverUrl]);

  const refreshHealth = useCallback(async () => {
    if (!isEnabled || !serverUrl) return;
    try {
      const h = await apiServerHealth(serverUrl);
      setHealth(h);
    } catch {
      // not critical
    }
  }, [isEnabled, serverUrl]);

  const refreshBookings = useCallback(
    async ({ silent = true } = {}) => {
      if (!isEnabled || !serverUrl) {
        setOk(null);
        setError("");
        setBookings([]);
        return;
      }
      if (!token) {
        setOk(false);
        setError("Token не задано");
        setBookings([]);
        return;
      }

      if (!silent) setLoading(true);

      try {
        const res = await apiListBookings(serverUrl, token, { unacked: true });
        if (res?.ok) {
          setBookings(Array.isArray(res.bookings) ? res.bookings : []);
          setServerTime(Number(res.serverTime || Date.now()) || Date.now());
          setOk(true);
          setError("");
        } else {
          setOk(false);
          setError(res?.error ? String(res.error) : "Невідома помилка");
        }
      } catch (e) {
        setOk(false);
        setError(String(e?.message || "Немає звʼязку"));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [isEnabled, serverUrl, token]
  );

  const sendHeartbeat = useCallback(async () => {
    if (!configured) return;
    try {
      const payload = { offlineHours };
      // важливо: якщо масив порожній — все одно відправляємо, щоб "очистити"
      if (hbBusyTableIds !== null) payload.busyTableIds = hbBusyTableIds;
      if (hbTablesSnapshot !== null) payload.tables = hbTablesSnapshot;
      await apiTerminalHeartbeat(serverUrl, token, payload);
    } catch (e) {
      if (!error) setError(String(e?.message || "Heartbeat помилка"));
    }
  }, [configured, serverUrl, token, offlineHours, hbBusyTableIds, hbTablesSnapshot, error]);

  // стартові підвантаження
  useEffect(() => {
    setCfg(loadBookingServerSettings());
  }, []);

  useEffect(() => {
    if (!isEnabled) return;
    refreshMeta();
    refreshHealth();
  }, [isEnabled, refreshMeta, refreshHealth]);

  // polling bookings
  useEffect(() => {
    if (!isEnabled) return;

    let stop = false;
    const tick = async () => {
      if (stop) return;
      await refreshBookings({ silent: true });
    };

    tick();

    clearInterval(pollTimer.current);
    pollTimer.current = setInterval(tick, Math.max(5000, pollMs || 15000));

    return () => {
      stop = true;
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    };
  }, [isEnabled, pollMs, refreshBookings]);

  // heartbeat loop
  useEffect(() => {
    if (!isEnabled) return;

    let stop = false;
    const tick = async () => {
      if (stop) return;
      await sendHeartbeat();
    };

    tick();

    clearInterval(hbTimer.current);
    hbTimer.current = setInterval(tick, Math.max(8000, heartbeatMs || 20000));

    return () => {
      stop = true;
      clearInterval(hbTimer.current);
      hbTimer.current = null;
    };
  }, [isEnabled, heartbeatMs, sendHeartbeat]);

  // -------- Actions --------

  const ackBooking = useCallback(
    async (id) => {
      if (!configured) throw new Error("Not configured");
      const res = await apiAckOnlineBooking(serverUrl, token, id);
      setBookings((prev) => (prev || []).filter((b) => String(b?.id) !== String(id)));
      return res;
    },
    [configured, serverUrl, token]
  );

  const updateStatus = useCallback(
    async (id, status, note) => {
      if (!configured) throw new Error("Not configured");
      const res = await apiUpdateBookingStatus(serverUrl, token, id, status, note);
      setBookings((prev) =>
        (prev || []).map((b) => (String(b?.id) === String(id) ? { ...b, status } : b))
      );
      return res;
    },
    [configured, serverUrl, token]
  );

  const acceptBooking = useCallback(
    async (id, note) => {
      await updateStatus(id, "accepted", note);
      return ackBooking(id);
    },
    [updateStatus, ackBooking]
  );

  const declineBooking = useCallback(
    async (id, note) => {
      await updateStatus(id, "declined", note);
      return ackBooking(id);
    },
    [updateStatus, ackBooking]
  );

  // Сумісність: consumeBooking (старий код)
  const consumeBooking = useCallback(
    async (id) => {
      if (!configured) throw new Error("Not configured");
      const res = await apiConsumeBooking(serverUrl, token, id); // всередині = /ack
      setBookings((prev) => (prev || []).filter((b) => String(b?.id) !== String(id)));
      return res;
    },
    [configured, serverUrl, token]
  );

  // ✅ Сумісність: consume(id, {decision, note}) — саме це викликає OnlineBookingsModal
  const consume = useCallback(
    async (id, opt = {}) => {
      const decision = String(opt?.decision || "").toLowerCase();
      const note = String(opt?.note || "").trim();

      if (decision === "accepted" || decision === "accept") {
        return acceptBooking(id, note);
      }
      if (decision === "rejected" || decision === "reject" || decision === "declined" || decision === "decline") {
        return declineBooking(id, note);
      }

      // fallback = просто ack
      return ackBooking(id);
    },
    [acceptBooking, declineBooking, ackBooking]
  );

  const refreshNow = useCallback(async () => {
    await Promise.allSettled([refreshMeta(), refreshHealth(), refreshBookings({ silent: true })]);
  }, [refreshMeta, refreshHealth, refreshBookings]);

  // ✅ Сумісність: refresh({silent:false}) — саме так викликає модалка
  const refresh = useCallback(
    async ({ silent = true } = {}) => {
      await Promise.allSettled([refreshMeta(), refreshHealth()]);
      await refreshBookings({ silent });
    },
    [refreshMeta, refreshHealth, refreshBookings]
  );

  // ✅ “Позначити переглянутими” (очищає newCount, але не прибирає броні зі списку)
  const markAllSeen = useCallback(() => {
    const seen = readSeen();
    let changed = false;
    for (const b of normalizedBookings) {
      if (b?.id && !seen[b.id]) {
        seen[b.id] = Date.now();
        changed = true;
      }
    }
    if (changed) {
      writeSeen(seen);
      setSeenTick((x) => x + 1);
    }
  }, [normalizedBookings]);

  return {
    // config
    enabled: isEnabled,
    configured,
    serverUrl: serverUrl || "",
    token: token || "",

    // status
    ok,
    error,
    health,
    serverTime,
    loading,

    // data
    tables,
    clients,
    bookings: normalizedBookings,
    newCount,
    pendingCount: newCount, // старі місця можуть читати pendingCount
    totalCount: normalizedBookings.length,

    // actions
    refresh,      // для модалки
    refreshNow,   // для коду, де треба “без параметрів”
    markAllSeen,  // для модалки
    consume,      // для модалки
    ackBooking,
    updateStatus,
    acceptBooking,
    declineBooking,
    consumeBooking,
  };
}
