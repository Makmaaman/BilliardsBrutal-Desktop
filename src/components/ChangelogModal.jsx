// src/components/ChangelogModal.jsx
import React from "react";

function Card({ v }) {
  return (
    <div className="rounded-xl ring-1 ring-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">v{v.version} — {v.title}</div>
        {v.date && <div className="text-xs text-slate-500">{v.date}</div>}
      </div>
      <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
        {(v.items || []).map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}

export default function ChangelogModal({ version, entries, onClose }) {
  return (
    <div className="fixed inset-0 z-[10000] bg-black/30 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200" onClick={e=>e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="font-semibold">Що нового • v{version}</div>
          <button className="text-slate-500 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>
        <div className="px-5 py-4 grid md:grid-cols-[220px,1fr] gap-4">
          <aside className="space-y-1">
            {entries.map(e => (
              <div key={e.version} className="px-3 py-2 rounded-lg text-sm bg-slate-50 text-slate-700">
                <div className="font-medium">v{e.version}</div>
                <div className="text-[11px] text-slate-500">{e.date || ""}</div>
                <div className="text-[12px] mt-1">{e.title}</div>
              </div>
            ))}
          </aside>
          <section className="space-y-6">
            {entries.map(e => <Card key={e.version} v={e} />)}
          </section>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 text-right">
          <button className="h-9 px-4 rounded-lg bg-slate-800 text-white" onClick={onClose}>Закрити</button>
        </div>
      </div>
    </div>
  );
}
