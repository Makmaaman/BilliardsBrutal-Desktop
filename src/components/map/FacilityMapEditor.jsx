// src/components/map/FacilityMapEditor.jsx
import React, { useRef, useState } from 'react';

export default function FacilityMapEditor({ value, onChange, tables }) {
  const wrapRef = useRef(null);
  const [items, setItems] = useState(value?.items || []);
  const [bgUrl, setBgUrl] = useState(value?.bgUrl || '');

  const addTable = () => {
    const nextId = (items?.length||0) + 1;
    const next = [].concat(items, [{ id: nextId, x: 20 + 40*nextId, y: 20, tableId: null }]);
    setItems(next);
    onChange && onChange({ items: next, bgUrl });
  };

  const onUpload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setBgUrl(reader.result); onChange && onChange({ items, bgUrl: reader.result }); };
    reader.readAsDataURL(f);
  };

  const startDrag = (e, idx) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const shiftX = e.clientX - (rect.left + items[idx].x);
    const shiftY = e.clientY - (rect.top + items[idx].y);

    const move = (ev) => {
      const x = Math.max(0, Math.min(ev.clientX - rect.left - shiftX, rect.width - 60));
      const y = Math.max(0, Math.min(ev.clientY - rect.top - shiftY, rect.height - 60));
      const next = items.slice();
      next[idx] = { ...next[idx], x, y };
      setItems(next);
      onChange && onChange({ items: next, bgUrl });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const updateItemTableId = (itemIndex, tableId) => {
    const next = items.slice();
    next[itemIndex] = { ...next[itemIndex], tableId: tableId };
    setItems(next);
    onChange && onChange({ items: next, bgUrl });
  };


  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="px-3 py-1 rounded-lg border cursor-pointer">
          Завантажити план
          <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
        </label>
        <button onClick={addTable} className="px-3 py-1 rounded-lg border">Додати стіл</button>
      </div>
      <div ref={wrapRef} className="relative w-full h-96 rounded-xl overflow-hidden border">
        {bgUrl && <img src={bgUrl} alt="map" className="absolute inset-0 w-full h-full object-cover" />}
        {items.map((it, idx) => (
          <div key={it.id}
               onMouseDown={(e)=>startDrag(e, idx)}
               className="absolute w-28 h-14 rounded-lg bg-white/85 backdrop-blur text-center flex flex-col justify-center items-center select-none cursor-grab shadow border"
               style={{ left: it.x, top: it.y }}>
                 <div>Елемент #{it.id}</div>
                 <select value={it.tableId || ''} onChange={e => updateItemTableId(idx, e.target.value)} className="text-xs mt-1 w-24" onClick={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}>
                    <option value="">Не вибрано</option>
                    {tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                 </select>
          </div>
        ))}
      </div>
    </div>
  );
}
