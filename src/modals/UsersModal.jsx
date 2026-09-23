import React, { useState, useEffect } from "react";
import ModalShell from "../components/ModalShell";

export default function UsersModal({ users, me, onClose, onAdd, onRemove, onResetPwd, onBindCard, onUnbindCard }) {
  const [login, setLogin] = useState("");
  const [pwd, setPwd]     = useState("");
  const [role, setRole]   = useState("marker");
  const [newPwd, setNewPwd] = useState("");
  const [captureFor, setCaptureFor] = useState(null);

  // Зчитування картки для прив'язки
  useEffect(() => {
    if (!captureFor) return;
    let buf = ""; let lastTs = 0; let startTs = 0;
    const GAP = 100;
    const parseMag = (s) => {
      if (!s) return "";
      s = s.trim();
      const a = s.match(/^%B(\d{4,19})\^/); if (a) return a[1];
      const b = s.match(/^;?(\d{4,32})=?.*$/); if (b) return b[1];
      const c = s.match(/^(\d{4,32})$/); return c ? c[1] : "";
    };
    const onKey = (e) => {
      const now = Date.now();
      if (now - lastTs > GAP) { buf = ""; startTs = now; }
      lastTs = now;
      if (e.key === "Enter") {
        const elapsed = Math.max(1, now - startTs);
        const avg = buf.length ? (elapsed / buf.length) : 9999;
        const fast = avg < 35 && buf.length >= 6;
        const id = fast ? parseMag(buf) : "";
        buf = "";
        if (id && onBindCard) onBindCard(captureFor, id);
        setCaptureFor(null);
        return;
      }
      if (e.key && e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [captureFor, onBindCard]);

  return (
    <ModalShell title="Користувачі" onClose={onClose} containerStyle={{ width: "1040px", maxWidth: "92vw", height: "760px", maxHeight: "86vh" }} footer={
      <div className="text-right">
        <button className="h-9 px-4 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500" onClick={onClose}>Готово</button>
      </div>
    }>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mb-4 p-4 bg-slate-800/40 rounded-xl border border-emerald-500/20">
        <div>
          <label className="block text-xs text-emerald-200 mb-1">Логін</label>
          <input value={login} onChange={e=>setLogin(e.target.value)} className="w-full border border-slate-600 bg-slate-900/60 text-emerald-50 rounded-lg px-3 py-2 placeholder:text-slate-400"/>
        </div>
        <div>
          <label className="block text-xs text-emerald-200 mb-1">Пароль</label>
          <input value={pwd} onChange={e=>setPwd(e.target.value)} className="w-full border border-slate-600 bg-slate-900/60 text-emerald-50 rounded-lg px-3 py-2 placeholder:text-slate-400"/>
        </div>
        <div>
          <label className="block text-xs text-emerald-200 mb-1">Роль</label>
          <select value={role} onChange={e=>setRole(e.target.value)} className="w-full border border-slate-600 bg-slate-900/60 text-emerald-50 rounded-lg px-3 py-2">
            <option value="marker">marker</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <div className="text-right">
          <button className="h-9 px-4 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                  onClick={()=>{ if(login && pwd){ onAdd && onAdd({ username:login, password:pwd, role }); setLogin(""); setPwd(""); } }}>
            Додати
          </button>
        </div>
      </div>

      <div className="divide-y divide-emerald-500/20 border border-emerald-500/30 rounded-xl overflow-hidden bg-slate-800/30">
        {users.map((u)=> (
          <div key={u.username} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="min-w-[200px]">
              <div className="font-medium text-emerald-50">
                {u.username}{u.cardId ? ` (карта: ${u.cardId})` : ""}{u.username === me ? " • ви" : ""}
              </div>
              <div className="text-xs text-emerald-300/70">роль: {u.role}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <input placeholder="новий пароль" value={newPwd} onChange={e=>setNewPwd(e.target.value)}
                     className="h-9 px-3 rounded-lg border border-slate-600 bg-slate-900/60 text-emerald-50 placeholder:text-slate-400"/>
              <button className="h-9 px-3 rounded-lg bg-slate-700 text-white hover:bg-slate-600"
                      onClick={()=>{ if(newPwd){ onResetPwd && onResetPwd(u.username, newPwd); setNewPwd(""); } }}>
                Змінити пароль
              </button>
              <button
                className="h-9 px-3 rounded-lg bg-rose-600 text-white disabled:opacity-50 hover:bg-rose-500"
                onClick={()=>onRemove && onRemove(u.username)}
                disabled={u.username==="admin" || u.username===me}
                title={u.username==="admin" ? "admin видаляти не можна" : (u.username===me ? "Не можна видалити поточного користувача" : "")}
              >
                Видалити
              </button>
              <button
                className="h-9 px-3 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                onClick={()=>setCaptureFor(u.username)}
                title="Прив'язати картку"
              >Прив'язати картку</button>
              <button
                className="h-9 px-3 rounded-lg bg-slate-600 text-white hover:bg-slate-500"
                onClick={()=>onUnbindCard && onUnbindCard(u.username)}
                title="Відв'язати картку"
              >Зняти</button>
            </div>
          </div>
        ))}
      </div>

      {captureFor && (
        <div className="mt-3 p-3 rounded-lg border border-amber-400/50 bg-amber-500/20 text-amber-200">
          Проведіть картку для користувача <b>{captureFor}</b>…
        </div>
      )}
    </ModalShell>
  );
}
