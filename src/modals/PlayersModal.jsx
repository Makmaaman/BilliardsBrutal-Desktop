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
    // залишаємо тільки для тих, хто у вибраних
    const out = {};
    for (const pid of initialSelected) {
      if (r[pid]) out[pid] = r[pid];
    }
    return out;
  }, [table, initialSelected]);

  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(initialSelected);
  const [rentals, setRentals] = useState(initialRentals);

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
    // фільтруємо rentals лише по вибраних гравцях
    const r = {};
    for (const pid of selectedIds) {
      if (rentals[pid]) r[pid] = rentals[pid];
    }
    onSave?.({ ids: selectedIds, rentals: r });
  }

  return (
    <ModalShell
      title="Гравці та оренда київ"
      onClose={onClose}
      footer={
        <div className="flex justify-between w-full items-center">
          <div className="text-xs text-slate-500">
            Оберіть до {MAX_PLAYERS} гравців і, за потреби, прив’яжіть їм киї.
          </div>
          <div className="flex gap-2">
            <button className="h-9 px-3 rounded-lg border" onClick={onClose}>Скасувати</button>
            <button className="h-9 px-4 rounded-lg bg-emerald-600 text-white" onClick={handleSave}>Зберегти</button>
          </div>
        </div>
      }
    >
      <div className="grid md:grid-cols-2 gap-4 max-h-[70vh]">
        {/* Доступно */}
        <section className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white flex flex-col">
          <div className="text-sm font-semibold mb-2">Доступно</div>
          <input
            className="w-full h-9 px-3 rounded-xl border border-slate-300 mb-2"
            placeholder="Пошук…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="text-xs text-slate-500 mb-2">
            Показано не більше 4 карток за раз. Прокрутіть список або використайте пошук.
          </div>
          <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 320 }}>
            {available.length === 0 && (
              <div className="text-sm text-slate-500">Немає результатів.</div>
            )}
            {available.map(c => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 p-2 rounded-xl border bg-white"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{c.name || "Без імені"}</div>
                  <div className="text-xs text-slate-500 truncate">
                    Бонуси: {(Number(c.bonusBalance||0)).toFixed(2)}
                  </div>
                </div>
                <button
                  className="h-8 px-3 rounded-lg border"
                  onClick={() => addPlayer(c.id)}
                >
                  Додати
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Вибрані */}
        <section className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white flex flex-col">
          <div className="text-sm font-semibold mb-2">Вибрані</div>
          <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 360 }}>
            {selectedIds.length === 0 && (
              <div className="text-sm text-slate-500">Нікого не вибрано.</div>
            )}
            {selectedIds.map(pid => {
              const p = cMap.get(pid);
              return (
                <div key={pid} className="p-2 rounded-xl border bg-white">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p?.name || "Без імені"}</div>
                      <div className="text-xs text-slate-500 truncate">
                        Бонуси: {(Number(p?.bonusBalance||0)).toFixed(2)}
                      </div>
                    </div>
                    <button
                      className="h-8 px-3 rounded-lg border border-rose-300 text-rose-600"
                      onClick={() => removePlayer(pid)}
                    >
                      Прибрати
                    </button>
                  </div>

                  {/* Привʼязка кия */}
                  <div className="mt-2">
                    <label className="block text-xs text-slate-500 mb-1">Оренда кия</label>
                    <select
                      className="w-full h-9 px-3 rounded-xl border border-slate-300"
                      value={rentals[pid] || ""}
                      onChange={e => setPlayerCue(pid, e.target.value || "")}
                    >
                      <option value="">— Без кия —</option>
                      {visibleCues.map(cue => (
                        <option key={cue.id} value={cue.id}>
                          {cue.name || "Кий"} — {(Number(cue.pricePerHour||0)).toFixed(2)} грн/год
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </ModalShell>
  );
}
