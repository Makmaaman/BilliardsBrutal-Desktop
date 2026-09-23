import React, { useEffect, useMemo, useState } from "react";
import ModalShell from "../components/ModalShell";

const MAX_PLAYERS = 4;

export default function PlayersModal({
  onClose,
  customers = [],
  table,
  cues = [],
  onSave, // expects ({ ids, rentals })
}) {
  const initialSelected = useMemo(() => {
    const ids = Array.isArray(table?.players) ? table.players.filter(Boolean) : [];
    return ids.slice(0, MAX_PLAYERS);
  }, [table]);

  const initialRentals = useMemo(() => {
    const r = (table && typeof table.rentals === "object") ? table.rentals : {};
    const out = {};
    for (const pid of initialSelected) {
      if (r[pid]) out[pid] = r[pid];
    }
    return out;
  }, [table, initialSelected]);

  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(initialSelected);
  const [rentals, setRentals] = useState(initialRentals);

  // оновлюємо стан, якщо змінюється стіл
  useEffect(() => {
    setSelectedIds(initialSelected);
    setRentals(initialRentals);
  }, [initialSelected, initialRentals]);

  // індекси для швидкого доступу
  const cMap = useMemo(() => {
    const m = new Map();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);

  const visibleCues = useMemo(() => Array.isArray(cues) ? cues : [], [cues]);

  // доступні (не вибрані) клієнти з пошуком
  const available = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return (customers || [])
      .filter(c => !selectedIds.includes(c.id))
      .filter(c => !q || String(c.name || "").toLowerCase().includes(q));
  }, [customers, selectedIds, query]);

  function addPlayer(id) {
    if (selectedIds.length >= MAX_PLAYERS) {
      alert(`Можна обрати до ${MAX_PLAYERS} гравців.`);
      return;
    }
    setSelectedIds(prev => prev.concat([id]));
  }

  function removePlayer(id) {
    setSelectedIds(prev => prev.filter(x => x !== id));
    setRentals(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function setPlayerCue(playerId, cueId) {
    setRentals(prev => {
      const next = { ...prev };
      if (!cueId) delete next[playerId];
      else next[playerId] = cueId;
      return next;
    });
  }

  function handleSave() {
    const r = {};
    for (const pid of selectedIds) {
      if (rentals[pid]) r[pid] = rentals[pid];
    }
    onSave?.({ ids: selectedIds, rentals: r });
    onClose?.();
  }

  return (
    <ModalShell
      title="Гравці та оренда київ"
      onClose={onClose}
      containerStyle={{ width: "920px", maxWidth: "92vw", height: "670px", maxHeight: "86vh" }}
      footer={
        <div className="flex justify-between w-full items-center">
          <div className="text-xs text-emerald-200/80">
            Оберіть до {MAX_PLAYERS} гравців і, за потреби, прив'яжіть їм киї.
          </div>
          <div className="flex gap-2">
            <button
              className="h-9 px-4 rounded-full border border-emerald-400/40 bg-slate-900/60 text-emerald-100 text-sm hover:bg-emerald-900/40"
              onClick={onClose}
            >
              Скасувати
            </button>
            <button
              className="h-9 px-5 rounded-full bg-emerald-600 text-white text-sm font-semibold shadow-[0_10px_24px_rgba(5,150,105,0.6)] hover:bg-emerald-500"
              onClick={handleSave}
            >
              Зберегти
            </button>
          </div>
        </div>
      }
    >
      <div className="grid md:grid-cols-2 gap-6 max-h-[72vh] pt-1">
        {/* Доступно */}
        <section className="p-4 rounded-3xl border border-emerald-500/20 bg-slate-900/40 shadow-sm flex flex-col">
          <div className="text-[13px] font-semibold text-emerald-200 tracking-wide uppercase">
            Доступно
          </div>

          {/* Пошук */}
          <div className="mt-2">
            <div className="relative">
              <input
                className="w-full h-10 rounded-2xl bg-slate-900/70 text-emerald-50 placeholder:text-slate-400 border border-emerald-500/20 px-3.5 pr-9 text-sm shadow-[0_10px_24px_rgba(15,23,42,0.65)] outline-none focus:ring-2 focus:ring-emerald-400/70"
                placeholder="Пошук гравця…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              <span className="absolute inset-y-0 right-2 flex items-center text-emerald-200/60 text-sm pointer-events-none">
                ⌕
              </span>
            </div>
            <p className="mt-2 text-[12px] text-emerald-200/60">
              Показано не більше 4 карток за раз. Прокрутіть список або скористайтесь пошуком.
            </p>
          </div>

          {/* Список доступних */}
          <div className="mt-3 flex-1 max-h-64 overflow-y-auto space-y-2 pr-1">
            {available.length === 0 && (
              <div className="text-[13px] text-emerald-200/60 bg-slate-950/60 rounded-2xl px-3 py-2 border border-emerald-500/20">
                Немає результатів.
              </div>
            )}
            {available.map(c => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl border border-emerald-500/20 bg-slate-950/60 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-emerald-50 truncate">
                    {c.name || "Без імені"}
                  </div>
                  <div className="text-[12px] text-emerald-200/60 truncate">
                    Бонуси: {(Number(c.bonusBalance || 0)).toFixed(2)}
                  </div>
                </div>
                <button
                  className="ml-2 h-8 px-3 rounded-full border border-emerald-400/40 bg-slate-900/60 text-[13px] text-emerald-100 hover:bg-emerald-900/40"
                  onClick={() => addPlayer(c.id)}
                >
                  Додати
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Вибрані */}
        <section className="p-4 rounded-3xl border border-emerald-500/20 bg-slate-900/40 shadow-sm flex flex-col">
          <div className="text-[13px] font-semibold text-emerald-200/70 tracking-wide uppercase">
            Вибрані
          </div>

          <div className="mt-3 flex-1 max-h-72 overflow-y-auto space-y-2 pr-1">
            {selectedIds.length === 0 && (
              <div className="flex items-center justify-center h-full text-[13px] text-emerald-200/60 bg-slate-950/60 rounded-2xl px-3 py-4 border border-emerald-500/20">
                Нікого не вибрано.
              </div>
            )}

            {selectedIds.map(pid => {
              const p = cMap.get(pid);
              return (
                <div
                  key={pid}
                  className="p-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/40 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-emerald-50 truncate">
                        {p?.name || "Без імені"}
                      </div>
                      <div className="text-[12px] text-emerald-200/70 truncate">
                        Бонуси: {(Number(p?.bonusBalance || 0)).toFixed(2)}
                      </div>
                    </div>
                    <button
                      className="ml-2 h-8 px-3 rounded-full text-[13px] font-medium border border-rose-400/40 bg-rose-900/30 text-rose-100 hover:bg-rose-900/50"
                      onClick={() => removePlayer(pid)}
                    >
                      Прибрати
                    </button>
                  </div>

                  {/* Привʼязка кия */}
                  <div className="mt-3">
                    <label className="block text-[11px] uppercase tracking-[0.12em] text-emerald-200/80 mb-1">
                      Оренда кия
                    </label>
                    <select
                      className="w-full h-9 px-3 rounded-2xl border border-emerald-500/30 bg-slate-900/70 text-sm text-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-400/70"
                      value={rentals[pid] || ""}
                      onChange={e => setPlayerCue(pid, e.target.value || "")}
                    >
                      <option value="">— Без кия —</option>
                      {visibleCues.map(cue => (
                        <option key={cue.id} value={cue.id}>
                          {cue.name || "Кий"} — {(Number(cue.pricePerHour || 0)).toFixed(2)} грн/год
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 text-[12px] text-emerald-200/60">
            Можна обрати до{" "}
            <span className="font-semibold text-emerald-100">{MAX_PLAYERS}</span>{" "}
            гравців для одного столу.
          </div>
        </section>
      </div>
    </ModalShell>
  );
}
