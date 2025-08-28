// src/modals/CustomersModal.jsx
import React from "react";
import ModalShell from "../components/ModalShell";
import { api, formatMoney } from "../lib/api";
import { input, tableWrap, table, th, td, btnPrimary, btnGhost, danger } from "../ui/classes";

export default function CustomersModal({ onClose }) {
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  // форма
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [note, setNote] = React.useState("");

  // пошук
  const [q, setQ] = React.useState("");

  // редагування
  const [editId, setEditId] = React.useState(null);
  const [edit, setEdit] = React.useState({ name: "", phone: "", note: "" });

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api("customers:list");
        if (alive) setList(Array.isArray(data) ? data : []);
      } catch (e) {
        if (alive) setErr(e?.message || "Не вдалося завантажити");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function addCustomer() {
    const n = name.trim();
    const p = phone.trim();
    const no = note.trim();
    if (!n) return alert("Вкажіть ім’я");
    try {
      const created = await api("customers:create", { name: n, phone: p, note: no });
      setList(v => [created, ...v]);
      setName(""); setPhone(""); setNote("");
    } catch (e) {
      alert(e?.message || "Не вдалося додати");
    }
  }

  async function removeCustomer(id) {
    if (!confirm("Видалити клієнта?")) return;
    try {
      await api("customers:remove", { id });
      setList(v => v.filter(x => x.id !== id));
    } catch (e) {
      alert(e?.message || "Не вдалося видалити");
    }
  }

  async function saveEdit() {
    try {
      const upd = await api("customers:update", { id: editId, patch: { ...edit } });
      setList(v => v.map(x => x.id === editId ? upd : x));
      setEditId(null);
    } catch (e) {
      alert(e?.message || "Не вдалося зберегти");
    }
  }

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter(c =>
      (c.name || "").toLowerCase().includes(qq) ||
      (c.phone || "").toLowerCase().includes(qq) ||
      (c.note || "").toLowerCase().includes(qq)
    );
  }, [q, list]);

  return (
    <ModalShell title="Клієнтська база" onClose={onClose} size="xl">
      {/* Форма додавання */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <input className={`${input} md:col-span-4`} placeholder="Ім’я" value={name} onChange={e=>setName(e.target.value)} />
        <input className={`${input} md:col-span-4`} placeholder="+380..." value={phone} onChange={e=>setPhone(e.target.value)} />
        <input className={`${input} md:col-span-4`} placeholder="Нотатка" value={note} onChange={e=>setNote(e.target.value)} />
        <div className="md:col-span-12 flex justify-end">
          <button className={btnPrimary} onClick={addCustomer}>Додати</button>
        </div>
      </div>

      {/* Пошук */}
      <input className={input} placeholder="Пошук за ім’ям/телефоном/нотаткою…" value={q} onChange={e=>setQ(e.target.value)} />

      {/* Таблиця */}
      <div className={tableWrap}>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Ім’я</th>
              <th className={th}>Телефон</th>
              <th className={th}>Нотатка</th>
              <th className={th}>Візити</th>
              <th className={th}>Витрачено</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id}>
                <td className={td}>
                  {editId === c.id ? (
                    <input className={input} value={edit.name} onChange={e=>setEdit(s=>({...s, name:e.target.value}))} />
                  ) : (c.name || "")}
                </td>
                <td className={td}>
                  {editId === c.id ? (
                    <input className={input} value={edit.phone} onChange={e=>setEdit(s=>({...s, phone:e.target.value}))} />
                  ) : (c.phone || "")}
                </td>
                <td className={td}>
                  {editId === c.id ? (
                    <input className={input} value={edit.note} onChange={e=>setEdit(s=>({...s, note:e.target.value}))} />
                  ) : (c.note || "")}
                </td>
                <td className={td}>{c.visits ?? 0}</td>
                <td className={td}>{formatMoney ? formatMoney(c.totalSpent ?? 0) : (c.totalSpent ?? 0)}</td>
                <td className={`${td} text-right space-x-2`}>
                  {editId === c.id ? (
                    <>
                      <button className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-3 py-2" onClick={saveEdit}>Зберегти</button>
                      <button className={btnGhost} onClick={()=>setEditId(null)}>Скасувати</button>
                    </>
                  ) : (
                    <>
                      <button className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-3 py-2" onClick={() => { setEditId(c.id); setEdit({ name: c.name || "", phone: c.phone || "", note: c.note || "" }); }}>Редагувати</button>
                      <button className={danger} onClick={() => removeCustomer(c.id)}>Видалити</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr><td className={`${td} text-zinc-500`} colSpan={6}>Немає записів…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button className="rounded-xl bg-zinc-900 text-white px-5 py-2" onClick={onClose}>Готово</button>
      </div>
    </ModalShell>
  );
}
