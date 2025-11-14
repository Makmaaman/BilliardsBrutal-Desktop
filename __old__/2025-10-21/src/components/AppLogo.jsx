// src/components/AppLogo.jsx
import React from "react";

/** Purely visual logo with a soft glow — no logic inside */
export default function AppLogo({ size = 32, glow = false, className = "" }) {
  const s = size;
  return (
    <div className={"relative " + className} style={{ width: s, height: s }} aria-label="Duna Billiard Club" title="Duna Billiard Club">
      {glow && (
        <div
          className="absolute inset-0 rounded-full blur-md"
          style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(16,185,129,0.55), rgba(16,185,129,0) 70%)" }}
          aria-hidden
        />
      )}
      <svg width={s} height={s} viewBox="0 0 48 48" className="relative select-none">
        <defs>
          <linearGradient id="felt" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10b981"/>
            <stop offset="100%" stopColor="#059669"/>
          </linearGradient>
          <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#b45309"/>
            <stop offset="100%" stopColor="#92400e"/>
          </linearGradient>
        </defs>
        {/* cue stick */}
        <rect x="8" y="21" width="32" height="4" rx="2" fill="url(#wood)"/>
        {/* ball */}
        <circle cx="34" cy="23" r="8" fill="url(#felt)" />
        <circle cx="34" cy="23" r="5" fill="white" opacity="0.9"/>
        <text x="34" y="25" textAnchor="middle" fontFamily="ui-sans-serif" fontSize="7" fill="#111" opacity="0.8">8</text>
      </svg>
    </div>
  );
}
