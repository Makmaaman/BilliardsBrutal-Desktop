import React, { useState } from "react";

export default function LoginScreen({ tryLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(e) {
    e.preventDefault();
    const ok = tryLogin(username.trim(), password);
    if (!ok) setError("Невірний логін або пароль");
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-emerald-100 to-slate-300">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 border border-slate-200">
        <div className="text-center mb-4">
          <div className="mx-auto w-12 h-12 rounded-2xl grid place-items-center"
               style={{ background: "linear-gradient(180deg,#10b981,#065f46)", color:"#fff", fontWeight:700 }}>
            DB
          </div>
          <div className="mt-2 text-lg font-semibold">Duna Billiard Club</div>
          <div className="text-xs text-slate-500">Вхід до системи</div>
        </div>
        <label className="block text-sm text-slate-600">Логін</label>
        <input autoFocus value={username} onChange={e=>setUsername(e.target.value)}
               className="mt-1 mb-3 w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="admin" />
        <label className="block text-sm text-slate-600">Пароль</label>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
               className="mt-1 mb-4 w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="••••" />
        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
        <button type="submit" className="w-full px-4 py-2 rounded-xl shadow-sm border bg-black text-white border-black text-sm font-medium">Увійти</button>
        <div className="mt-4 text-xs text-slate-500">Дефолт: admin/admin або marker/1111.</div>
      </form>
    </div>
  );
}
