// src/ui/MotionButton.jsx
import React from "react";
import { motion } from "framer-motion";

export default function MotionButton({ children, tone="primary", className="", ...rest }){
  const tones = {
    primary: "bg-emerald-600 text-white",
    sky: "bg-sky-600 text-white",
    ghost: "bg-white border border-slate-300 text-slate-900",
    danger: "bg-rose-600 text-white",
  };
  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      className={`h-10 px-4 rounded-xl shadow-sm ${tones[tone]||tones.primary} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
