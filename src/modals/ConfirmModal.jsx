import React from "react";
import ModalShell from "../components/ModalShell";

export default function ConfirmModal({ title, children, okText="OK", okClass="bg-emerald-600", onClose, onOk }) {
  return (
    <ModalShell title={title} onClose={onClose} footer={
      <div className="flex justify-end gap-2">
        <button className="h-9 px-4 rounded-lg bg-slate-200" onClick={onClose}>Скасувати</button>
        <button className={`h-9 px-4 rounded-lg text-white ${okClass}`} onClick={onOk}>{okText}</button>
      </div>
    }>
      <div className="text-sm text-slate-700">{children}</div>
    </ModalShell>
  );
}

/* =======================
 * БАЗОВИЙ каркас модалки (PORTAL + правильний фокус)
 * ======================= */
function ensureModalRoot() {
  let root = document.getElementById("modal-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "modal-root";
    document.body.appendChild(root);
  }
  return root;
}

/* =======================
 * Модал «Бонуси»
 * ======================= */
