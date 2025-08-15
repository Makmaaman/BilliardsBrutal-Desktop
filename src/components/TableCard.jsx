import React from "react";
import { fmtDur, money } from "../utils/format";
import TableMoveMenu from "./TableMoveMenu";

export default function TableCard({
  table, relayChannel, cost, liveMs, canOperate, busy,
  onLightOn, onLightOff, onPause, onReset, onPrintReset, onTransfer, tables
}) {
  const lamp = (on) => (<span className={`inline-block w-3 h-3 rounded-full mr-2 ${on ? "bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(16,185,129,.8)]" : "bg-slate-300"}`} />);

  return (
    <div className="relative rounded-[18px] shadow-xl border border-[#5b3a1b]/30 p-1"
         style={{ background: "linear-gradient(180deg,#8b5a2b,#5c3b1e)" }}>
      <div className="rounded-[14px] p-0.5" style={{ background: "linear-gradient(90deg,#d6a354,#916c2a)" }}>
        <div className="rounded-[12px] p-5 text-emerald-50 border border-emerald-900/40 shadow-inner"
             style={{ background:
               "linear-gradient(0deg, rgba(255,255,255,0.04), rgba(0,0,0,0.04)), " +
               "repeating-radial-gradient(circle at 20% 15%, rgba(255,255,255,0.03) 0 2px, rgba(0,0,0,0.03) 3px 5px), " +
               "radial-gradient(ellipse at center, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 60%), " +
               "#0f5132" }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-80">Стіл</div>
              <div className="text-2xl font-semibold text-white drop-shadow">{table.name}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] opacity-80">Стан</div>
              <div className="font-medium flex items-center justify-end">{lamp(table.isOn)}{table.isOn ? "УВІМК." : "ПАУЗА/ВИМК."}</div>
            </div>
          </div>

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

          <div className="mt-5 flex flex-wrap gap-3">
            {!table.isOn ? (
              <button
                disabled={!canOperate || busy}
                title={!canOperate ? "Спочатку відкрийте зміну" : ""}
                className={`px-4 py-2 rounded-xl shadow-sm border text-sm font-medium ${!canOperate ? "opacity-50" : "bg-amber-500 hover:bg-amber-600 text-white border-amber-600"}`}
                onClick={() => onLightOn(table.id)}
              >
                Увімкнути світло
              </button>
            ) : (
              <button
                disabled={busy}
                className="px-4 py-2 rounded-xl shadow-sm border text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
                onClick={() => onLightOff(table.id)}
              >
                Вимкнути світло
              </button>
            )}

            {table.isOn && (
              <button className="px-4 py-2 rounded-xl shadow-sm border text-sm font-medium bg-white/10 hover:bg-white/20 text-emerald-50 border-emerald-700"
                      disabled={busy} onClick={() => onPause(table.id)}>
                Пауза
              </button>
            )}

            <button className="px-4 py-2 rounded-xl shadow-sm border text-sm font-medium bg-white/10 hover:bg-white/20 text-emerald-50 border-emerald-700"
                    onClick={() => onReset(table.id)}>
              Скинути
            </button>

            <button className="px-4 py-2 rounded-xl shadow-sm border text-sm font-medium bg-white/10 hover:bg-white/20 text-emerald-50 border-emerald-700"
                    onClick={() => onPrintReset(table.id)}>
              Зберегти чек
            </button>

            <TableMoveMenu disabled={!canOperate || busy} tables={tables} fromId={table.id} onTransfer={onTransfer} />
          </div>

          <div className="mt-4 text-[11px] opacity-90">Канал реле: <b className="text-white">{relayChannel ?? "—"}</b></div>
        </div>
      </div>
    </div>
  );
}
