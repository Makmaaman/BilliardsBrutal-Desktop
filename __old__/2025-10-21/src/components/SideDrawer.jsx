// src/components/SideDrawer.jsx
import React, { useEffect } from "react";

/**
 * Стандартний дроуер. z-index нижче модалок.
 */
export default function SideDrawer({ title, onClose, children, size = "lg", panelStyle }) {
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const widths = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-2xl" };

  return (
    <div className="fixed inset-0 z-[9500]">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onMouseDown={onClose} />

      {/* panel */}
      <div
        className={`absolute right-0 top-0 h-full w-[calc(100%-1.5rem)] md:w-auto ${widths[size]} bg-white rounded-l-2xl shadow-2xl ring-1 ring-slate-200 outline-none`}
        style={panelStyle}
        onMouseDown={(e)=>e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button className="text-slate-500 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>

        <div className="px-5 py-4 overflow-y-auto h-[calc(100%-56px)]">
          {children}
        </div>
      </div>
    </div>
  );
}
