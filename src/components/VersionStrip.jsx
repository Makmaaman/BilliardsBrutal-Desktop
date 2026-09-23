// src/components/VersionStrip.jsx
import React from "react";

export default function VersionStrip({ version, tagline, onOpen }) {
  return (
    <div className="mt-10 pb-2 text-center text-[11px] text-emerald-200/40">
      v{version} • {tagline || "—"} •{" "}
      <button className="underline hover:no-underline" onClick={onOpen}>
        Що нового?
      </button>
    </div>
  );
}
