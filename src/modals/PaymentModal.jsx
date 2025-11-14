import React from "react";
import ModalShell from "../components/ModalShell";

export default function PaymentModal({ onClose, onSelect }) {
  return (
    <ModalShell
      title="Спосіб оплати"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button className="h-9 px-3 rounded-lg border" onClick={onClose}>Скасувати</button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="text-sm text-slate-600">Оберіть спосіб оплати для цього чеку:</div>
        <div className="flex flex-wrap gap-3">
          <button
            className="h-10 px-4 rounded-xl bg-emerald-600 text-white"
            onClick={() => onSelect?.("cash")}
          >
            Готівка
          </button>
          <button
            className="h-10 px-4 rounded-xl bg-sky-600 text-white"
            onClick={() => onSelect?.("card")}
          >
            Карта
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
