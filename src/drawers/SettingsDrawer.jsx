import React from "react";
import SideDrawer from "../components/SideDrawer";
import { makeBase, pingESP } from "../services/esp";

export default function SettingsDrawer({
  open, onClose, espIP, setEspIP, mockMode, setMockMode,
  lastPing, setLastPing, busy, setBusy,
  tables, relays, setRelays,
  printerIP, setPrinterIP, printerMock, setPrinterMock,
  onTestPrint
}) {
  if (!open) return null;

  const btn = "px-4 py-2 rounded-xl shadow-sm border text-sm font-medium bg-white text-black border-slate-300";

  async function doPing() {
    const base = makeBase(espIP);
    setBusy(true);
    try {
      const res = await pingESP({ baseUrl: base, mock: mockMode });
      setLastPing({ ok: true, at: Date.now(), message: res.via || "OK" });
      alert(`З’єднання OK\n${res.via || ""}`);
    } catch (e) {
      setLastPing({ ok: false, at: Date.now(), message: e.message });
      alert(`Пінг не вдався:\n${e.message}`);
    } finally { setBusy(false); }
  }

  return (
    <SideDrawer title="Налаштування" onClose={onClose}>
      <section className="mb-6">
        <div className="text-sm text-slate-600">ESP8266 IP (http)</div>
        <input type="text" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
               value={espIP} onChange={e => setEspIP(e.target.value.trim())} />
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" className="scale-110" checked={mockMode} onChange={e=>setMockMode(e.target.checked)} />
            Режим без пристрою (mock)
          </label>
          <button className={btn} onClick={doPing} disabled={busy}>Тест з'єднання</button>
          <button className={btn} onClick={() => window.open(makeBase(espIP), '_blank')}>Відкрити в браузері</button>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          {lastPing.at ? (`Результат: ${lastPing.ok ? 'OK' : 'FAIL'} — ${new Date(lastPing.at).toLocaleTimeString()} (${lastPing.message})`) : 'Ще не перевіряли.'}
        </div>
      </section>

      <section className="mb-6">
        <div className="text-sm font-semibold mb-2">Прив’язка «Стіл → канал реле»</div>
        <div className="text-xs text-slate-500 mb-2">Введіть номер каналу для кожного столу (0,1,2,3…).</div>
        <div className="space-y-2">
          {tables.map(t => (
            <div key={t.id} className="flex items-center gap-3">
              <div className="min-w-[120px]">{t.name}</div>
              <input type="number" min={0} step={1}
                     className="w-28 rounded-xl border border-slate-300 px-3 py-2"
                     value={relays[t.id] ?? 0}
                     onChange={e=>{
                       const v = Math.max(0, Math.floor(Number(e.target.value)||0));
                       setRelays(prev => ({ ...prev, [t.id]: v }));
                     }} />
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <div className="text-sm text-slate-600">Принтер чеків (Xprinter LAN)</div>
        <input type="text" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
               placeholder="IP принтера, напр. 192.168.0.200"
               value={printerIP} onChange={e=>setPrinterIP(e.target.value.trim())} />
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" className="scale-110" checked={printerMock} onChange={e=>setPrinterMock(e.target.checked)} />
            Режим без принтера (mock)
          </label>
          <button className={btn} onClick={onTestPrint}>Тестовий чек</button>
        </div>
      </section>
    </SideDrawer>
  );
}
