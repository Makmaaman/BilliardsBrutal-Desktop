// src/modals/PromosModal.jsx
import React from "react";
import ModalShell from "../components/ModalShell";
import { api, formatMoney } from "../lib/api";
import { input, select, tableWrap, table, th, td, btnPrimary, danger } from "../ui/classes";

export default function PromosModal({ onClose }) {
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  // форма створення
  const [title, setTitle] = React.useState("");
  const [type, setType]   = React.useState("percent"); // percent | fixed
  const [value, setValue] = React.useState(10);
  const [minAmount, setMinAmount] = React.useState(0);
  const [active, setActive] = React.useState(true);
  const [validFrom, setValidFrom] = React.useState(""); // y-m-d
  const [validTo, setValidTo]     = React.useState("");

  // редагування
  const [editId, setEditId] = React.useState(null);
  const [edit, setEdit] = React.useState({});

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api("promos:list");
        if (alive) setList(Array.isArray(data) ? data : []);
      } catch (e) {
        if (alive) setErr(e?.message || "Не вдалося завантажити");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function addPromo() {
    const rec = {
      title: String(title).trim(),
      type,
      value: Number(value) || 0,
      minAmount: Number(minAmount) || 0,
      active: !!active,
      validFrom: validFrom || "",
      validTo: validTo || "",
    };
    if (!rec.title) return alert("Вкажіть назву");
    try {
      const created = await api("promos:create", rec);
      setList(v => [created, ...v]);
      setTitle(""); setType("percent"); setValue(10); setMinAmount(0); setActive(true); setValidFrom(""); setValidTo("");
    } catch (e) {
      alert(e?.message || "Не вдалося додати");
    }
  }

  async function removePromo(id) {
    if (!confirm("Видалити акцію?")) return;
    try {
      await api("promos:remove", { id });
      setList(v => v.filter(x => x.id !== id));
    } catch (e) {
      alert(e?.message || "Не вдалося видалити");
    }
  }

  async function saveEdit() {
    try {
      const upd = await api("promos:update", { id: editId, patch: { ...edit } });
      setList(v => v.map(x => x.id === editId ? upd : x));
      setEditId(null);
    } catch (e) {
      alert(e?.message || "Не вдалося зберегти");
    }
  }

  return (
    <ModalShell title="Акції" onClose={onClose} size="xl">
      {/* Форма створення */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <input className={`${input} md:col-span-4`} placeholder="Назва акції" value={title} onChange={e=>setTitle(e.target.value)} />
        <select className={`${select} md:col-span-2`} value={type} onChange={e=>setType(e.target.value)}>
          <option value="percent">Відсоток %</option>
          <option value="fixed">Фіксована сума</option>
        </select>
        <input className={`${input} md:col-span-2`} type="number" placeholder={type === "percent" ? "% знижки" : "Сума ₴"} value={value} onChange={e=>setValue(e.target.value)} />
        <input className={`${input} md:col-span-2`} type="number" placeholder="Мін. сума ₴" value={minAmount} onChange={e=>setMinAmount(e.target.value)} />
        <div className="md:col-span-2 flex items-center gap-2">
          <input id="promo_active" type="checkbox" className="h-5 w-5 rounded border-zinc-300" checked={active} onChange={e=>setActive(e.target.checked)} />
          <label htmlFor="promo_active" className="text-[15px] text-zinc-700">Активна</label>
        </div>
        <input className={`${input} md:col-span-3`} type="date" value={validFrom} onChange={e=>setValidFrom(e.target.value)} />
        <input className={`${input} md:col-span-3`} type="date" value={validTo} onChange={e=>setValidTo(e.target.value)} />
        <div className="md:col-span-12 flex justify-end">
          <button className={btnPrimary} onClick={addPromo}>Додати</button>
        </div>
      </div>

      {/* Таблиця */}
      <div className={tableWrap}>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Назва</th>
              <th className={th}>Тип</th>
              <th className={th}>Значення</th>
              <th className={th}>Мін. ₴</th>
              <th className={th}>Активна</th>
              <th className={th}>Період</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {list.map(p => (
              <tr key={p.id}>
                <td className={td}>
                  {editId === p.id ? (
                    <input className={input} value={edit.title} onChange={e=>setEdit(s=>({...s, title:e.target.value}))} />
                  ) : p.title}
                </td>
                <td className={td}>
                  {editId === p.id ? (
                    <select className={select} value={edit.type} onChange={e=>setEdit(s=>({...s, type:e.target.value}))}>
                      <option value="percent">%</option>
                      <option value="fixed">₴</option>
                    </select>
                  ) : (p.type === "fixed" ? "₴" : "%")}
                </td>
                <td className={td}>
                  {editId === p.id ? (
                    <input className={input} type="number" value={edit.value} onChange={e=>setEdit(s=>({...s, value:e.target.value}))} />
                  ) : (p.type === "fixed" ? formatMoney?.(p.value || 0) : `${p.value || 0}%`)}
                </td>
                <td className={td}>
                  {editId === p.id ? (
                    <input className={input} type="number" value={edit.minAmount} onChange={e=>setEdit(s=>({...s, minAmount:e.target.value}))} />
                  ) : formatMoney?.(p.minAmount || 0)}
                </td>
                <td className={td}>
                  {editId === p.id ? (
                    <select className={select} value={edit.active ? "1" : "0"} onChange={e=>setEdit(s=>({...s, active:e.target.value === "1"}))}>
                      <option value="1">Так</option>
                      <option value="0">Ні</option>
                    </select>
                  ) : (p.active ? "Так" : "Ні")}
                </td>
                <td className={td}>
                  {editId === p.id ? (
                    <div className="grid grid-cols-2 gap-2">
                      <input className={input} type="date" value={edit.validFrom || ""} onChange={e=>setEdit(s=>({...s, validFrom:e.target.value}))} />
                      <input className={input} type="date" value={edit.validTo || ""} onChange={e=>setEdit(s=>({...s, validTo:e.target.value}))} />
                    </div>
                  ) : (
                    <span>{(p.validFrom || "—")} → {(p.validTo || "—")}</span>
                  )}
                </td>
                <td className={`${td} text-right space-x-2`}>
                  {editId === p.id ? (
                    <>
                      <button className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-3 py-2" onClick={saveEdit}>Зберегти</button>
                      <button className="rounded-xl bg-zinc-100 text-zinc-700 px-3 py-2" onClick={()=>setEditId(null)}>Скасувати</button>
                    </>
                  ) : (
                    <>
                      <button className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-3 py-2" onClick={() => { setEditId(p.id); setEdit({ title:p.title||"", type:p.type||"percent", value:p.value||0, minAmount:p.minAmount||0, active:!!p.active, validFrom:p.validFrom||"", validTo:p.validTo||"" }); }}>Редагувати</button>
                      <button className={danger} onClick={() => removePromo(p.id)}>Видалити</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!list.length && (<tr><td className={`${td} text-zinc-500`} colSpan={7}>Немає акцій…</td></tr>)}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button className="rounded-xl bg-zinc-900 text-white px-5 py-2" onClick={onClose}>Готово</button>
      </div>
    </ModalShell>
  );
}
