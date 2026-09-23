import React from "react";
import ModalShell from "../components/ModalShell";

export default function ConfirmModal({
  title,
  children,
  okText = "OK",
  okClass = "bg-emerald-600",
  onClose,
  onOk,
}) {
  return (
    <ModalShell
      title={title}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="h-10 px-5 rounded-2xl border-2 border-slate-700 bg-slate-900/60 text-sm font-medium text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition-all duration-200 shadow-sm backdrop-blur-sm"
            onClick={onClose}
          >
            Скасувати
          </button>
          <button
            type="button"
            className={[
              "h-10 px-6 rounded-2xl text-sm font-bold text-white shadow-lg hover:shadow-xl transition-all duration-200",
              okClass,
            ].join(" ")}
            onClick={onOk}
          >
            {okText}
          </button>
        </div>
      }
    >
      <div className="text-[15px] leading-relaxed text-emerald-100 whitespace-pre-wrap font-medium">
        {children}
      </div>
    </ModalShell>
  );
}
