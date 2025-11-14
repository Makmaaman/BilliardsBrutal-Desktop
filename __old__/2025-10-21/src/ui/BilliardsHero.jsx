// src/ui/BilliardsHero.jsx
import React from "react";
import { motion } from "framer-motion";

/** Герой-банер із кульками та києм на Framer Motion (без зовнішніх ассетів). */
export default function BilliardsHero({ machineId }){
  const float = (x=0,y=0,dur=6,delay=0) => ({
    initial: { x: 0, y: 0 },
    animate: { x, y, transition: { repeat: Infinity, repeatType: "mirror", duration: dur, delay } }
  });
  return (
    <div className="relative overflow-hidden min-h-[180px] bg-gradient-to-b from-emerald-600 to-emerald-700 text-white rounded-t-2xl">
      {/* Кий */}
      <motion.div
        className="absolute right-[-260px] bottom-12 h-1.5 w-[260px] rounded bg-gradient-to-r from-amber-600 to-amber-800 shadow-lg"
        initial={{ rotate: 0, x: 0 }}
        animate={{ rotate: [0,1.5,1.5,0], x: [0,-210,-210,0] }}
        transition={{ duration: 4.5, repeat: Infinity, repeatDelay: 0.5 }}
      >
        <span className="absolute -left-2 -top-0.5 w-4 h-2 bg-slate-800 rounded-sm" />
      </motion.div>

      {/* Кулі */}
      <motion.div className="absolute left-[20%] top-[40%] w-10 h-10 rounded-full shadow-[inset_0_0_0_3px_rgba(255,255,255,.85),0_10px_20px_rgba(0,0,0,.25)]"
        style={{ background: "radial-gradient(circle at 30% 30%, #444, #111)" }}
        {...float(40,-30,6,0)}>
        <span className="absolute inset-[9px] grid place-items-center rounded-full bg-white/90 text-xs font-bold">8</span>
      </motion.div>

      <motion.div className="absolute left-[55%] top-[18%] w-10 h-10 rounded-full shadow-[inset_0_0_0_3px_rgba(255,255,255,.85),0_10px_20px_rgba(0,0,0,.25)]"
        style={{ background: "radial-gradient(circle at 30% 30%, #ffdc00, #c99a00)" }}
        {...float(-50,20,7,0.2)}>
        <span className="absolute inset-[9px] grid place-items-center rounded-full bg-white/90 text-xs font-bold">1</span>
      </motion.div>

      <motion.div className="absolute left-[72%] top-[58%] w-10 h-10 rounded-full shadow-[inset_0_0_0_3px_rgba(255,255,255,.85),0_10px_20px_rgba(0,0,0,.25)]"
        style={{ background: "radial-gradient(circle at 30% 30%, #e11, #820)" }}
        {...float(-30,-25,8,0.4)}>
        <span className="absolute inset-[9px] grid place-items-center rounded-full bg-white/90 text-xs font-bold">3</span>
      </motion.div>

      {/* Текст */}
      <div className="relative z-10 p-4">
        <div className="text-lg font-semibold">Оберіть ліцензію для вашого клубу</div>
        <div className="text-xs/5 opacity-90">Оплата через Monobank • Machine ID: <b>{machineId || "—"}</b></div>
      </div>
    </div>
  );
}
