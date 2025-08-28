// src/components/ModalShell.jsx
import React from "react";
import { createPortal } from "react-dom";
import { modalPanel, modalHeader, modalTitle, modalClose, modalBody } from "../ui/classes";

export default function ModalShell({ title, onClose, size = "lg", children }) {
  const maxw =
    size === "sm"    ? "max-w-md"  :
    size === "md"    ? "max-w-lg"  :
    size === "lg"    ? "max-w-3xl" :
    size === "xl"    ? "max-w-5xl" :
    size === "stats" ? "max-w-6xl" : "max-w-3xl";

  return createPortal(
    <div className="fixed inset-0 z-[9998]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-1.5rem)] md:w-auto ${maxw} max-h-[90vh] overflow-auto ${modalPanel}`}>
        <div className={modalHeader}>
          <h3 className={modalTitle}>{title}</h3>
          <button className={modalClose} onClick={onClose} aria-label="Закрити">✕</button>
        </div>
        <div className={modalBody}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
