// src/components/SideDrawer.jsx
import React from "react";
import { createPortal } from "react-dom";

// size: "sm" | "md" | "lg" | "xl"
export default function SideDrawer({ title, children, onClose, size = "sm" }) {
  const widthClass =
    size === "sm" ? "sm:w-[520px]"  :
    size === "md" ? "sm:w-[720px]"  :
    size === "lg" ? "sm:w-[860px]"  :
                    "sm:w-[1200px]"; // xl — широка статистика

  return createPortal(
    <div className="fixed inset-0 z-[9998]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`absolute right-0 top-0 h-full w-full ${widthClass} bg-white shadow-2xl p-6 overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-xl font-semibold">{title}</div>
          <button className="px-3 py-1.5 rounded-lg border border-slate-300" onClick={onClose}>Закрити</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
