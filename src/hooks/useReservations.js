// src/hooks/useReservations.js
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { makeId } from "../utils/reservationUtils";

export const LS_RESERVATIONS = "LS_RESERVATIONS_V1";

export const RES_STATUSES = {
  BOOKED: "booked",
  IN_PROGRESS: "in-progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

function loadFromLS() {
  try {
    const raw = localStorage.getItem(LS_RESERVATIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("[Reservations] load error:", e);
    return [];
  }
}

function saveToLS(list) {
  try {
    localStorage.setItem(LS_RESERVATIONS, JSON.stringify(list));
  } catch (e) {
    console.error("[Reservations] save error:", e);
  }
}

// ---- Simple global store (singleton) ----
let store = loadFromLS();
const listeners = new Set();

function emitChanged() {
  // Notify hook subscribers
  for (const cb of Array.from(listeners)) {
    try { cb(); } catch {}
  }
  // Fire a global browser event (components can subscribe too)
  try {
    window.dispatchEvent(new CustomEvent("reservations:changed"));
  } catch {}
}

function setStore(updater) {
  const next = typeof updater === "function" ? updater(store) : updater;
  store = Array.isArray(next) ? next : [];
  saveToLS(store);
  emitChanged();
}

function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() { return store; }
function getServerSnapshot() { return []; }

// ---- Mutations / selectors on the singleton store ----
const create = (payload) => {
  const now = Date.now();
  const id = makeId();
  const code =
    new Date(payload.startAt).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" }) +
    "-" +
    String((payload.tableId ?? 0) + 1).padStart(2, "0") +
    "-" +
    id.slice(-4);

  const record = {
    id,
    code,
    status: RES_STATUSES.BOOKED,
    note: "",
    createdAt: now,
    updatedAt: now,
    customer1Name: payload?.customer1Name || payload?.name || "",
    customer2Name: payload?.customer2Name || "",
    phone: payload?.phone || "",
    startAt: payload.startAt,
    endAt: payload.endAt,
    tableId: payload.tableId ?? 0,
    partySize: payload.partySize ?? 2,
  };
  setStore((prev) => [record, ...prev]);
  return record;
};

const update = (id, patch) => {
  const now = Date.now();
  setStore((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: now } : r)));
};

const cancel = (id, reason = "") => {
  setStore((prev) => prev.map((r) => (r.id === id ? { ...r, status: RES_STATUSES.CANCELLED, cancelReason: reason } : r)));
};

const remove = (id) => {
  setStore((prev) => prev.filter((r) => r.id !== id));
};

const byDateRange = (fromTs, toTs) => {
  const f = fromTs ? new Date(fromTs).getTime() : null;
  const t = toTs ? new Date(toTs).getTime() : null;
  return store.filter((r) => {
    const s = new Date(r.startAt).getTime();
    const e = new Date(r.endAt).getTime();
    if (f && e < f) return false;
    if (t && s > t) return false;
    return true;
  });
};

const upcomingForTable = (tableId, withinMinutes = 1440) => {
  const now = Date.now();
  const horizon = now + withinMinutes * 60 * 1000;
  return store
    .filter((r) => r.tableId === tableId && r.status === RES_STATUSES.BOOKED)
    .filter((r) => new Date(r.startAt).getTime() >= now && new Date(r.startAt).getTime() <= horizon)
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
};

export function useReservations() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // setList for backward-compat (direct set)
  const setList = useCallback((next) => setStore(next), []);

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
    }),
    [list]
  );
}
