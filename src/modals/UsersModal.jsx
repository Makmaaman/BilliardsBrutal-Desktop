// src/modals/UsersModal.jsx
import React from "react";

/**
 * Мінімальний заглушка-модалка «Користувачі», щоб не ламати збірку.
 * - Підтримує ті самі пропси: open, onClose
 * - Дизайн не змінюємо: той самий простий модальний контейнер і кнопка Закрити
 * - За потреби пізніше підміните цим файлом вашу реальну модалку
 */
export default function UsersModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-[min(700px,95vw)] overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="font-semibold text-lg">Користувачі</div>
          <button onClick={onClose} className="px-3 py-2 rounded-xl border text-sm">Закрити</button>
        </div>
        <div className="p-5 text-sm text-gray-600">
          <p>Тут буде ваша модалка управління користувачами. Зараз це тимчасова заглушка, щоб додаток компілювався.</p>
        </div>
      </div>
    </div>
  );
}
