// src/hooks/useReservations.js
// Відновлено за v3.9.2: адреса booking-сервера береться з налаштувань
// (не жорстко localhost), ack онлайн-бронювань з терміналь-токеном,
// періодична синхронізація локальних клієнтів на сервер.
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { api } from "../lib/api";
import { makeId } from "../utils/reservationUtils";
import { loadBookingServerSettings } from "../utils/bookingServerSettings";

// ключ у localStorage
export const LS_RESERVATIONS = "LS_RESERVATIONS_V2";

export const RES_STATUSES = {
  BOOKED: "booked",
  IN_PROGRESS: "in-progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

/* ------------------------------------------------------------------ */
/* Booking-сервер (VPS) — з налаштувань                                */
/* ------------------------------------------------------------------ */

function trimSlash(s) {
  return String(s || "").trim().replace(/\/+$/, "");
}

/** { baseUrl, token } або null, якщо онлайн-бронювання вимкнено / не налаштовано */
function getBookingServer() {
  const cfg = loadBookingServerSettings();
  if (!cfg?.enabled) return null;
  const baseUrl = trimSlash(cfg.serverUrl);
  if (!baseUrl) return null;
  const token = String(cfg.token || cfg.terminalToken || "").trim();
  return { baseUrl, token };
}

/* ------------------------------------------------------------------ */
/* LocalStorage store                                                  */
/* ------------------------------------------------------------------ */

function loadFromLS() {
  try {
    const raw = localStorage.getItem(LS_RESERVATIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Reservations: failed to read from LS", e);
    return [];
  }
}

function saveToLS(list) {
  try {
    localStorage.setItem(LS_RESERVATIONS, JSON.stringify(list || []));
  } catch (e) {
    console.error("Reservations: failed to write to LS", e);
  }
}

let store = loadFromLS();
const listeners = new Set();

function emit() {
  saveToLS(store);
  for (const l of listeners) l();
  try {
    window.dispatchEvent(new Event("reservations:changed"));
  } catch {}
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return store;
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function buildIsoFromLocalDateTime(dateStr, timeStr) {
  try {
    const [y, m, d] = String(dateStr).split("-").map((x) => Number(x) || 0);
    const [hh, mm] = String(timeStr).split(":").map((x) => Number(x) || 0);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
  } catch {
    return null;
  }
}

/** Повідомити сервер, що онлайн-бронь забрано в термінал */
async function ackOnlineBooking(id, server) {
  if (!id || !server?.baseUrl || !server?.token) return;
  try {
    await fetch(`${server.baseUrl}/api/online-bookings/ack`, {
      method: "POST",
      headers: { "X-Terminal-Token": server.token, "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  } catch (e) {
    console.warn("Не вдалося відмітити онлайн-бронь як оброблену:", e);
  }
}

// щоб клієнтів на онлайн-сервер (/api/clients/register) залити лише один раз
let customersSyncedToOnline = false;
// щоб syncOnline не запускався одночасно кілька разів
let syncInProgress = false;
// синхронізація клієнтів на термінальний API
let clientsSyncInProgress = false;
let lastClientsSignature = "";
let lastClientsSyncAt = 0;

function clientsSignature(list) {
  const norm = (list || [])
    .map((c) => ({
      id: String(c?.id || ""),
      name: String(c?.name || "").trim(),
      phone: String(c?.phone || "").trim(),
      updatedAt: Number(c?.updatedAt || 0) || 0,
      createdAt: Number(c?.createdAt || 0) || 0,
    }))
    .sort((a, b) => {
      if (a.id !== b.id) return a.id < b.id ? -1 : 1;
      if (a.phone !== b.phone) return a.phone < b.phone ? -1 : 1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  return JSON.stringify(norm);
}

/**
 * Заливає повний список локальних клієнтів на booking-сервер
 * (PUT /api/terminal/clients), щоб онлайн-форма бачила їх у пошуку.
 * Пропускає, якщо список не змінився за останні 5 хв.
 */
async function syncCustomersToServer() {
  if (typeof fetch !== "function") return;
  const cfg = loadBookingServerSettings();
  if (!cfg?.enabled || !cfg?.serverUrl || !cfg?.token) return;
  if (clientsSyncInProgress) return;
  clientsSyncInProgress = true;
  try {
    const customers = (await api("customers:list")) || [];
    if (!Array.isArray(customers) || !customers.length) return;
    const clients = customers
      .map((c) => ({
        id: c?.id || "",
        name: c?.name || "",
        phone: c?.phone || "",
        email: c?.email || "",
        city: c?.city || "",
        photoDataUrl: c?.photoDataUrl || c?.photo || "",
      }))
      .filter((c) => c.name || c.phone);
    if (!clients.length) return;

    const sig = clientsSignature(clients);
    const now = Date.now();
    if (sig === lastClientsSignature && now - lastClientsSyncAt < 5 * 60 * 1000) return;

    const res = await fetch(`${cfg.serverUrl}/api/terminal/clients`, {
      method: "PUT",
      headers: { "X-Terminal-Token": cfg.token, "Content-Type": "application/json" },
      body: JSON.stringify({ clients }),
    });
    if (res.ok) {
      lastClientsSignature = sig;
      lastClientsSyncAt = now;
    }
  } catch (e) {
    console.warn("Не вдалося синхронізувати клієнтів на сервер:", e);
  } finally {
    clientsSyncInProgress = false;
  }
}

/* ------------------------------------------------------------------ */
/* Основний хук                                                       */
/* ------------------------------------------------------------------ */

export function useReservations() {
  const list = useSyncExternalStore(subscribe, getSnapshot);

  const setList = useCallback((updater) => {
    store = typeof updater === "function" ? updater(store) ?? [] : updater ?? [];
    emit();
  }, []);

  const create = useCallback(
    (payload) => {
      const nowIso = new Date().toISOString();
      const id = payload.id || makeId("res");
      const item = {
        id,
        code: payload.code || null,
        status: payload.status || RES_STATUSES.BOOKED,
        createdAt: payload.createdAt || nowIso,
        updatedAt: payload.updatedAt || nowIso,
        tableId: Number(payload.tableId ?? 0),
        startAt: payload.startAt,
        endAt: payload.endAt,
        notes: payload.notes || "",
        customer1Id: payload.customer1Id || "",
        customer2Id: payload.customer2Id || "",
        customer1Name: payload.customer1Name || null,
        customer2Name: payload.customer2Name || null,
        source: payload.source || "local",
        onlineId: payload.onlineId || null,
      };
      setList((prev) => [...(prev || []), item]);
      return item;
    },
    [setList]
  );

  const update = useCallback(
    (id, patch) => {
      const nowIso = new Date().toISOString();
      setList((prev) =>
        (prev || []).map((r) => (r.id === id ? { ...r, ...patch, updatedAt: nowIso } : r))
      );
    },
    [setList]
  );

  const cancel = useCallback(
    (id) => {
      update(id, { status: RES_STATUSES.CANCELLED });
    },
    [update]
  );

  const remove = useCallback(
    (id) => {
      setList((prev) => (prev || []).filter((r) => r.id !== id));
    },
    [setList]
  );

  const byDateRange = useCallback(
    (fromIso, toIso) => {
      const from = fromIso ? new Date(fromIso).getTime() : 0;
      const to = toIso ? new Date(toIso).getTime() : Number.POSITIVE_INFINITY;
      return (list || []).filter((r) => {
        if (!r) return false;
        const s = new Date(r.startAt).getTime();
        const e = new Date(r.endAt).getTime();
        if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
        return s < to && e > from;
      });
    },
    [list]
  );

  const upcomingForTable = useCallback(
    (tableId, fromTs = Date.now(), toTs = Date.now() + 4 * 60 * 60 * 1000) => {
      const tid = Number(tableId ?? 0);
      return (list || [])
        .filter((r) => r && Number(r.tableId) === tid && r.status === RES_STATUSES.BOOKED)
        .map((r) => ({
          ...r,
          _start: new Date(r.startAt).getTime(),
          _end: new Date(r.endAt).getTime(),
        }))
        .filter((r) => r._start >= fromTs && r._start <= toTs)
        .sort((a, b) => a._start - b._start);
    },
    [list]
  );

  /* ------------------------------------------------------------------
   * Синхронізація клієнтів на booking-сервер: при старті, кожні 5 хв
   * і за подією customers:changed
   * -----------------------------------------------------------------*/
  useEffect(() => {
    let stopped = false;
    const run = async () => {
      if (!stopped) await syncCustomersToServer();
    };
    run();
    const timer = setInterval(run, 5 * 60 * 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onChanged = () => {
      syncCustomersToServer();
    };
    window.addEventListener("customers:changed", onChanged);
    return () => window.removeEventListener("customers:changed", onChanged);
  }, []);

  /* ------------------------------------------------------------------
   * РУЧНА синхронізація онлайн-бронь (викликається з модалки)
   * -----------------------------------------------------------------*/

  const syncOnline = useCallback(async () => {
    if (typeof fetch !== "function") return;
    const server = getBookingServer();
    if (!server?.baseUrl) return;

    // захист від паралельних запусків
    if (syncInProgress) return;
    syncInProgress = true;

    try {
      // 1) забираємо онлайн-бронювання з booking-server
      const res = await fetch(`${server.baseUrl}/api/online-bookings`);
      if (!res.ok) return;

      const data = await res.json();
      const rawList = data.bookings || data.items || data.rows || data.list || [];
      if (!Array.isArray(rawList) || rawList.length === 0) return;

      // 2) підтягнемо клієнтів із програми
      let customers = [];
      try {
        customers = (await api("customers:list")) || [];
      } catch (e) {
        console.warn("Не вдалося завантажити локальних клієнтів:", e);
      }

      // 2.1) один раз заливаємо всіх клієнтів на booking-server,
      // щоб онлайн-форма бачила старих гравців у пошуку
      if (!customersSyncedToOnline && customers.length) {
        customersSyncedToOnline = true;
        try {
          for (const c of customers) {
            if (!c) continue;
            const name = (c.name || "").trim();
            const phone = (c.phone || "").trim();
            if (!name && !phone) continue;
            fetch(`${server.baseUrl}/api/clients/register`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, phone }),
            }).catch(() => {});
          }
        } catch (e) {
          console.warn("Не вдалося синхронізувати клієнтів на онлайн-сервер:", e);
        }
      }

      const keyOf = (name, phone) => {
        const n = String(name || "").trim().toLowerCase();
        const p = String(phone || "").replace(/\D/g, "");
        return `${n}|${p}`;
      };

      const customerMap = new Map((customers || []).map((c) => [keyOf(c.name, c.phone), c]));

      async function ensureCustomer(name, phone) {
        const key = keyOf(name, phone);
        if (customerMap.has(key)) return customerMap.get(key).id;
        if (!name && !phone) return "";
        try {
          const created = await api("customers:create", { name: name || "Без імені", phone: phone || "" });
          if (created && created.id) {
            customerMap.set(key, created);
            return created.id;
          }
        } catch (e) {
          console.warn("Не вдалося створити клієнта з онлайн-бронювання:", e);
        }
        return "";
      }

      // 3) вже імпортовані онлайн-броні
      const current = getSnapshot() || [];
      const knownOnlineIds = new Set(
        current.filter((r) => r && r.onlineId).map((r) => String(r.onlineId))
      );

      const toAdd = [];
      for (const b of rawList) {
        if (!b) continue;
        const onlineId = String(b.id || b.onlineId || "");
        if (!onlineId) {
          await ackOnlineBooking(onlineId, server);
          continue;
        }
        if (knownOnlineIds.has(onlineId)) {
          await ackOnlineBooking(onlineId, server);
          continue;
        }

        // --- час ---
        let startAt = b.startAt || b.start || (b.date && b.time ? buildIsoFromLocalDateTime(b.date, b.time) : null);
        if (!startAt && b.when) startAt = new Date(b.when).toISOString();
        const durationMin =
          Number(b.durationMinutes || b.duration || 0) || Number(b.durationHours || 0) * 60 || 60;
        const endAt =
          b.endAt || b.end || (startAt ? new Date(new Date(startAt).getTime() + durationMin * 60000).toISOString() : null);
        if (!startAt || !endAt) {
          await ackOnlineBooking(onlineId, server);
          continue;
        }

        const tableId = Number(b.tableId ?? b.table ?? 0);

        // --- гравці (новий формат: player1 / player2) ---
        const p1 = b.player1 || b.player || {};
        const p2 = b.player2 || b.opponent || {};
        const name1 = p1.name || b.customer1Name || b.client1Name || b.name || b.customerName || "";
        const name2 = p2.name || b.customer2Name || b.client2Name || b.opponentName || "";
        const phone1 = p1.phone || b.customer1Phone || b.phone || b.phone1 || "";
        const phone2 = p2.phone || b.customer2Phone || b.phone2 || "";
        const notes = b.comment || b.notes || "";

        const customer1Id = await ensureCustomer(name1, phone1);
        const customer2Id = name2 || phone2 ? await ensureCustomer(name2, phone2) : "";

        toAdd.push({
          id: makeId("res"),
          code: b.code || null,
          status: RES_STATUSES.BOOKED,
          createdAt: b.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tableId,
          startAt,
          endAt,
          notes,
          customer1Id,
          customer2Id,
          customer1Name: name1 || null,
          customer2Name: name2 || null,
          source: "online",
          onlineId,
        });
        await ackOnlineBooking(onlineId, server);
      }

      if (toAdd.length) setList((prev) => [...(prev || []), ...toAdd]);
    } catch (e) {
      console.warn("Не вдалося синхронізувати онлайн-бронювання:", e);
    } finally {
      syncInProgress = false;
    }
  }, [setList]);

  return useMemo(
    () => ({
      list,
      setList,
      create,
      update,
      cancel,
      remove,
      byDateRange,
      upcomingForTable,
      syncOnline,
    }),
    [list, setList, create, update, cancel, remove, byDateRange, upcomingForTable, syncOnline]
  );
}
