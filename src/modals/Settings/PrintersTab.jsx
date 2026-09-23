// src/modals/Settings/PrintersTab.jsx

import React, { useEffect, useState } from "react";
import {
  loadPrinterSettings,
  savePrinterSettings,
} from "../../utils/printerSettings";
import { scanPrinters, quickTestPrint } from "../../services/print";
import { input as inputClass, select as selectClass } from "../../ui/classes";

export default function PrintersTab() {
  const [settings, setSettings] = useState(() => loadPrinterSettings());
  const [scanning, setScanning] = useState(false);
  const [printers, setPrinters] = useState([]);

  // Щоб при відкритті модалки підхоплювалися актуальні дані з localStorage
  useEffect(() => {
    setSettings(loadPrinterSettings());
  }, []);

  function updateSettings(patch) {
    const next = { ...settings, ...patch };
    setSettings(next);
    savePrinterSettings(next);
  }

  async function handleScan() {
    try {
      setScanning(true);
      const found = await scanPrinters();
      setPrinters(found || []);
    } catch (e) {
      console.error("scanPrinters error", e);
      setPrinters([]);
    } finally {
      setScanning(false);
    }
  }

  async function handleTest() {
    if (!settings.ip) {
      alert("Спочатку вкажіть IP принтера.");
      return;
    }
    try {
      const ok = await quickTestPrint(settings.ip);
      if (!ok) alert("Не вдалося надрукувати тест. Перевірте IP та живлення принтера.");
    } catch (e) {
      console.error("quickTestPrint error", e);
      alert("Помилка друку: " + (e?.message || e));
    }
  }

  async function handleCodepageTest() {
    if (!settings.ip) {
      alert("Спочатку вкажіть IP принтера.");
      return;
    }
    try {
      const res = await window.printers?.printCodepageTest?.(settings.ip);
      if (!res?.ok) {
        alert("Не вдалося надрукувати тест: " + (res?.error || "невідома помилка"));
        return;
      }
      alert(
        "Надруковано список кодових таблиць.\n\n" +
          "Знайдіть рядок, де українські літери читаються правильно, " +
          "і впишіть його номер n у поле «Кодова таблиця принтера», " +
          "а кодування (CP1251/CP866/CP1125) виберіть те саме, що в тому рядку."
      );
    } catch (e) {
      alert("Помилка друку: " + (e?.message || e));
    }
  }

  function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      updateSettings({ logoBase64: ev.target.result });
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    updateSettings({ logoBase64: null });
  }

  return (
    <div className="p-4 space-y-4">
      {/* IP принтера */}
      <div>
        <label className="font-semibold">IP принтера</label>
        <input
          type="text"
          className={`${inputClass} mt-1`}
          value={settings.ip}
          onChange={(e) => updateSettings({ ip: e.target.value })}
          placeholder="192.168.0.xxx"
        />
      </div>

      {/* Кнопки: скан + тест */}
      <div className="flex gap-2">
        <button
          onClick={handleScan}
          className="bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded disabled:opacity-60"
          disabled={scanning}
        >
          {scanning ? "Сканування..." : "Сканувати принтери"}
        </button>

        <button
          onClick={handleTest}
          className="bg-green-600 hover:bg-green-500 px-3 py-2 rounded disabled:opacity-60"
          disabled={!settings.ip}
        >
          Тестовий друк
        </button>
      </div>

      {/* Знайдені принтери */}
      {printers.length > 0 && (
        <div className="bg-gray-900 p-3 rounded space-y-2 max-h-48 overflow-auto">
          {printers.map((p) => (
            <div
              key={p.ip}
              className="cursor-pointer hover:bg-gray-700 p-2 rounded flex justify-between items-center"
              onClick={() => updateSettings({ ip: p.ip })}
            >
              <span>{p.ip}</span>
              <span className="text-xs text-gray-400">
                {p.model || "RAW9100"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Кодування */}
      <div>
        <label className="font-semibold">Кодування ESC/POS</label>
        <select
          className={`${selectClass} mt-1`}
          value={settings.encoding}
          onChange={(e) => updateSettings({ encoding: e.target.value })}
        >
          <option value="CP1251">CP1251 — рекомендовано (є і, ї, є, ґ)</option>
          <option value="CP1125">CP1125 (українська DOS)</option>
          <option value="CP866">CP866 — без «і» та «ґ»</option>
          <option value="UTF-8">UTF-8</option>
          <option value="ASCII">ASCII</option>
        </select>
        <div className="text-xs text-gray-400 mt-1">
          CP866 не містить українських «і» та «ґ» — вони друкуються як «?».
          Якщо замість тексту «кракозябри», змініть номер кодової таблиці нижче.
        </div>
      </div>

      {/* Номер кодової таблиці принтера (ESC t n) */}
      <div>
        <label className="font-semibold">Кодова таблиця принтера (ESC t)</label>
        <input
          type="number"
          min={0}
          max={255}
          placeholder="авто"
          className={`${inputClass} mt-1`}
          value={settings.codepageId ?? ""}
          onChange={(e) => {
            const v = e.target.value.trim();
            updateSettings({ codepageId: v === "" ? null : Number(v) });
          }}
        />
        <div className="text-xs text-gray-400 mt-1">
          Порожньо = авто (CP1251 → 46, CP866 → 17). У різних моделей номери
          відрізняються — натисніть кнопку нижче, надрукується список варіантів.
        </div>
        <button
          className="mt-2 px-3 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm"
          onClick={handleCodepageTest}
        >
          Підібрати кодову таблицю (друк тесту)
        </button>
      </div>

      {/* Відрізання паперу */}
      <div className="flex items-center gap-2">
        <input
          id="autoCut"
          type="checkbox"
          checked={settings.autoCut !== false}
          onChange={(e) => updateSettings({ autoCut: e.target.checked })}
        />
        <label htmlFor="autoCut" className="font-semibold">
          Відрізати папір після чека
        </label>
      </div>

      {/* Довжина чеку */}
      <div>
        <label className="font-semibold">
          Довжина чеку (порожні рядки в кінці)
        </label>
        <input
          type="number"
          min={1}
          max={40}
          className={`${inputClass} mt-1`}
          value={settings.receiptExtraLines}
          onChange={(e) =>
            updateSettings({ receiptExtraLines: Number(e.target.value) || 1 })
          }
        />
      </div>

      {/* Логотип */}
      <div className="space-y-2">
        <label className="font-semibold">Логотип для чеку</label>

        {settings.logoBase64 ? (
          <div className="space-y-2">
            <img
              src={settings.logoBase64}
              alt="logo"
              className="max-h-32 object-contain bg-white p-2 rounded"
            />
            <button
              onClick={removeLogo}
              className="bg-red-600 hover:bg-red-500 px-3 py-1 rounded"
            >
              Видалити логотип
            </button>
          </div>
        ) : (
          <input type="file" accept="image/*" onChange={handleLogoUpload} />
        )}
      </div>

      {/* Ширина логотипу */}
      <div>
        <label className="font-semibold">Ширина логотипу (px)</label>
        <input
          type="number"
          min={150}
          max={384}
          className={`${inputClass} mt-1`}
          value={settings.logoWidth}
          onChange={(e) =>
            updateSettings({ logoWidth: Number(e.target.value) || 300 })
          }
        />
        <p className="text-xs text-gray-400 mt-1">
          Для 58мм принтера максимум ~384 px. 300 px — оптимально.
        </p>
      </div>
    </div>
  );
}
