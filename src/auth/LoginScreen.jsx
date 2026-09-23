import React, { useState, useEffect } from "react";

export default function LoginScreen({ tryLogin, tryCard }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Магнітна картка (USB-HID рідер як клавіатура): швидкий ввід + Enter => авто-вхід
  useEffect(() => {
    if (typeof window === "undefined") return;
    let buf = "";
    let lastTs = 0;
    let startTs = 0;
    const GAP_MS = 100;

    function parseMagData(s) {
      if (!s) return "";
      s = s.trim();
      const t1 = s.match(/^%B(\d{4,19})\^/);
      if (t1) return t1[1];
      const t2 = s.match(/^;?(\d{4,32})=?.*$/);
      if (t2) return t2[1];
      const t3 = s.match(/^(\d{4,32})$/);
      if (t3) return t3[1];
      return "";
    }

    function onKeyDown(e) {
      const now = Date.now();
      if (now - lastTs > GAP_MS) { buf = ""; startTs = now; }
      lastTs = now;

      if (e.key === "Enter") {
        const elapsed = Math.max(1, now - startTs);
        const avg = buf.length ? (elapsed / buf.length) : 9999;
        const fastEnough = avg < 35 && buf.length >= 6;
        const cardId = fastEnough ? parseMagData(buf) : "";
        buf = "";
        if (cardId) {
          const ok = typeof tryCard === "function" && tryCard(cardId);
          if (!ok) setError("Картку не розпізнано");
        }
        return;
      }
      if (e.key && e.key.length === 1) {
        buf += e.key;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tryCard]);

  function submit(e) {
    e.preventDefault();
    const ok = tryLogin(username.trim(), password);
    if (!ok) setError("Невірний логін або пароль");
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-emerald-100 to-slate-300">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 border border-slate-200">
        <div className="text-center mb-5">
          <div className="text-2xl font-bold text-slate-800">Duna Billiard Club</div>
          <div className="text-sm text-slate-500">Вхід до системи</div>
        </div>
        <label className="block text-sm text-slate-600">Логін</label>
        <input autoFocus value={username} onChange={e=>setUsername(e.target.value)}
               className="mt-1 mb-3 w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="admin" />
        <label className="block text-sm text-slate-600">Пароль</label>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
               className="mt-1 mb-4 w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="••••" />
        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
        <button type="submit" className="w-full px-4 py-2 rounded-xl bg-slate-900 text-white border border-slate-900 text-sm font-medium">Увійти</button>
        <div className="mt-4 text-xs text-slate-500">Дефолт: admin/admin або marker/1111. Можна входити карткою.</div>
      </form>
    </div>
  );
}
