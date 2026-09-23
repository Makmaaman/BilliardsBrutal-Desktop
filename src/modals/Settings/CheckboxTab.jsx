// src/modals/Settings/CheckboxTab.jsx — налаштування Checkbox ПРРО
// Відновлено з бандлу v3.9.2.

import React, { useState } from "react";
import { getCheckboxSettings, saveCheckboxSettings, signIn } from "../../services/checkbox";

const inputCls =
  "w-full h-9 px-3 rounded-lg bg-slate-800 border border-emerald-500/30 text-emerald-100 text-sm focus:outline-none focus:border-emerald-400";
const eyeCls =
  "absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-200/50 hover:text-emerald-200 text-base leading-none";

export default function CheckboxTab({ settings, onChange }) {
  const s = settings || getCheckboxSettings();
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState("");

  function set(key, value) {
    const next = saveCheckboxSettings({ [key]: value });
    onChange?.(next);
  }

  async function testConnection() {
    if (!s.licenseKey || !s.login) {
      setTestMsg("❌ Вкажіть ключ ліцензії та логін касира.");
      return;
    }
    if (!s.password && !s.pinCode) {
      setTestMsg("❌ Вкажіть пароль або пін-код касира.");
      return;
    }
    setTesting(true);
    setTestMsg("");
    try {
      const auth = await signIn(s.login, s.password, s.licenseKey, s.pinCode);
      if (auth?.access_token) {
        const who = auth.full_name || auth.login || s.login;
        setTestMsg(`✅ Підключення успішне. Касир: ${who}`);
      } else {
        setTestMsg("⚠️ Відповідь отримано, але токен відсутній.");
      }
    } catch (e) {
      setTestMsg("❌ " + (e?.message || String(e)));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/60 border border-violet-500/30">
        <div>
          <div className="text-emerald-100 font-medium">Фіскалізація через Checkbox</div>
          <div className="text-sm text-emerald-200/60 mt-0.5">ПРРО — програмний реєстратор розрахункових операцій</div>
        </div>
        <button
          onClick={() => set("enabled", !s.enabled)}
          className={[
            "relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0",
            s.enabled ? "bg-violet-500" : "bg-slate-600",
          ].join(" ")}
        >
          <span
            className={[
              "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200",
              s.enabled ? "translate-x-6" : "translate-x-0",
            ].join(" ")}
          />
        </button>
      </div>

      {s.enabled && (
        <>
          <div className="space-y-1.5">
            <label className="text-sm text-emerald-200/80 block">Ключ ліцензії каси (X-License-Key)</label>
            <input
              type="text"
              value={s.licenseKey || ""}
              onChange={(e) => set("licenseKey", e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className={inputCls + " font-mono"}
            />
            <p className="text-xs text-emerald-200/50">checkbox.ua → Каси → ваша каса → Ключ ліцензії</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-emerald-200/80 block">Логін касира</label>
            <input
              type="text"
              value={s.login || ""}
              onChange={(e) => set("login", e.target.value)}
              placeholder="Логін касира"
              className={inputCls}
            />
            <p className="text-xs text-emerald-200/50">checkbox.ua → Касири → ваш касир → Логін</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-emerald-200/80 block">
              Пароль касира
              <span className="ml-1.5 text-xs text-emerald-200/40">(встановлюється в checkbox.ua)</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={s.password || ""}
                onChange={(e) => set("password", e.target.value)}
                placeholder="Пароль"
                className={inputCls + " pr-10"}
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className={eyeCls}>
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-emerald-200/80 block">
              Пін-код касира
              <span className="ml-1.5 text-xs text-emerald-200/40">(альтернатива паролю)</span>
            </label>
            <div className="relative">
              <input
                type={showPin ? "text" : "password"}
                value={s.pinCode || ""}
                onChange={(e) => set("pinCode", e.target.value)}
                placeholder="123456789"
                className={inputCls + " pr-10"}
              />
              <button type="button" onClick={() => setShowPin((v) => !v)} className={eyeCls}>
                {showPin ? "🙈" : "👁"}
              </button>
            </div>
            <p className="text-xs text-emerald-200/50">
              checkbox.ua → Касири → ваш касир → Пін-код. Якщо вказано пароль — використовується він.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={testConnection}
              disabled={testing || !s.login || !s.licenseKey}
              className="h-9 px-4 rounded-lg bg-violet-700/60 border border-violet-500/40 text-violet-100 text-sm hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? "Перевіряю…" : "Перевірити підключення"}
            </button>
            {testMsg && <span className="text-sm text-emerald-200/80">{testMsg}</span>}
          </div>

          <div className="p-3 rounded-xl bg-amber-900/20 border border-amber-500/20 text-xs text-amber-200/70 space-y-1.5">
            <div className="font-semibold text-amber-200/90">Як підключити Checkbox:</div>
            <div>
              1. Зареєструйтесь на <span className="text-amber-200">checkbox.ua</span>
            </div>
            <div>
              2. Створіть ПРРО (касу) → скопіюйте <span className="text-amber-200">Ключ ліцензії</span>
            </div>
            <div>
              3. Перейдіть у <span className="text-amber-200">Касири → Новий касир</span> → задайте логін, пароль і
              пін-код
            </div>
            <div>4. Введіть ключ ліцензії та дані касира вище, натисніть «Перевірити підключення»</div>
            <div className="pt-1 border-t border-amber-500/20 text-amber-200/50">
              Вхід з логіном+паролем: <span className="text-amber-200/70">/cashier/signin</span>.
              <br />
              Вхід лише з пін-кодом: <span className="text-amber-200/70">/cashier/signinPinCode</span> (пароль не
              потрібен).
            </div>
          </div>
        </>
      )}
    </div>
  );
}
