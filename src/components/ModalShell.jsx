
// src/components/ModalShell.jsx
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Універсальна модалка з порталом, фокусом та overlay.
 * Працює і як керована (open=true/false), і як проста (рендер == відкрита).
 * Додає data-modal-title для можливості керувати розмірами через CSS.
 */
export default function ModalShell({
  open = true,
  onClose,
  title,
  children,
  footer = null,
  maxWidth = 1200,     // дефолт — середня
  maxHeightVh = 90,    // обмеження по висоті
  ariaLabel = "Модальне вікно",
  disableBackdropClose = false,
}) {
  const panelRef = useRef(null);

  // ESC для закриття
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Простий фокус-трап на перший фокусний елемент
  useEffect(() => {
    if (!open) return;
    const el = panelRef.current;
    if (!el) return;
    const focusables = el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length) {
      (focusables[0] instanceof HTMLElement) && focusables[0].focus();
    } else {
      el.focus();
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="bb-modal-overlay fixed inset-0 z-[60] grid items-start justify-center md:place-items-center p-4 md:p-6 overflow-auto"
      role="dialog"
      aria-label={ariaLabel}
      aria-modal="true"
      onMouseDown={!disableBackdropClose ? () => onClose?.() : undefined}
      data-modal-title={title || ""}
    >
      {/* затемнення */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />

      {/* панель */}
      <div
        ref={panelRef}
        className="bb-modal-panel relative bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 w-[min(96vw,1000px)] max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden"
        style={{ maxWidth: `${maxWidth}px`, maxHeight: `${maxHeightVh}vh` }}
        onMouseDown={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* хедер */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 shrink-0">
          <div className="text-base font-semibold truncate">{title}</div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="h-8 w-8 grid place-items-center rounded-lg hover:bg-slate-100"
            aria-label="Закрити"
          >
            <span className="text-xl leading-none">×</span>
          </button>
        </div>

        {/* контент */}
        <div className="flex-1 min-h-0 p-5 overflow-auto">
          {children}
        </div>

        {/* футер */}
        {footer !== null && (
          <div className="px-5 py-3 border-t border-slate-200 bg-white rounded-b-2xl shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
