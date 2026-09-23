// src/components/Kpi.jsx
import React from "react";

export default function Kpi({ title, value }) {
  return (
    <div className="rounded-xl ring-1 ring-slate-200 px-4 py-3 bg-white">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
