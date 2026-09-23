// src/components/ModalShell.jsx
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Універсальна модалка з порталом, overlay та керованим станом.
 * Використовується для всіх діалогів (налаштування, попередження і т.д.).
 */
function ensureModalRoot() {
  let root = document.getElementById("modal-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "modal-root";
    document.body.appendChild(root);
  }
  return root;
}

export default function ModalShell({
  open = true,
  onClose,
  title,
  children,
  footer = null,
  maxWidth,
  maxHeightVh,
  containerStyle, // можна передати { width, maxWidth, height, ... } з модалки
}) {
  const root = ensureModalRoot();
  const dialogRef = useRef(null);
  const lastFocusedRef = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const [box, setBox] = useState(null);
  const MARGIN = 12;
  const MIN_W = 360;
  const MIN_H = 220;

  // Закриття по Esc
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Фокус при відкритті
  useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = document.activeElement;
    const node = dialogRef.current;
    if (node) {
      const btn = node.querySelector("[data-autofocus]") || node;
      btn.focus?.();
    }
    return () => {
      const last = lastFocusedRef.current;
      if (last && last.focus) {
        setTimeout(() => last.focus(), 0);
      }
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setBox((prev) => {
      if (prev && prev.w && prev.h && prev.x != null && prev.y != null) return prev;
      const maxW = Math.max(MIN_W, window.innerWidth - MARGIN * 2);
      const maxH = Math.max(MIN_H, window.innerHeight - MARGIN * 2);
      const w = Math.min(rect.width, maxW);
      const h = Math.min(rect.height, maxH);
      const x = Math.max(MARGIN, (window.innerWidth - w) / 2);
      const y = Math.max(MARGIN, (window.innerHeight - h) / 2);
      return { x, y, w, h };
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function clampToViewport(prev) {
      if (!prev) return prev;
      const maxW = Math.max(MIN_W, window.innerWidth - MARGIN - prev.x);
      const maxH = Math.max(MIN_H, window.innerHeight - MARGIN - prev.y);
      const w = Math.min(prev.w, maxW);
      const h = Math.min(prev.h, maxH);
      const x = Math.min(prev.x, window.innerWidth - MARGIN - w);
      const y = Math.min(prev.y, window.innerHeight - MARGIN - h);
      return {
        x: Math.max(MARGIN, x),
        y: Math.max(MARGIN, y),
        w,
        h,
      };
    }
    function onResize() {
      setBox((prev) => clampToViewport(prev));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  function startDrag(e) {
    if (e.button !== 0) return;
    if (e.target.closest("[data-no-drag]")) return;
    if (e.target.closest("button, input, select, textarea, a, label")) return;
    const node = dialogRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: rect.left,
      originY: rect.top,
      w: rect.width,
      h: rect.height,
    };
    e.preventDefault();
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", stopDrag, { once: true });
  }

  function onDragMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const maxX = window.innerWidth - MARGIN - d.w;
    const maxY = window.innerHeight - MARGIN - d.h;
    const x = Math.max(MARGIN, Math.min(maxX, d.originX + dx));
    const y = Math.max(MARGIN, Math.min(maxY, d.originY + dy));
    setBox({ x, y, w: d.w, h: d.h });
  }

  function stopDrag() {
    dragRef.current = null;
    window.removeEventListener("pointermove", onDragMove);
  }

  function startResize(e) {
    if (e.button !== 0) return;
    const node = dialogRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: rect.left,
      originY: rect.top,
      w: rect.width,
      h: rect.height,
    };
    e.preventDefault();
    e.stopPropagation();
    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", stopResize, { once: true });
  }

  function onResizeMove(e) {
    const d = resizeRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const maxW = Math.max(MIN_W, window.innerWidth - MARGIN - d.originX);
    const maxH = Math.max(MIN_H, window.innerHeight - MARGIN - d.originY);
    const w = Math.max(MIN_W, Math.min(maxW, d.w + dx));
    const h = Math.max(MIN_H, Math.min(maxH, d.h + dy));
    setBox({ x: d.originX, y: d.originY, w, h });
  }

  function stopResize() {
    resizeRef.current = null;
    window.removeEventListener("pointermove", onResizeMove);
  }

  if (!open) return null;

  const sizeStyle = {
    maxWidth: typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth,
    maxHeight: typeof maxHeightVh === "number" ? `${maxHeightVh}vh` : maxHeightVh,
  };
  const baseStyle = { ...sizeStyle, ...containerStyle };
  const dialogStyle = box
    ? { ...baseStyle, left: box.x, top: box.y, width: box.w, height: box.h, transform: "none" }
    : { ...baseStyle, left: "50%", top: "50%", transform: "translate(-50%, -50%)" };

  return createPortal(
    <div
      className="modal-shell-overlay fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md"
      aria-modal="true"
      role="dialog"
      data-modal-title={title || ""}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        ref={dialogRef}
        style={dialogStyle}
        className="modal-shell-dialog absolute w-[min(760px,92vw)] h-[min(520px,80vh)] rounded-3xl bg-gradient-to-br from-slate-900/98 via-emerald-950/98 to-slate-950/98 text-emerald-50 shadow-[0_24px_80px_rgba(0,0,0,0.9),0_0_60px_rgba(52,211,153,0.15)] border-2 border-emerald-500/30 flex flex-col overflow-hidden backdrop-blur-xl"
      >
        {/* Фетрова текстура */}
        <div
          className="absolute inset-0 rounded-3xl opacity-20 pointer-events-none"
          style={{
            backgroundImage: `
              repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(52,211,153,0.04) 2px, rgba(52,211,153,0.04) 4px),
              repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(52,211,153,0.04) 2px, rgba(52,211,153,0.04) 4px)
            `,
          }}
        />

        {/* Світлова смуга зверху */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent rounded-t-3xl pointer-events-none opacity-60" />

        {/* header */}
        <div className="relative z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-emerald-500/20 bg-gradient-to-r from-emerald-900/60 via-emerald-800/50 to-slate-900/60 text-emerald-50 backdrop-blur-sm cursor-move select-none" onPointerDown={startDrag}>
          <div className="text-[13px] font-bold tracking-[0.18em] uppercase">
            {title || "Повідомлення"}
          </div>
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            data-no-drag
            className="h-8 w-8 inline-flex items-center justify-center rounded-full border-2 border-emerald-400/60 bg-emerald-950/60 text-lg font-bold text-emerald-100 hover:bg-emerald-800/80 hover:border-emerald-300 hover:shadow-[0_0_20px_rgba(52,211,153,0.4)] focus:outline-none focus:ring-2 focus:ring-emerald-400/80 transition-all duration-200 backdrop-blur-sm"
            aria-label="Закрити"
          >
            ×
          </button>
        </div>

        {/* body */}
        <div className="relative z-10 flex-1 min-h-0 bg-slate-950/40 px-5 py-5 overflow-auto text-[14px] leading-relaxed backdrop-blur-sm">
          {children}
        </div>

        {/* footer */}
        {footer !== null && (
          <div className="relative z-10 px-5 py-4 border-t border-emerald-500/20 bg-gradient-to-r from-slate-900/60 via-emerald-950/50 to-slate-900/60 rounded-b-3xl shrink-0 backdrop-blur-sm">
            {footer}
          </div>
        )}

        <div
          className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize opacity-60 hover:opacity-100"
          onPointerDown={startResize}
          aria-hidden="true"
        >
          <div className="h-full w-full border-b-2 border-r-2 border-emerald-300/60" />
        </div>
      </div>
    </div>,
    root
  );
}
