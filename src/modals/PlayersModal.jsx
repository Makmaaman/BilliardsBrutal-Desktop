import React, { useState } from "react";
import ModalShell from "../components/ModalShell";

export default function PlayersModal({ onClose, customers, table, onSave }) {
  const [p1, setP1] = useState(table?.players?.[0] || "");
  const [p2, setP2] = useState(table?.players?.[1] || "");
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");

  const filterBy = (q) => {
    const s = (q || "").toLowerCase().trim();
    if (!s) return customers;
    return customers.filter((c) =>
      (c.name || "").toLowerCase().includes(s) ||
      (c.phone || "").toLowerCase().includes(s)
    );
  };

  const save = () => {
    const ids = [p1, p2].filter(Boolean).slice(0, 2);
    onSave(ids);
  };

  return (
    <ModalShell
      title={`Гравці — ${table?.name || ""}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button className="h-9 px-4 rounded-lg bg-emerald-600 text-white" onClick={save}>
            Зберегти
          </button>
          <button className="h-9 px-4 rounded-lg bg-slate-800 text-white" onClick={onClose}>
            Закрити
          </button>
        </div>
      }
    >
      <div className="grid md:grid-cols-2 gap-4">
        {/* Гравець 1 */}
        <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden bg-white">
          <div className="px-3 py-2 bg-slate-50 text-sm">Гравець 1</div>
          <div className="p-3">
            <input
              className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200 mb-2"
              placeholder="Пошук за ім'ям/телефоном"
              value={q1}
              onChange={(e) => setQ1(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              <button
                className={`w-full text-left px-3 py-2 text-sm ${!p1 ? "bg-emerald-50" : ""}`}
                onClick={() => setP1("")}
              >
                — Немає
              </button>
              {filterBy(q1).map((c) => (
                <button
                  key={c.id}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${p1 === c.id ? "bg-emerald-50" : ""}`}
                  onClick={() => setP1(c.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="truncate">
                      {c.name}{c.phone ? ` • ${c.phone}` : ""}
                    </div>
                    <div className="text-xs text-slate-500">баланс: {c.bonusBalance || 0}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Гравець 2 */}
        <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden bg-white">
          <div className="px-3 py-2 bg-slate-50 text-sm">Гравець 2</div>
          <div className="p-3">
            <input
              className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200 mb-2"
              placeholder="Пошук за ім'ям/телефоном"
              value={q2}
              onChange={(e) => setQ2(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              <button
                className={`w-full text-left px-3 py-2 text-sm ${!p2 ? "bg-emerald-50" : ""}`}
                onClick={() => setP2("")}
              >
                — Немає
              </button>
              {filterBy(q2).map((c) => (
                <button
                  key={c.id}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${p2 === c.id ? "bg-emerald-50" : ""}`}
                  onClick={() => setP2(c.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="truncate">
                      {c.name}{c.phone ? ` • ${c.phone}` : ""}
                    </div>
                    <div className="text-xs text-slate-500">баланс: {c.bonusBalance || 0}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
};
