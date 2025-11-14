// src/ui/AnimatedChip.jsx
import React from "react";
import { motion } from "framer-motion";

/** Скляний чип з мікроанімаціями для TopBar */
export default function AnimatedChip({ icon, title, sub, tone="default", className="", ...rest }){
  const tones = {
    default: "bg-white/70 border-slate-200/60 text-slate-800",
    green:   "bg-emerald-50/70 border-emerald-200/70 text-emerald-800",
    blue:    "bg-sky-50/70 border-sky-200/70 text-sky-800",
    amber:   "bg-amber-50/70 border-amber-200/70 text-amber-800",
    red:     "bg-rose-50/70 border-rose-200/70 text-rose-800",
  };
  return (
    <motion.span
      whileHover={{ y: -1, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`inline-flex items-center gap-2 px-3 h-10 rounded-xl border backdrop-blur-md shadow-sm ${tones[tone]||tones.default} ${className}`}
      {...rest}
    >
      {icon && <span className="text-base">{icon}</span>}
      <span className="leading-tight">
        <span className="block text-sm font-semibold">{title}</span>
        {sub && <span className="block text-xs opacity-70 -mt-0.5">{sub}</span>}
      </span>
    </motion.span>
  );
}
