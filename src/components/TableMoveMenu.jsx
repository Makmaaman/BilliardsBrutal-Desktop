// src/components/TableMoveMenu.jsx
import React, { useState } from "react";

export default function TableMoveMenu({ tables, fromId, onTransfer, disabled }) {
  const [open, setOpen] = useState(false);
  const freeTargets = (tables || []).filter(x => x.id !== fromId && !x.isOn);

  return (
    <div className="relative">
      <button
        disabled={disabled}
        className={`px-4 py-2 rounded-xl shadow-sm border transition ${
          disabled
            ? "bg-white/5 text-emerald-200 border-emerald-900/50 cursor-not-allowed"
            : "bg-white/10 hover:bg-white/20 text-emerald-50 border-emerald-700"
        }`}
        onClick={() => !disabled && setOpen(o => !o)}
      >
        Перенести гру
      </button>

      {open && (
        <div
          className="absolute z-20 mt-2 w-56 rounded-xl ring-1 ring-emerald-800/40 bg-emerald-900/85 backdrop-blur text-emerald-50 shadow-xl overflow-hidden"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="px-3 py-2 text-xs opacity-70 border-b border-emerald-800/50">
            На який стіл перенести?
          </div>
          {freeTargets.length === 0 ? (
            <div className="px-3 py-2 text-sm opacity-85">Немає вільних столів</div>
          ) : (
            freeTargets.map(x => (
              <button
                key={x.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-700/50"
                onClick={() => { setOpen(false); onTransfer(fromId, x.id); }}
              >
                → {x.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
