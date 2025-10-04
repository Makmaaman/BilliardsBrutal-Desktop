import React from "react";
import ModalShell from "../components/ModalShell";

export default function UpdatesModal({ onClose, upd, onCheck }) {
  const map = {
    idle: "Оновлень немає",
    checking: "Перевірка…",
    available: "Знайдено нову версію (завантажиться автоматично)",
    downloading: `Завантаження… ${upd.progress}%`,
    downloaded: "Оновлення готове — перезапустіть для встановлення",
    error: `Помилка: ${upd.message}`
  };
  return (
    <ModalShell title="Оновлення" onClose={onClose} footer={
      <div className="flex justify-end gap-2">
        <button className="h-9 px-3 rounded-lg bg-sky-600 text-white" onClick={onCheck}>Перевірити зараз</button>
        <button className="h-9 px-4 rounded-lg bg-slate-800 text-white" onClick={onClose}>Закрити</button>
      </div>
    }>
      <div className="text-sm">{map[upd.phase] ?? "Стан невідомий"}</div>
      {upd.phase === "downloaded" && (
        <div className="mt-3">
          <button className="h-9 px-3 rounded-lg bg-emerald-600 text-white" onClick={()=>window.updates.quitAndInstall()}>
            Перезапустити й встановити
          </button>
        </div>
      )}
    </ModalShell>
  );
}

/* =======================
 * Підтвердження
 * ======================= */
