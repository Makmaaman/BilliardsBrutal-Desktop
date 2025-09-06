// src/components/VersionStrip.jsx
import React from "react";

export default function VersionStrip({ version, tagline, onOpen }) {
  return (
    <div className="mt-8 text-center text-[11px] text-slate-500">
      v{version} • {tagline || "—"} •{" "}
      <button className="underline hover:no-underline" onClick={onOpen}>
        Що нового?
      </button>
    </div>
  );
}
