import React, { useState } from "react";
import ModalShell from "../components/ModalShell";

/**
 * onSelect({ method: "cash"|"card", fiscalize: boolean })
 * checkboxEnabled — чи ввімкнена інтеграція Checkbox ПРРО (показує перемикач фіскалізації)
 */
export default function PaymentModal({ onClose, onSelect, checkboxEnabled }) {
  const [fiscalize, setFiscalize] = useState(true);
  function choose(method) {
    onSelect?.({ method, fiscalize: checkboxEnabled ? fiscalize : false });
  }
  return (
    <ModalShell
      title="Спосіб оплати"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <button
            className="h-10 px-5 rounded-2xl border border-emerald-500/30 bg-slate-900/70 text-emerald-100 hover:bg-emerald-900/40 hover:border-emerald-400/40 transition-all duration-200 font-medium backdrop-blur-sm"
            onClick={onClose}
          >
            Скасувати
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="text-center text-emerald-100 font-medium text-base">
          Оберіть спосіб оплати для цього чеку:
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Готівка */}
          <button
            className="relative overflow-hidden group"
            onClick={() => choose("cash")}
          >
            <div className="relative h-44 rounded-[28px] border border-emerald-400/40 bg-gradient-to-br from-emerald-950/95 via-emerald-900/90 to-slate-950/95 shadow-[0_10px_30px_rgba(0,0,0,0.65),0_0_50px_rgba(16,185,129,0.2)] hover:shadow-[0_18px_45px_rgba(0,0,0,0.75),0_0_70px_rgba(16,185,129,0.35)] transition-all duration-300 backdrop-blur-sm">
              {/* Фетрова текстура */}
              <div
                className="absolute inset-0 rounded-3xl opacity-20"
                style={{
                  backgroundImage: `
                    repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(52,211,153,0.05) 2px, rgba(52,211,153,0.05) 4px),
                    repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(52,211,153,0.05) 2px, rgba(52,211,153,0.05) 4px)
                  `,
                }}
              />

              {/* Світлова смуга */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent rounded-t-3xl opacity-60" />

              {/* Іконка та текст */}
              <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4 text-emerald-50">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 shadow-lg">
                  <span className="text-4xl">💵</span>
                </div>
                <div className="text-xl font-semibold tracking-wide">Готівка</div>
                <div className="text-sm text-emerald-200/80">Оплата готівкою</div>
              </div>

              {/* Відблиск при наведенні */}
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-400/0 via-emerald-300/10 to-emerald-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
          </button>

          {/* Карта */}
          <button
            className="relative overflow-hidden group"
            onClick={() => choose("card")}
          >
            <div className="relative h-44 rounded-[28px] border border-cyan-400/40 bg-gradient-to-br from-cyan-950/95 via-cyan-900/90 to-slate-950/95 shadow-[0_10px_30px_rgba(0,0,0,0.65),0_0_50px_rgba(34,211,238,0.2)] hover:shadow-[0_18px_45px_rgba(0,0,0,0.75),0_0_70px_rgba(34,211,238,0.35)] transition-all duration-300 backdrop-blur-sm">
              {/* Фетрова текстура */}
              <div
                className="absolute inset-0 rounded-3xl opacity-20"
                style={{
                  backgroundImage: `
                    repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px),
                    repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(34,211,238,0.05) 2px, rgba(34,211,238,0.05) 4px)
                  `,
                }}
              />

              {/* Світлова смуга */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent rounded-t-3xl opacity-60" />

              {/* Іконка та текст */}
              <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4 text-cyan-50">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 shadow-lg">
                  <span className="text-4xl">💳</span>
                </div>
                <div className="text-xl font-semibold tracking-wide">Карта</div>
                <div className="text-sm text-cyan-200/80">Безготівковий розрахунок</div>
              </div>

              {/* Відблиск при наведенні */}
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-cyan-400/0 via-cyan-300/10 to-cyan-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
          </button>
        </div>

        {/* Фіскалізація через Checkbox ПРРО */}
        {checkboxEnabled && (
          <button
            onClick={() => setFiscalize((v) => !v)}
            className={[
              "w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-200",
              fiscalize
                ? "border-violet-400/50 bg-violet-900/30 text-violet-100"
                : "border-slate-600/40 bg-slate-800/40 text-slate-400",
            ].join(" ")}
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{fiscalize ? "🧾" : "📄"}</span>
              <div className="text-left">
                <div className="text-sm font-medium">
                  {fiscalize ? "Фіскалізувати чек (Checkbox ПРРО)" : "Без фіскалізації"}
                </div>
                <div className="text-xs opacity-60">
                  {fiscalize ? "Чек буде зареєстровано в ДПС через Checkbox" : "Натисніть, щоб увімкнути фіскалізацію"}
                </div>
              </div>
            </div>
            <div
              className={[
                "relative w-10 h-5 rounded-full transition-colors duration-200 shrink-0",
                fiscalize ? "bg-violet-500" : "bg-slate-600",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200",
                  fiscalize ? "translate-x-5" : "translate-x-0",
                ].join(" ")}
              />
            </div>
          </button>
        )}

        {/* Підказка */}
        <div className="text-center text-sm text-emerald-200/60 italic">
          Дані будуть збережені у статистиці та чеку
        </div>
      </div>
    </ModalShell>
  );
}
