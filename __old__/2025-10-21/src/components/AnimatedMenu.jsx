// src/components/AnimatedMenu.jsx
import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

/** Drop-in menu panel (visual only). API сумісний з твоїм MenuPortal у App.jsx */
export default function AnimatedMenu({ anchorRect, onClose, items=[] }){
  if (!anchorRect) return null;
  const vw = window.innerWidth, vh = window.innerHeight;
  const width = 320, m = 12;
  const top = Math.min(anchorRect.bottom + 10, vh - 360);
  const left = Math.min(Math.max(anchorRect.right - width, m), vw - width - m);

  return createPortal(
    <>
      <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex: 999 }} />
      <AnimatePresence>
        <motion.div
          key="menu"
          initial={{ opacity: 0, y: -8, scale: .98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: .98 }}
          transition={{ duration: .18 }}
          style={{ position:"fixed", top, left, width, zIndex: 1000 }}
          className="rounded-2xl border border-slate-200/70 bg-white/90 backdrop-blur-md shadow-2xl p-2"
        >
          <div className="grid gap-1">
            {items.map((it, i)=>(
              <motion.button
                key={i}
                onClick={()=>{ it.onClick?.(); onClose?.(); }}
                className="h-11 px-3 rounded-xl text-left hover:bg-slate-50 flex items-center gap-3"
                whileHover={{ x: 2 }}
              >
                {it.icon && <span className="w-5 h-5 opacity-80">{it.icon}</span>}
                <div className="flex-1">
                  <div className="text-sm font-medium">{it.title}</div>
                  {it.sub && <div className="text-[12px] text-slate-500 -mt-0.5">{it.sub}</div>}
                </div>
                <span className="text-slate-400">⟶</span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </>,
    document.body
  );
}
