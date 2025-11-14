import React, { useMemo, useState } from "react";
import ModalShell from "../components/ModalShell";

function newCue() {
  return { id: "cue_" + Math.random().toString(36).slice(2,8), name: "", pricePerHour: 0 };
}

export default function RentalsModal({ onClose, cues = [], setCues = () => {} }) {
  const [list, setList] = useState(() => (Array.isArray(cues) ? cues.slice() : []));
  const [filter, setFilter] = useState("");

  function addRow() {
    setList(arr => arr.concat([newCue()]));
    setTimeout(() => {
      const anchor = document.getElementById("rentals-end");
      if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 30);
  }
  function updateRow(id, patch) {
    setList(arr => arr.map(it => it.id === id ? ({ ...it, ...patch }) : it));
  }
  function removeRow(id) {
    setList(arr => arr.filter(it => it.id !== id));
  }
  function saveAll() {
    // sanitize
    const out = list
      .map(it => ({
        id: it.id || newCue().id,
        name: String(it.name || "").trim(),
        pricePerHour: Number(it.pricePerHour || 0)
      }))
      .filter(it => it.name);
    setCues(out);
    onClose();
  }

  const filtered = useMemo(() => {
    const q = String(filter || "").trim().toLowerCase();
    if (!q) return list;
    return list.filter(it => (it.name || "").toLowerCase().includes(q));
  }, [filter, list]);

  return (
    <ModalShell
      title="Оренда — киї"
      onClose={onClose}
      footer={
        <div className="flex justify-between w-full">
          <button className="h-9 px-3 rounded-lg border" onClick={addRow}>Додати кий</button>
          <div className="flex gap-2">
            <button className="h-9 px-4 rounded-lg border" onClick={onClose}>Відмінити</button>
            <button className="h-9 px-4 rounded-lg bg-slate-900 text-white" onClick={saveAll}>Зберегти</button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            className="h-10 w-full px-3 rounded-xl border border-slate-300"
            placeholder="Пошук київ…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
          {filtered.map(it => (
            <div key={it.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 p-3 rounded-xl border bg-white">
              <div className="md:col-span-7 min-w-0">
                <label className="text-xs text-slate-500">Назва</label>
                <input
                  className="w-full h-9 px-3 rounded-xl border border-slate-300"
                  placeholder="Напр., Predator BK"
                  value={it.name || ""}
                  onChange={e => updateRow(it.id, { name: e.target.value })}
                />
              </div>
              <div className="md:col-span-3 min-w-0">
                <label className="text-xs text-slate-500">Ціна / год, грн</label>
                <input
                  className="w-full h-9 px-3 rounded-xl border border-slate-300"
                  type="number" min={0} step={1}
                  value={Number(it.pricePerHour || 0)}
                  onChange={e => updateRow(it.id, { pricePerHour: Number(e.target.value)||0 })}
                />
              </div>
              <div className="md:col-span-2 flex items-end justify-end">
                <button className="h-9 px-3 rounded-xl border border-rose-300 text-rose-700" onClick={() => removeRow(it.id)}>Видалити</button>
              </div>
            </div>
          ))}
          <div id="rentals-end" />
        </div>
      </div>
    </ModalShell>
  );
}
