// src/components/modals/Settings/MapTab.jsx
import React from 'react';
import FacilityMapEditor from '../../map/FacilityMapEditor';

export default function MapTab({ value, onChange }) {
  return (
    <section className="space-y-3 p-4 rounded-2xl ring-1 ring-slate-200 bg-white/70 backdrop-blur-xl shadow-sm">
      <h3 className="text-lg font-semibold">Карта закладу</h3>
      <p className="text-sm opacity-80">Завантаж фото зали та розташуйте столи для зручнішого налаштування реле.</p>
      <FacilityMapEditor value={value} onChange={onChange} />
    </section>
  );
}