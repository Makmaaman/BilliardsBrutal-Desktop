import React, { useEffect, useMemo, useState } from "react";
import ModalShell from "../components/ModalShell";

export default function CuesModal({ onClose, cues=[], onCreate, onUpdate, onRemove }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    setRows((cues || []).map(c => ({ ...c, _dirty:false, _isNew:false })));
  }, [cues]);

  function addRow(){
    setRows(prev => prev.concat([{ id: null, name: "", pricePerHour: 0, _dirty:true, _isNew:true }]));
    setTimeout(() => {
      const el = document.querySelector("#cues-list-end");
      if (el) el.scrollIntoView({ behavior:"smooth", block:"end" });
    }, 20);
  }

  function patch(idx, patch){
    setRows(prev => {
      const next = prev.slice();
      const cur = { ...(next[idx] || {}) };
      next[idx] = { ...cur, ...patch, _dirty: true };
      return next;
    });
  }

  async function saveRow(idx){
    const r = rows[idx];
    const payload = { name: String(r.name||"").trim(), pricePerHour: Number(r.pricePerHour||0) };
    if (!payload.name) { alert("Вкажіть назву кия"); return; }
    if (payload.pricePerHour < 0) { alert("Ціна за годину не може бути відʼємною"); return; }

    try {
      if (r._isNew || !r.id) {
        const res = await onCreate?.(payload);
        // оновиться з батьківського стану через проп cues
      } else {
        await onUpdate?.(r.id, payload);
      }
    } catch(e){
      console.error(e);
      alert("Помилка збереження: " + (e?.message || e));
    }
  }

  async function removeRow(idx){
    const r = rows[idx];
    if (!r._isNew && r.id) {
      if (!confirm("Видалити кий «" + (r.name || "без назви") + "»?")) return;
      try { await onRemove?.(r.id); } catch(e){ alert("Помилка видалення: " + (e?.message || e)); }
    } else {
      setRows(prev => prev.filter((_,i) => i !== idx));
    }
  }

  return (
    <ModalShell
      title="Оренда київ"
      onClose={onClose}
      footer={
        <div className="flex justify-between w-full items-center">
          <div className="text-xs text-slate-500">Створіть довідник київ, щоб привʼязувати їх до гравців на столах.</div>
          <div className="flex gap-2">
            <button className="h-9 px-3 rounded-lg border" onClick={addRow}>Додати кий</button>
            <button className="h-9 px-4 rounded-lg bg-slate-800 text-white" onClick={onClose}>Готово</button>
          </div>
        </div>
      }
    >
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-12 text-xs font-medium text-slate-500 px-2 mb-2">
          <div className="col-span-6">Назва</div>
          <div className="col-span-3">Ціна, грн/год</div>
          <div className="col-span-3 text-right">Дії</div>
        </div>

        <div className="space-y-2">
          {rows.length === 0 && (
            <div className="text-sm text-slate-500 px-2">Поки що немає жодного кия. Натисніть <b>Додати кий</b>.</div>
          )}

          {rows.map((r, idx) => (
            <div key={(r.id || "new-"+idx)} className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl border bg-white">
              <div className="col-span-6">
                <input
                  className="w-full h-9 px-3 rounded-xl border border-slate-300"
                  placeholder="Напр., Predator BK"
                  value={r.name || ""}
                  onChange={e => patch(idx, { name: e.target.value })}
                />
              </div>
              <div className="col-span-3">
                <input
                  type="number" min={0} step={1}
                  className="w-full h-9 px-3 rounded-xl border border-slate-300"
                  value={Number(r.pricePerHour||0)}
                  onChange={e => patch(idx, { pricePerHour: Number(e.target.value||0) })}
                />
              </div>
              <div className="col-span-3 flex justify-end gap-2">
                <button className="h-9 px-3 rounded-lg border"
                        onClick={() => saveRow(idx)}>
                  Зберегти
                </button>
                <button className="h-9 px-3 rounded-lg border border-rose-300 text-rose-600"
                        onClick={() => removeRow(idx)}>
                  Видалити
                </button>
              </div>
            </div>
          ))}
          <div id="cues-list-end" />
        </div>
      </div>
    </ModalShell>
  );
}
