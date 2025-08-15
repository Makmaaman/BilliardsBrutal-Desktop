import React, { useState } from "react";

export default function TableMoveMenu({ tables, fromId, onTransfer, disabled }) {
  const [open, setOpen] = useState(false);
  const freeTargets = tables.filter(x => x.id !== fromId && !x.isOn); // тільки вільні

  return (
    <div className="relative">
      <button
        disabled={disabled}
        className={`px-4 py-2 rounded-xl shadow-sm border text-sm font-medium ${disabled ? "opacity-50" : "bg-white/10 hover:bg-white/20 text-emerald-50 border-emerald-700"}`}
        onClick={() => setOpen(o => !o)}
      >
        Перенести гру
      </button>

      {open && !disabled && (
        <div className="absolute z-[9999] mt-2 min-w-[220px] rounded-xl border border-emerald-900/50 shadow-2xl overflow-hidden"
             style={{ background: "linear-gradient(180deg,#065f46,#064e3b)", color:"#fff" }}>
          {freeTargets.length === 0 ? (
            <div className="px-3 py-2 text-sm opacity-85">Немає вільних столів для переносу</div>
          ) : (
            freeTargets.map(x => (
              <button key={x.id} className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-700/50"
                      onClick={() => { setOpen(false); onTransfer(fromId, x.id); }}>
                → {x.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
