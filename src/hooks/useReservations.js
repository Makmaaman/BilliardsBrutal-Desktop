// src/hooks/useReservations.js
import { useCallback, useEffect, useMemo, useState } from "react";
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
    return raw ? JSON.parse(raw) : [];
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

export function useReservations() {
  const [list, setList] = useState(() => loadFromLS());

  useEffect(() => {
    saveToLS(list);
  }, [list]);

  const create = useCallback((payload) => {
    const now = Date.now();
    const id = makeId();
    const code = new Date(payload.startAt).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" }) +
      "-" + String((payload.tableId ?? 0) + 1).padStart(2, "0") + "-" + id.slice(-4);
    const record = {
      id,
      code,
      status: RES_STATUSES.BOOKED,
      note: "",
      createdAt: now,
      ...payload,
    };
    setList((prev) => [record, ...prev]);
    return record;
  }, []);

  const update = useCallback((id, patch) => {
    setList((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const cancel = useCallback((id, reason = "") => {
    setList((prev) => prev.map((r) => (r.id === id ? { ...r, status: RES_STATUSES.CANCELLED, cancelReason: reason } : r)));
  }, []);

  const remove = useCallback((id) => {
    setList((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const byDateRange = useCallback((fromTs, toTs) => {
    const f = fromTs ? new Date(fromTs).getTime() : null;
    const t = toTs ? new Date(toTs).getTime() : null;
    return list.filter((r) => {
      const s = new Date(r.startAt).getTime();
      const e = new Date(r.endAt).getTime();
      if (f && e < f) return false;
      if (t && s > t) return false;
      return true;
    });
  }, [list]);

  const upcomingForTable = useCallback((tableId, withinMinutes = 1440) => {
    const now = Date.now();
    const horizon = now + withinMinutes * 60 * 1000;
    return list
      .filter((r) => r.tableId === tableId && r.status === RES_STATUSES.BOOKED)
      .filter((r) => new Date(r.startAt).getTime() >= now && new Date(r.startAt).getTime() <= horizon)
      .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  }, [list]);

  const value = useMemo(() => ({ list, setList, create, update, cancel, remove, byDateRange, upcomingForTable }), [list, create, update, cancel, remove, byDateRange, upcomingForTable]);
  return value;
}
