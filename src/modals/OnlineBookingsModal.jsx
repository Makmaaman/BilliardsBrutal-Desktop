// src/modals/OnlineBookingsModal.jsx
import React, { useMemo, useRef, useState } from "react";
import ModalShell from "../components/ModalShell";
import useOnlineBookings, {
  mapOnlineBookingToReservationPayload,
} from "../hooks/useOnlineBookings";
import { api } from "../lib/api";
import { useReservations, RES_STATUSES } from "../hooks/useReservations";

/**
 * OnlineBookingsModal
 *
 * Прийняти:
 *  1) знайти/створити клієнтів -> отримати customer1Id/customer2Id
 *  2) створити локальну бронь (через onAccepted або useReservations.create)
 *  3) тільки після успіху -> consume(decision="accepted") щоб прибрати з онлайн-черги
 *
 * Props:
 * - onClose(): void
 * - onAccepted?(reservationPayload, onlineBooking): void|Promise<void>
 * - onRejected?(onlineBooking, reason): void|Promise<void>
 */
export default function OnlineBookingsModal({
  onClose = () => {},
  onAccepted,
  onRejected,
}) {
  const ob = useOnlineBookings({ enabled: true });
  const { list: localReservations, create } = useReservations();

  const {
    serverUrl,
    bookings,
    tables,
    loading,
    ok,
    error,
    newCount,
    refresh,
    consume,
    markAllSeen,
  } = ob;

  const [rejectNotes, setRejectNotes] = useState({});
  const [busyId, setBusyId] = useState(null);

  // ---- customers cache (щоб не тягати список по 10 разів) ----
  const customersRef = useRef(null);
  const byPhoneRef = useRef(new Map());
  const byNameRef = useRef(new Map());

  function normPhone(p) {
    return String(p || "").replace(/\D/g, "");
  }
  function normName(n) {
    return String(n || "").trim().toLowerCase();
  }

  async function loadCustomersOnce() {
    if (Array.isArray(customersRef.current)) return customersRef.current;

    const customers = (await api("customers:list")) || [];
    customersRef.current = Array.isArray(customers) ? customers : [];

    byPhoneRef.current = new Map();
    byNameRef.current = new Map();

    for (const c of customersRef.current) {
      if (!c) continue;
      const p = normPhone(c.phone);
      const n = normName(c.name);
      if (p) byPhoneRef.current.set(p, c);
      if (n) byNameRef.current.set(n, c);
    }

    return customersRef.current;
  }

  async function ensureCustomerId(name, phone) {
    const n = String(name || "").trim();
    const p = String(phone || "").trim();
    const pKey = normPhone(p);
    const nKey = normName(n);

    await loadCustomersOnce();

    if (pKey && byPhoneRef.current.has(pKey)) {
      return byPhoneRef.current.get(pKey).id;
    }
    if (!pKey && nKey && byNameRef.current.has(nKey)) {
      return byNameRef.current.get(nKey).id;
    }

    // створюємо
    if (!n && !p) return "";

    const created = await api("customers:create", {
      name: n || "Без імені",
      phone: p || "",
    });

    if (created && created.id) {
      // оновлюємо кеш
      const obj = created;
      const pp = normPhone(obj.phone);
      const nn = normName(obj.name);
      if (Array.isArray(customersRef.current)) customersRef.current.push(obj);
      if (pp) byPhoneRef.current.set(pp, obj);
      if (nn) byNameRef.current.set(nn, obj);
      return obj.id;
    }

    return "";
  }

  // ---- tables map ----
  const tableNameById = useMemo(() => {
    const m = {};
    (tables || []).forEach((t) => {
      if (!t) return;
      const id = t.id ?? t.tableId ?? t._id;
      if (id == null) return;
      m[String(id)] = t.name || t.title || `Стіл ${String(id)}`;
    });
    return m;
  }, [tables]);

  function fmtTime(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  }

  function fmtDate(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
  }

  function getTableLabel(b) {
    const tid = b?.tableId ?? b?.table ?? b?.table_id;
    const key = tid == null ? "" : String(tid);
    return tableNameById[key] || (key ? `Стіл ${key}` : "Стіл не вказано");
  }

  function pickP1(b) {
    const players = Array.isArray(b?.players) ? b.players : [];
    const p1 = players[0] || {};
    const name =
      String(b?.customerName || b?.clientName || p1?.name || "").trim();
    const phone =
      String(b?.customerPhone || b?.clientPhone || p1?.phone || "").trim();
    return { name, phone };
  }

  function pickP2(b) {
    const players = Array.isArray(b?.players) ? b.players : [];
    const p2 = players[1] || {};
    const name =
      String(b?.opponentName || b?.p2Name || p2?.name || "").trim();
    const phone =
      String(b?.opponentPhone || b?.p2Phone || p2?.phone || "").trim();
    return { name, phone };
  }

  function toIso(value, fallbackTs = Date.now()) {
    const d = new Date(value || fallbackTs);
    if (Number.isNaN(d.getTime())) return new Date(fallbackTs).toISOString();
    return d.toISOString();
  }

  async function handleAccept(b) {
    if (!b?.id) return;
    const onlineId = String(b.id);
    setBusyId(onlineId);

    try {
      // захист від дублювання: якщо вже є локальна бронь з цим onlineId — тільки "прибери з черги"
      const alreadyLocal = (localReservations || []).some((r) => {
        const oid = String(r?.onlineId || r?.onlineBookingId || "");
        return oid && oid === onlineId;
      });

      if (alreadyLocal) {
        const r = await consume(onlineId, { decision: "accepted", note: "" });
        if (!r?.ok) {
          alert("Локально вже є, але не вдалося прибрати з онлайн-черги: " + (r?.error || "невідомо"));
        }
        return;
      }

      // 1) payload
      const payload = mapOnlineBookingToReservationPayload(b);

      // 2) знайти/створити клієнтів та поставити customer1Id/customer2Id
      const p1 = pickP1(b);
      const p2 = pickP2(b);

      const customer1Id = await ensureCustomerId(p1.name, p1.phone);
      const customer2Id =
        (p2.name || p2.phone) ? await ensureCustomerId(p2.name, p2.phone) : "";

      payload.customer1Id = customer1Id || null;
      payload.customer2Id = customer2Id || null;

      // імена збережемо теж (в сайдбарі пошук по customer1Name працює)
      payload.customer1Name = p1.name || null;
      payload.customer2Name = p2.name || null;

      // notes/status/source/onlineId у форматі локальної системи
      payload.notes = (payload.notes || payload.comment || "").trim();
      payload.status = RES_STATUSES.BOOKED; // "booked"
      payload.source = "online";
      payload.onlineId = onlineId;          // ✅ саме це читає useReservations / syncOnline
      payload.onlineBookingId = onlineId;   // лишаємо для сумісності

      // час краще зберігати ISO як в ReservationForm
      payload.startAt = toIso(payload.startAt ?? b.startAt);
      payload.endAt = toIso(payload.endAt ?? b.endAt, new Date(payload.startAt).getTime() + 60 * 60000);

      // 3) створити локальну бронь
      if (typeof onAccepted === "function") {
        await Promise.resolve(onAccepted(payload, b));
      } else if (typeof create === "function") {
        create(payload);
      } else {
        alert("Прийнято, але не знайдено спосіб створити локальне бронювання (onAccepted/create).");
        return;
      }

      // 4) прибрати з онлайн-черги
      const r = await consume(onlineId, { decision: "accepted", note: "" });
      if (!r?.ok) {
        alert("Локально створено, але не вдалося прибрати з онлайн-черги: " + (r?.error || "невідомо"));
      }
    } catch (e) {
      alert("Не вдалося прийняти онлайн-бронь: " + String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(b) {
    if (!b?.id) return;
    const id = String(b.id);
    const note = String(rejectNotes[id] || "").trim();

    setBusyId(id);
    try {
      const r = await consume(id, { decision: "rejected", note });
      if (!r?.ok) {
        alert("Не вдалося відхилити: " + (r?.error || "невідомо"));
        return;
      }
      if (typeof onRejected === "function") {
        await Promise.resolve(onRejected(b, note));
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ModalShell
      title="Онлайн бронювання"
      onClose={onClose}
      containerStyle={{ width: "1200px", maxWidth: "92vw", height: "820px", maxHeight: "88vh" }}
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <div className="text-xs text-emerald-200/80">
            {serverUrl ? (
              <span className="font-mono">{serverUrl}</span>
            ) : (
              <span className="text-rose-300">Сервер не налаштовано</span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              className="h-9 px-3 rounded-lg border border-emerald-500/40 text-emerald-100 hover:bg-emerald-800/40 disabled:opacity-50"
              onClick={() => refresh({ silent: false })}
              disabled={loading || !serverUrl}
            >
              {loading ? "Оновлюю…" : "Оновити"}
            </button>
            <button
              className="h-9 px-3 rounded-lg border border-emerald-500/40 text-emerald-100 hover:bg-emerald-800/40 disabled:opacity-50"
              onClick={markAllSeen}
              disabled={!bookings?.length}
              title="Позначити всі як переглянуті"
            >
              Позначити переглянутими
            </button>
            <button
              className="h-9 px-4 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
              onClick={onClose}
            >
              Закрити
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Status */}
        <div
          className={[
            "p-3 rounded-xl ring-1",
            ok === false
              ? "bg-rose-50 ring-rose-200 text-rose-700"
              : ok === true
              ? "bg-emerald-50 ring-emerald-200 text-emerald-700"
              : "bg-slate-50 ring-slate-200 text-slate-700",
          ].join(" ")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">
              {ok === false
                ? "Немає звʼязку з сервером онлайн-бронювань"
                : ok === true
                ? "Підключено до сервера онлайн-бронювань"
                : "Перевіряю сервер…"}
            </div>
            <div className="text-xs">
              Нові: <b>{newCount || 0}</b> • Всього: <b>{bookings?.length || 0}</b>
            </div>
          </div>
          {error ? (
            <div className="text-xs mt-1 opacity-80">{String(error)}</div>
          ) : null}
        </div>

        {/* List */}
        <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden pr-1 space-y-2">
          {!bookings?.length ? (
            <div className="p-4 rounded-xl border bg-white text-sm text-slate-600">
              Немає нових онлайн-бронювань.
            </div>
          ) : (
            (bookings || []).map((b) => {
              const id = String(b?.id ?? "");
              const isBusy = busyId === id;

              const startAt = b?.startAt;
              const endAt = b?.endAt;

              const when = startAt
                ? `${fmtDate(startAt)} ${fmtTime(startAt)}–${fmtTime(endAt)}`
                : "Час не вказано";

              const table = getTableLabel(b);
              const p1 = pickP1(b);
              const p2 = pickP2(b);

              const p1Line =
                [p1.name, p1.phone].filter(Boolean).join(" • ") || "Клієнт не вказаний";
              const p2Line =
                [p2.name, p2.phone].filter(Boolean).join(" • ");

              return (
                <div key={id || Math.random()} className="p-3 rounded-xl border bg-white">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {table} • {when}
                      </div>
                      <div className="text-xs text-slate-700 mt-1 truncate">
                        {p1Line}
                      </div>
                      {p2Line ? (
                        <div className="text-xs text-slate-600 mt-1 truncate">
                          {p2Line}
                        </div>
                      ) : null}

                      {b?.comment ? (
                        <div className="text-xs text-slate-500 mt-1">
                          Коментар: {String(b.comment)}
                        </div>
                      ) : null}

                      {b?.code ? (
                        <div className="text-[11px] text-slate-400 mt-1 font-mono">
                          code: {String(b.code)}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex gap-2 shrink-0">
                      <button
                        className="h-9 px-3 rounded-lg border bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
                        onClick={() => handleAccept(b)}
                        disabled={isBusy || !serverUrl}
                        title="Погодити бронювання"
                      >
                        {isBusy ? "..." : "Прийняти"}
                      </button>
                      <button
                        className="h-9 px-3 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        onClick={() => handleReject(b)}
                        disabled={isBusy || !serverUrl}
                        title="Відхилити бронювання"
                      >
                        {isBusy ? "..." : "Відхилити"}
                      </button>
                    </div>
                  </div>

                  {/* Reject note */}
                  <div className="mt-2">
                    <label className="block text-[11px] text-slate-500">
                      Причина (необовʼязково)
                    </label>
                    <input
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm"
                      placeholder="Напр.: заклад закритий / немає вільних столів"
                      value={rejectNotes[id] || ""}
                      onChange={(e) =>
                        setRejectNotes((m) => ({ ...(m || {}), [id]: e.target.value }))
                      }
                      disabled={isBusy}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Hint */}
        <div className="text-xs text-emerald-200/70">
          Порада: якщо сервер не налаштовано — відкрий{" "}
          <b>Налаштування → Загальні</b> і вкажи URL + Token.
        </div>
      </div>
    </ModalShell>
  );
}
