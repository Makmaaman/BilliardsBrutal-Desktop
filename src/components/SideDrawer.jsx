import React from "react";
import { createPortal } from "react-dom";

export default function SideDrawer({ title, children, onClose }) {
  return createPortal(
    <div className="fixed inset-0 z-[9998]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[520px] bg-white shadow-2xl p-6 overflow-y-auto">
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
