// src/components/ModalShell.jsx
import React from "react";
import { createPortal } from "react-dom";

/**
 * Базова модалка з коректним стеком і фокусом.
 * - z-index: 12000 (вище за меню/дроуери/тости)
 * - бекдроп не «висить» після закриття
 * - автофокус у перший інтерактивний елемент
 */
export default function ModalShell({
  title,
  onClose,
  children,
  footer = null,
  maxw = "max-w-[48rem]",
  containerClassName = "",
  containerStyle = null,
}) {
  // Esc -> close
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCloseRef.current?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Фокус на модалку та перший інпут
  const panelRef = React.useRef(null);
  React.useEffect(() => {
    try { window.focus?.(); } catch {}
    const node = panelRef.current;
    node?.focus?.();
    const first = node?.querySelector?.('input,select,textarea,button,[contenteditable=""],[contenteditable="true"]');
    if (first?.focus) setTimeout(() => first.focus(), 0);
  }, []);

  const modal =
    <div className="fixed inset-0 z-[12000]">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onMouseDown={onClose} />

      {/* panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-1.5rem)] md:w-auto ${maxw} max-h-[90vh] overflow-auto bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 outline-none ${containerClassName}`}
        style={containerStyle || undefined}
        onMouseDown={(e)=>e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button className="text-slate-500 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>

        <div className="px-5 py-4">{children}</div>

        {footer && <div className="px-5 py-3 border-t border-slate-200 bg-white sticky bottom-0">{footer}</div>}
      </div>
    </div>;

  return createPortal(modal, document.body);
}
