// src/components/ChangelogModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import ModalShell from "./ModalShell";

/** Мітка типу зміни за текстом пункту */
function itemTone(text) {
  const t = String(text || "").toLowerCase();
  if (t.startsWith("виправлено") || t.includes("виправл") || t.includes("фікс")) return "fix";
  if (t.startsWith("нова функція") || t.includes("нова функція") || t.includes("додано")) return "new";
  if (t.includes("оновлено") || t.includes("покращено") || t.includes("дизайн")) return "improve";
  return "default";
}

const TONE = {
  new: { dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]", label: "нове", chip: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30" },
  fix: { dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]", label: "фікс", chip: "bg-amber-500/15 text-amber-200 border-amber-400/30" },
  improve: { dot: "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]", label: "покращення", chip: "bg-sky-500/15 text-sky-200 border-sky-400/30" },
  default: { dot: "bg-emerald-500/60", label: "", chip: "" },
};

function VersionCard({ entry, isCurrent, innerRef }) {
  return (
    <section
      ref={innerRef}
      className="scroll-mt-2 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-slate-900/80 via-emerald-950/40 to-slate-900/80 shadow-[inset_0_1px_0_rgba(52,211,153,0.08),0_8px_24px_rgba(0,0,0,0.35)] overflow-hidden"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-emerald-500/20 bg-gradient-to-r from-emerald-900/50 to-transparent">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-2 py-0.5 text-[12px] font-bold text-emerald-200 tracking-wide">
            v{entry.version}
          </span>
          {isCurrent && (
            <span className="inline-flex items-center rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-[0_0_12px_rgba(52,211,153,0.5)]">
              поточна
            </span>
          )}
          <span className="truncate text-sm font-semibold text-emerald-50">{entry.title}</span>
        </div>
        {entry.date && <span className="text-[11px] text-emerald-300/60 font-mono shrink-0">{entry.date}</span>}
      </header>

      <ul className="px-4 py-3 space-y-2.5">
        {(entry.items || []).map((it, i) => {
          const tone = TONE[itemTone(it)] || TONE.default;
          return (
            <li key={i} className="flex items-start gap-3 text-[13px] leading-relaxed text-emerald-100/85">
              <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
              <span className="min-w-0">{it}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function ChangelogModal({ version, entries = [], onClose }) {
  const list = useMemo(() => entries || [], [entries]);
  const [active, setActive] = useState(list[0]?.version || "");
  const refs = useRef({});
  const scrollRef = useRef(null);

  // підсвічуємо у списку ту версію, що зараз видно
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (items) => {
        const visible = items
          .filter((x) => x.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target?.dataset?.version) setActive(visible.target.dataset.version);
      },
      { root, rootMargin: "-10% 0px -70% 0px", threshold: 0 }
    );
    Object.values(refs.current).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [list]);

  function goTo(v) {
    setActive(v);
    refs.current[v]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <ModalShell
      title={`Що нового • v${version}`}
      onClose={onClose}
      containerStyle={{ width: "1000px", maxWidth: "94vw", height: "700px", maxHeight: "86vh" }}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] text-emerald-200/50">
            Усього версій: <span className="text-emerald-200/80 font-semibold">{list.length}</span>
          </div>
          <button
            className="h-9 px-5 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-sm font-semibold shadow-lg shadow-emerald-500/30 hover:from-emerald-400 hover:to-emerald-500 transition"
            onClick={onClose}
          >
            Зрозуміло
          </button>
        </div>
      }
    >
      <div className="grid md:grid-cols-[200px,1fr] gap-4 h-full min-h-0">
        {/* Навігація по версіях */}
        <aside className="hidden md:flex flex-col gap-1.5 overflow-y-auto pr-1 custom-scrollbar">
          {list.map((e) => {
            const isActive = e.version === active;
            return (
              <button
                key={e.version}
                onClick={() => goTo(e.version)}
                className={[
                  "text-left px-3 py-2 rounded-xl border transition-all duration-150",
                  isActive
                    ? "border-emerald-400/50 bg-gradient-to-r from-emerald-800/60 to-emerald-900/40 shadow-[0_0_16px_rgba(52,211,153,0.15)]"
                    : "border-emerald-500/15 bg-slate-900/40 hover:bg-emerald-900/30 hover:border-emerald-400/35",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[13px] font-bold ${isActive ? "text-emerald-100" : "text-emerald-200/70"}`}>
                    v{e.version}
                  </span>
                  {e.version === version && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                  )}
                </div>
                {e.date && <div className="text-[10px] font-mono text-emerald-300/50">{e.date}</div>}
                <div className="mt-0.5 text-[11px] leading-snug text-emerald-200/60 line-clamp-2">{e.title}</div>
              </button>
            );
          })}
        </aside>

        {/* Зміни */}
        <div ref={scrollRef} className="min-h-0 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
          {list.map((e) => (
            <div
              key={e.version}
              data-version={e.version}
              ref={(el) => {
                refs.current[e.version] = el;
              }}
            >
              <VersionCard entry={e} isCurrent={e.version === version} />
            </div>
          ))}
          {list.length === 0 && (
            <div className="grid place-items-center h-full text-emerald-200/50 text-sm">Список змін порожній</div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
