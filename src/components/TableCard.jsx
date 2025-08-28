// src/components/TableCard.jsx
import React from "react";
import { fmtDur, money } from "../utils/format";
import TableMoveMenu from "./TableMoveMenu";

const FeltBg = {
  background:
    // легка «сітка» + глянець + тінь
    "linear-gradient(0deg, rgba(255,255,255,0.04), rgba(0,0,0,0.04)), " +
    "repeating-radial-gradient(circle at 20% 15%, rgba(255,255,255,0.03) 0 2px, rgba(0,0,0,0.03) 3px 5px), " +
    "radial-gradient(ellipse at center, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 60%), " +
    "#0f5132",
};

export default function TableCard({
  table,
  relayChannel,
  cost,
  liveMs,
  canOperate,
  busy,
  onLightOn,
  onLightOff,
  onPause,
  onReset,
  onPrintReset,
  onTransfer,
  tables,
}) {
  const Lamp = ({ on }) => (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${
        on ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,.9)]" : "bg-slate-300"
      }`}
    />
  );

  return (
    <div
      className="relative rounded-[18px] shadow-xl border border-[#5b3a1b]/30 p-1"
      style={{ background: "linear-gradient(180deg,#8b5a2b,#5c3b1e)" }}  // «дерев’яна» рамка
    >
      <div className="rounded-[14px] p-0.5" style={{ background: "linear-gradient(90deg,#d6a354,#916c2a)" }}>
        <div
          className="rounded-[12px] p-5 text-emerald-50 border border-emerald-900/40 shadow-inner"
          style={FeltBg}
        >
          {/* Заголовок + стан */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-80">Стіл</div>
              <div className="text-2xl font-semibold text-white drop-shadow">{table.name}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] opacity-80">Стан</div>
              <div className="font-medium flex items-center justify-end text-white">
                <Lamp on={table.isOn} />
                {table.isOn ? "УВІМК." : "ПАУЗА/ВИМК."}
              </div>
            </div>
          </div>

          {/* Показники */}
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-emerald-900/25 border border-emerald-800/40 p-3">
              <div className="text-[11px] opacity-80">Час</div>
              <div className="text-3xl font-mono tabular-nums text-white">{fmtDur(liveMs)}</div>
            </div>
            <div className="rounded-lg bg-emerald-900/25 border border-emerald-800/40 p-3">
              <div className="text-[11px] opacity-80">Нараховано</div>
              <div className="text-3xl font-semibold text-white">{money(cost)}</div>
            </div>
          </div>

          {/* Дії */}
          <div className="mt-5 flex flex-wrap gap-3">
            {!table.isOn ? (
              <button
                disabled={!canOperate || busy}
                title={!canOperate ? "Спочатку відкрийте зміну" : ""}
                className={`px-4 py-2 rounded-xl shadow-sm border transition ${
                  !canOperate || busy
                    ? "bg-emerald-900/20 text-emerald-200 border-emerald-900/50 cursor-not-allowed"
                    : "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600"
                }`}
                onClick={() => onLightOn(table.id)}
              >
                Увімкнути світло
              </button>
            ) : (
              <button
                disabled={busy}
                className={`px-4 py-2 rounded-xl shadow-sm border transition ${
                  busy
                    ? "bg-amber-900/20 text-amber-200 border-amber-900/50 cursor-not-allowed"
                    : "bg-amber-500 hover:bg-amber-600 text-white border-amber-600"
                }`}
                onClick={() => onPause(table.id)}
              >
                Пауза
              </button>
            )}

            <button
              disabled={!table.isOn || busy}
              className={`px-4 py-2 rounded-xl shadow-sm border transition ${
                !table.isOn || busy
                  ? "bg-rose-900/20 text-rose-200 border-rose-900/50 cursor-not-allowed"
                  : "bg-rose-500 hover:bg-rose-600 text-white border-rose-600"
              }`}
              onClick={() => onReset(table.id)}
            >
              Скинути
            </button>

            <button
              disabled={busy}
              className={`px-4 py-2 rounded-xl shadow-sm border transition ${
                busy
                  ? "bg-white/5 text-emerald-200 border-emerald-900/50 cursor-not-allowed"
                  : "bg-white/10 hover:bg-white/20 text-emerald-50 border-emerald-700"
              }`}
              onClick={() => onPrintReset(table.id)}
            >
              Зберегти чек
            </button>

            {/* Перенести гру */}
            <TableMoveMenu
              disabled={!canOperate || busy}
              tables={tables}
              fromId={table.id}
              onTransfer={onTransfer}
            />
          </div>

          <div className="mt-4 text-[11px] opacity-90">
            Канал реле: <b className="text-white">{relayChannel ?? "—"}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
