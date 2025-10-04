// src/components/ReservationsTicker.jsx
import React from "react";
import { useReservations, RES_STATUSES } from "../hooks/useReservations";
import { useTicker } from "../hooks/useTicker";
import { fmtDT } from "../utils/reservationUtils";

const UI_RES_TICKER_COLLAPSED = "UI_RES_TICKER_COLLAPSED_V2";

export default function ReservationsTicker({ onOpenReservations, soonWithinMins = 30 }) {
  useTicker(true, 1_000);

  const [_, force] = React.useState(0);
  React.useEffect(() => {
    const fn = () => force((v) => v + 1);
    window.addEventListener("reservations:changed", fn);
    return () => window.removeEventListener("reservations:changed", fn);
  }, []);

  const { list = [] } = useReservations();
  const now = Date.now();

  const mmss = (ms) => {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };
  const clamp = (v, a = 0, b = 100) => Math.min(b, Math.max(a, v));
  const who = (r) => [r?.customer1Name, r?.customer2Name].filter(Boolean).join(" & ") || "Без імені";
  const tableName = (id) => `Стіл ${id ?? ""}`;

  const safe = Array.isArray(list) ? list : [];
  const endOfDay = new Date(); endOfDay.setHours(23,59,59,999);
  const soonHorizon = now + soonWithinMins * 60_000;

  const ongoing = React.useMemo(() => {
    return safe
      .filter((r) => r && r.status !== RES_STATUSES.CANCELLED)
      .filter((r) => {
        const s = new Date(r.startAt).getTime();
        const e = new Date(r.endAt).getTime();
        return r.status === RES_STATUSES.IN_PROGRESS || (Number.isFinite(s) && Number.isFinite(e) && s <= now && now < e);
      })
      .sort((a, b) => new Date(a.endAt) - new Date(b.endAt));
  }, [safe, now]);

  const upcoming = React.useMemo(() => {
    return safe
      .filter((r) => r && r.status === RES_STATUSES.BOOKED)
      .filter((r) => {
        const s = new Date(r.startAt).getTime();
        return Number.isFinite(s) && s > now && s <= soonHorizon;
      })
      .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  }, [safe, now, soonWithinMins]);

  const laterToday = React.useMemo(() => {
    return safe
      .filter((r) => r && r.status === RES_STATUSES.BOOKED)
      .filter((r) => {
        const s = new Date(r.startAt).getTime();
        return Number.isFinite(s) && s > soonHorizon && s <= endOfDay.getTime();
      })
      .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  }, [safe, now, soonWithinMins]);

  const any = ongoing.length + upcoming.length + laterToday.length > 0;

  const [collapsed, setCollapsed] = React.useState(() => localStorage.getItem(UI_RES_TICKER_COLLAPSED) === "1");
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const nv = !v;
      try { localStorage.setItem(UI_RES_TICKER_COLLAPSED, nv ? "1" : "0"); } catch {}
      return nv;
    });
  };

  if (!any && collapsed) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm shadow-md">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/70">
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-semibold text-slate-800">Бронювання</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">йде: {ongoing.length}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">скоро: {upcoming.length}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">сьогодні: {laterToday.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="h-8 px-3 rounded-md bg-slate-900 text-white text-xs hover:bg-slate-800"
            onClick={onOpenReservations}
          >
            Всі бронювання
          </button>
          <button
            className="h-8 w-8 rounded-md bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
            title={collapsed ? "Розгорнути" : "Згорнути"}
            onClick={toggleCollapsed}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M8 10l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                transform={collapsed ? "rotate(180 12 12)" : ""} />
            </svg>
          </button>
        </div>
      </div>

      {/* content */}
      {!collapsed && (
        <div className="p-4 space-y-4">
          {/* Ongoing */}
          <Block title={`Йдуть зараз`} color="emerald">
            {ongoing.length === 0 ? (
              <Empty text="Зараз активних бронювань немає." tone="emerald" />
            ) : (
              <div className="grid lg:grid-cols-2 gap-3">
                {ongoing.map((r, i) => {
                  const s = new Date(r.startAt).getTime();
                  const e = new Date(r.endAt).getTime();
                  const left = Math.max(0, e - now);
                  const dur = Math.max(1, e - s);
                  const pct = clamp(((now - s) / dur) * 100);
                  return (
                    <div
                      key={r.id}
                      className="group relative overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-sm animate-in fade-in"
                      style={{ transitionDelay: `${i * 25}ms` }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 truncate">
                            <Dot color="emerald" />
                            {who(r)}
                          </div>
                          <div className="text-xs text-slate-600">
                            {tableName(r.tableId)} • до {fmtDT(r.endAt)} • залишилось {mmss(left)}
                          </div>
                        </div>
                        <Code code={r?.code} />
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-emerald-200 overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-[width] duration-700" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Block>

          {/* Upcoming */}
          <Block title={`Скоро почнуться (≤ ${soonWithinMins} хв)`} color="sky">
            {upcoming.length === 0 ? (
              <Empty text="Найближчих бронювань немає." tone="sky" />
            ) : (
              <div className="grid lg:grid-cols-2 gap-3">
                {upcoming.map((r, i) => {
                  const start = new Date(r.startAt).getTime();
                  const eta = Math.max(0, start - now);
                  return (
                    <div
                      key={r.id}
                      className="group relative overflow-hidden rounded-xl border border-sky-200 bg-sky-50/60 p-3 shadow-sm animate-in fade-in"
                      style={{ transitionDelay: `${i * 25}ms` }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 truncate">
                            <Dot color="sky" />
                            {who(r)}
                          </div>
                          <div className="text-xs text-slate-600">
                            {tableName(r.tableId)} • старт о {fmtDT(r.startAt)} • через {mmss(eta)}
                          </div>
                        </div>
                        <Code code={r?.code} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Block>

          {/* Later today — показувати лише коли є */}
          {laterToday.length > 0 && (
            <Block title="Сьогодні" color="slate">
              <div className="grid lg:grid-cols-2 gap-3">
                {laterToday.map((r, i) => (
                  <div
                    key={r.id}
                    className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 p-3 shadow-sm animate-in fade-in"
                    style={{ transitionDelay: `${i * 25}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 truncate">
                          <Avatar names={[r.customer1Name, r.customer2Name]} />
                          {who(r)}
                        </div>
                        <div className="text-xs text-slate-600">
                          {String(new Date(r.startAt).toLocaleTimeString('uk-UA', {hour:"2-digit", minute:"2-digit"}))}
                          —
                          {String(new Date(r.endAt).toLocaleTimeString('uk-UA', {hour:"2-digit", minute:"2-digit"}))}
                          {" • "}{tableName(r.tableId)}
                        </div>
                      </div>
                      <button
                        className="h-8 px-3 rounded-md bg-emerald-600 text-white text-xs hover:bg-emerald-700"
                        onClick={onOpenReservations}
                      >
                        Відкрити
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Block>
          )}
        </div>
      )}
    </section>
  );
}

function Dot({ color = "emerald" }) {
  const cls =
    color === "sky"
      ? "text-sky-600"
      : color === "slate"
      ? "text-slate-500"
      : "text-emerald-600";
  return <span className={`inline-block text-[10px] leading-none animate-pulse ${cls}`}>●</span>;
}

function Code({ code }) {
  if (!code) return null;
  const [label, full] = (() => {
    try {
      const [date, table] = String(code).split("-");
      return [`${date}-${table}`, code];
    } catch {
      return [code, code];
    }
  })();
  return (
    <span
      className="ml-2 shrink-0 inline-flex items-center px-2 h-6 rounded-lg bg-white text-slate-700 ring-1 ring-slate-200 text-[11px] font-mono tracking-wide"
      title={`Код бронювання: ${full}`}
    >
      {label}
    </span>
  );
}

function Avatar({ names = [] }) {
  const [a, b] = (Array.isArray(names) ? names : []).filter(Boolean);
  return (
    <span className="inline-flex -space-x-1">
      <span className="h-5 w-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-semibold inline-flex items-center justify-center ring-2 ring-white">
        {(a && a[0]?.toUpperCase()) || "?"}
      </span>
      {b && (
        <span className="h-5 w-5 rounded-full bg-slate-300 text-slate-700 text-[10px] font-semibold inline-flex items-center justify-center ring-2 ring-white">
          {b[0]?.toUpperCase()}
        </span>
      )}
    </span>
  );
}

function Block({ title, color = "emerald", children }) {
  const tone =
    color === "sky"
      ? "text-sky-900"
      : color === "slate"
      ? "text-slate-700"
      : "text-emerald-900";
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white/40 p-3">
      <div className={`text-xs font-medium ${tone} mb-2`}>{title}</div>
      {children}
    </div>
  );
}

function Empty({ text = "Нічого немає", tone = "slate" }) {
  const palette =
    tone === "emerald"
      ? { ring: "ring-emerald-200", bg: "bg-emerald-50/40", text: "text-emerald-700" }
      : tone === "sky"
      ? { ring: "ring-sky-200", bg: "bg-sky-50/40", text: "text-sky-700" }
      : { ring: "ring-slate-200", bg: "bg-slate-50/40", text: "text-slate-600" };
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${palette.bg} ring-1 ${palette.ring}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={palette.text}>
        <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className={`text-sm ${palette.text}`}>{text}</span>
    </div>
  );
}
