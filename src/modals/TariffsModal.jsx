// src/modals/TariffsModal.jsx
import React from "react";

/**
 * Мінімальна заглушка «Тарифи», щоб не ламати збірку.
 * Залишаємо API: open, onClose — як у вашій реальній модалці.
 * Коли буде готова справжня модалка — просто замініть цей файл.
 */
export default function TariffsModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-[min(800px,95vw)] overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="font-semibold text-lg">Тарифи</div>
          <button onClick={onClose} className="px-3 py-2 rounded-xl border text-sm">Закрити</button>
        </div>
        <div className="p-5 text-sm text-gray-600">
          <p>Заглушка TariffsModal. Тут буде ваша реальна логіка налаштування тарифів.</p>
        </div>
      </div>
    </div>
  );
}
