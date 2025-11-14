import React, { useEffect, useMemo, useState } from "react";
import ModalShell from "../components/ModalShell";
import FacilityMapEditor from '../components/map/FacilityMapEditor';

import ReceiptTab from "./Settings/ReceiptTab";
const TabBtn = ({active, onClick, children}) => (
  <button
    onClick={onClick}
    className={[
      "h-9 px-4 rounded-xl text-sm font-medium border",
      active ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-white text-slate-800 border-slate-300 hover:bg-slate-50"
    ].join(" ")}
  >{children}</button>
);

function isValidIPv4(ip){
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(ip||'').trim());
}

export default function SettingsModal(props) {
  const {
    onClose = () => {},
    // general
    espIP, setEspIP = () => {},
    mockMode, setMockMode = () => {},
    // printer
    printerIP, setPrinterIP = () => {},
    printerMock, setPrinterMock = () => {},
    onTestPrint = () => {},
    // controllers & tables
    controllers = [], setControllers = () => {},
    tables = [],
    tableCtrl = {}, setTableCtrl = () => {},
    relays = {}, setRelays = () => {},
    relayIPs = {}, setRelayIPs = () => {},
    // bonuses
    bonusEarnPct, setBonusEarnPct = () => {},
    bonusPerHour, setBonusPerHour = () => {},
    // facility map
    facilityMap, setFacilityMap = () => {},
  } = props || {};

  const [tab, setTab] = useState("map");

  // ---- Connectivity check ----
  const [online, setOnline] = useState({});           // {ctrlId: boolean}
  const [fallbackOnline, setFallbackOnline] = useState(null); // null | boolean
  const [checking, setChecking] = useState(false);

  const bases = useMemo(()=>{
    const out = {};
    (controllers||[]).forEach(c=>{
      const ip = (c?.ip||"").trim();
      if(ip && isValidIPv4(ip)) out[c.id] = "http://"+ip;
    });
    return out;
  }, [controllers]);

  async function pingURL(url){
    try {
      const opt = {};
      if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) opt.mode = 'no-cors';
      const r = await Promise.race([
        fetch(url, opt),
        new Promise((_,rej)=> setTimeout(()=>rej(new Error("TO")), 1200))
      ]);
      return !!r;
    } catch { return false; }
  }
  async function pingCtrl(id){
    const base = bases[id];
    if(!base) return false;
    return pingURL(base + "/ping");
  }
  async function pingEspIP(){
    const ip = String(espIP||"").trim();
    if(!ip || !isValidIPv4(ip)) return null;
    return pingURL("http://"+ip+"/ping");
  }

  async function recheckAll(){
    setChecking(true);
    const ids = (controllers||[]).filter(x=>x && x.enabled!==false).map(x=>x.id);
    const result = {};
    for(const id of ids){
      result[id] = await pingCtrl(id);
    }
    setOnline(result);
    const espOk = await pingEspIP();
    setFallbackOnline(espOk);
    setChecking(false);
  }

  useEffect(()=>{
    let stop = false;
    async function tick(){
      const ids = (controllers||[]).filter(x=>x && x.enabled!==false).map(x=>x.id);
      const result = {};
      for(const id of ids){
        result[id] = await pingCtrl(id);
      }
      if(!stop) setOnline(result);
      const espOk = await pingEspIP();
      if(!stop) setFallbackOnline(espOk);
    }
    tick();
    const t = setInterval(tick, 7000);
    return ()=>{ stop=true; clearInterval(t); };
  }, [controllers, bases, espIP]);

  // ---- CRUD for controllers ----
  function updateController(idx, patch){
    setControllers(arr => {
      const next = [].concat(arr || []);
      const curr = { ...(next[idx]||{}) };
      const merged = { ...curr, ...patch };
      if (curr.isNew) delete merged.isNew;
      next[idx] = merged;
      return next;
    });
  }
  function addController(){
    setControllers(arr => {
      const id = "ctrl-"+Math.random().toString(36).slice(2,8);
      return [].concat(arr || [], [{ id, name: "Контролер", ip: "", channels: 8, enabled: true, isNew: true }]);
    });
    setTimeout(()=>{
      const el = document.querySelector("#controllers-list-end");
      if(el) el.scrollIntoView({behavior:"smooth", block:"end"});
    }, 30);
  }
  function removeController(idx){
    setControllers(arr => (arr||[]).filter((_,i)=> i!==idx));
  }

  const anyOnline = Object.values(online||{}).some(Boolean) || !!fallbackOnline;

  // ============== ПРИНТЕР: сканер/тест RAW ==============
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState([]); // [{ip, kind, ports:{raw9100, ipp, lpd}}]
  const [scanMsg, setScanMsg] = useState("");
  const [manualIP, setManualIP] = useState("");

  async function scanPrinters(){
    setFinding(true); setScanMsg("Сканую мережу…"); setFound([]);
    try {
      const list = await window.printers?.scan?.({}) || [];
      setFound(Array.isArray(list) ? list : []);
      setScanMsg(!list?.length ? "Нічого не знайдено" : "");
    } catch(e){
      setScanMsg("Помилка: " + (e?.message || String(e)));
    } finally { setFinding(false); }
  }
  async function probeIP(){
    const ip = (manualIP || "").trim();
    if(!isValidIPv4(ip)) { setScanMsg("Вкажіть коректний IP (IPv4)."); return; }
    setFinding(true); setScanMsg("Перевіряю IP…");
    try {
      const res = await window.printers?.probeIp?.(ip);
      if (res?.ok && res?.probe) {
        setFound([{ ip, kind: res.probe.kind || "unknown", ports: res.probe.ports || {} }]);
        setScanMsg("");
      } else {
        setFound([]);
        setScanMsg("Портів для друку не знайдено на цьому IP.");
      }
    } catch(e) {
      setFound([]);
      setScanMsg("Помилка перевірки: " + (e?.message || String(e)));
    } finally { setFinding(false); }
  }
  async function testRaw(){
    const ip = (printerIP || "").trim();
    if(!isValidIPv4(ip)) { alert("Спочатку оберіть/введіть коректний IP принтера."); return; }
    const r = await window.printers?.testRaw?.(ip);
    if (r?.ok) alert("RAW:9100 тест → OK (принтер прийняв дані)");
    else alert("RAW:9100 тест не вдався: " + (r?.error || "невідомо"));
  }

  return (
    <ModalShell
      title="Налаштування"
      onClose={onClose}
      footer={<div className="flex justify-between w-full items-center">
        <div className="text-xs text-slate-500">
          {mockMode ? <span className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 ring-1 ring-sky-200">Тестовий режим увімкнено</span> : null}
        </div>
        <div className="flex justify-end gap-2">
          <button className="h-9 px-3 rounded-lg border" onClick={recheckAll}>
            {checking ? "Перевіряю…" : "Перевірити зараз"}
          </button>
          {!mockMode && (
            <button className="h-9 px-3 rounded-lg border bg-slate-800 text-white" onClick={()=>setMockMode(true)}>
              Увімкнути тестовий режим
            </button>
          )}
          <button className="h-9 px-4 rounded-lg bg-slate-900 text-white" onClick={onClose}>Готово</button>
        </div>
      </div>}
    >
      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        <TabBtn active={tab==='map'} onClick={()=>setTab('map')}>Карта закладу</TabBtn>
        <TabBtn active={tab==='receipt'} onClick={()=>setTab('receipt')}>Чек</TabBtn>
        <TabBtn active={tab==='controllers'} onClick={()=>setTab('controllers')}>Контролери</TabBtn>
        <TabBtn active={tab==='tables'} onClick={()=>setTab('tables')}>Столи</TabBtn>
        <TabBtn active={tab==='general'}
          
 onClick={()=>setTab('general')}>Загальні</TabBtn>
        <TabBtn active={tab==='printer'} onClick={()=>setTab('printer')}>Принтер</TabBtn>
      </div>
        {tab === 'receipt' && (
              <ReceiptTab />
            )}
      {/* BODY */}
      <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden pr-1 space-y-6">
        {tab === 'map' && (
          <section className="space-y-4">
              <FacilityMapEditor value={facilityMap} onChange={setFacilityMap} tables={tables}/>
          </section>
        )}
        
        {tab === 'controllers' && (
          <section className="space-y-4">
            {/* Overall status banner */}
            <div className={
              "p-3 rounded-xl ring-1 "+
              (anyOnline ? "bg-emerald-50 ring-emerald-200 text-emerald-700" : "bg-amber-50 ring-amber-200 text-amber-700")
            }>
              {anyOnline ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    Підключення знайдено. Онлайн: {Object.values(online||{}).filter(Boolean).length}{' '}
                    / {(controllers||[]).filter(c=>c?.enabled!==false).length}
                    {fallbackOnline ? " (є звʼязок за ESP IP)" : ""}
                  </div>
                  <div className="flex gap-2">
                    <button className="h-8 px-3 rounded-lg border" onClick={recheckAll}>Оновити статус</button>
                    {mockMode && (
                      <button className="h-8 px-3 rounded-lg border" onClick={()=>setMockMode(false)}>Вимкнути тестовий режим</button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Немає підключення до ESP-реле.</div>
                  <div className="text-xs">
                    Переконайтесь у коректності IP-адрес контролерів{espIP ? ` або fallback ESP IP: ${espIP}` : ""}.
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="h-8 px-3 rounded-lg border" disabled={checking} onClick={recheckAll}>
                      {checking ? "Перевіряю…" : "Перевірити ще раз"}
                    </button>
                    {!mockMode && (
                      <button className="h-8 px-3 rounded-lg border bg-slate-900 text-white" onClick={()=>setMockMode(true)}>
                        Увімкнути тестовий режим
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">ESP контролери</div>
              <div className="flex flex-wrap gap-2">
                <button className="h-9 px-3 rounded-xl border" onClick={addController}>Додати контролер</button>
              </div>
            </div>

            {/* List */}
            {(controllers||[]).length === 0 && (
              <div className="text-xs text-slate-500">Немає контролерів. Натисніть <b>Додати контролер</b>, щоб створити перший.</div>
            )}

            <div className="space-y-2" id="controllers-list">
              {(controllers||[]).map((c, idx)=>(
                <div
                  key={c.id || idx}
                  className={
                    "grid grid-cols-1 gap-2 md:grid-cols-12 md:gap-3 p-3 rounded-xl border transition-colors "+
                    (c.isNew ? "border-amber-300 ring-1 ring-amber-200 bg-amber-50" : "border-slate-200 bg-white")
                  }
                >
                  <div className="md:col-span-3 min-w-0">
                    <label className="text-xs text-slate-500">Назва</label>
                    <input className="w-full h-9 px-3 rounded-xl border border-slate-300"
                           placeholder="Напр., Контролер зал 1"
                           value={c?.name || ""}
                           onChange={e=>updateController(idx, { name: e.target.value })} />
                  </div>

                  <div className="md:col-span-3 min-w-0">
                    <label className="text-xs text-slate-500">IP</label>
                    <input className="w-full h-9 px-3 rounded-xl border border-slate-300 font-mono text-xs break-words"
                           placeholder="192.168.0.10"
                           value={c?.ip || ""}
                           onChange={e=>updateController(idx, { ip: e.target.value })} />
                  </div>

                  <div className="md:col-span-2 min-w-0">
                    <label className="text-xs text-slate-500">К-ть каналів</label>
                    <input className="w-full h-9 px-3 rounded-xl border border-slate-300"
                           type="number" min={1} max={32}
                           value={Number(c?.channels ?? 8)}
                           onChange={e=>updateController(idx, { channels: Number(e.target.value)||8 })} />
                  </div>

                  <div className="md:col-span-2 min-w-0">
                    <label className="text-xs text-slate-500">Статус</label>
                    <div className={"h-9 px-3 rounded-xl border flex items-center truncate "+(online[c.id]?"border-emerald-300 bg-emerald-50 text-emerald-700":"border-slate-300 text-slate-500")}>
                      {online[c.id] ? "online" : "offline"}
                    </div>
                  </div>

                  <div className="md:col-span-2 min-w-0">
                    <label className="text-xs text-slate-500">Дії</label>
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
                        <input type="checkbox" checked={c?.enabled!==false} onChange={e=>updateController(idx, { enabled: e.target.checked })} />
                        Увімкнено
                      </label>
                      <button className="h-8 px-3 rounded-xl border" onClick={()=>pingCtrl(c.id).then(ok=> setOnline(o=>({...o, [c.id]: ok})))}>Ping</button>
                      <button className="h-8 px-3 rounded-xl border border-rose-300 text-rose-600" onClick={()=>removeController(idx)}>Видалити</button>
                    </div>
                  </div>
                </div>
              ))}
              <div id="controllers-list-end" />
            </div>
          </section>
        )}

        {tab === 'tables' && (
          <section className="space-y-3 p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
            <div className="text-sm font-semibold mb-2">Столи → контролер та канал</div>
            {(tables||[]).map(t => {
              const cid = tableCtrl?.[t.id] || (controllers?.[0]?.id || "");
              const ctrl = (controllers||[]).find(c => c.id === cid) || (controllers||[])[0];
              return (
                <div key={t.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 items-center">
                  <div className="md:col-span-3 text-sm min-w-0">{t.name || `Стіл ${t.id}`}</div>
                  <div className="md:col-span-3 min-w-0">
                    <label className="text-xs text-slate-500">Контролер</label>
                    <select className="w-full h-9 px-3 rounded-xl border border-slate-300"
                            value={cid}
                            onChange={e=> setTableCtrl(o => ({ ...o, [t.id]: e.target.value }))}>
                      {(controllers||[]).filter(x=>x && x.enabled!==false).map(c => (
                        <option key={c.id} value={c.id}>{c.name || c.id}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2 min-w-0">
                    <label className="text-xs text-slate-500">Канал</label>
                    <input className="w-full h-9 px-3 rounded-xl border border-slate-300" type="number" min={0} max={32}
                           value={Number(relays?.[t.id] ?? 0)}
                           onChange={e=> setRelays(o => ({ ...o, [t.id]: Number(e.target.value)||0 }))} />
                  </div>
                  <div className="md:col-span-2 min-w-0">
                    <label className="text-xs text-slate-500">IP</label>
                    <div className="h-9 px-3 rounded-xl border border-slate-300 flex items-center text-xs break-all">
                      {ctrl?.ip || "—"}
                    </div>
                  </div>
                  <div className="md:col-span-2 min-w-0">
                    <label className="text-xs text-slate-500">Override IP</label>
                    <input className="w-full h-9 px-3 rounded-xl border border-slate-300" type="text"
                           value={relayIPs?.[t.id] || ""}
                           onChange={e=> setRelayIPs(o => ({ ...o, [t.id]: e.target.value }))} />
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {tab === 'general' && (
          <div className="grid md:grid-cols-2 gap-6">
            <section className="space-y-3 p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
              <div className="text-sm font-semibold">ESP контролер</div>
              <label className="block text-xs text-slate-500">IP-адреса (фолбек)</label>
              <input className="w-full h-10 px-3 rounded-xl border border-slate-300" value={espIP || ""} onChange={e=>setEspIP(e.target.value)} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!mockMode} onChange={e=>setMockMode(e.target.checked)} />
                Працювати в режимі «mock» (без реального обладнання)
              </label>
            </section>

            <section className="space-y-3 p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
              <div className="text-sm font-semibold">Бонуси</div>
              <label className="block text-xs text-slate-500">% від нетто</label>
              <input className="w-full h-10 px-3 rounded-xl border border-slate-300" type="number" min={0} step={0.5} value={Number(bonusEarnPct ?? 0)} onChange={e=>setBonusEarnPct(Number(e.target.value)||0)} />
              <label className="block text-xs text-slate-500">Грн/год (накопичення)</label>
              <input className="w-full h-10 px-3 rounded-xl border border-slate-300" type="number" min={0} step={1} value={Number(bonusPerHour ?? 0)} onChange={e=>setBonusPerHour(Number(e.target.value)||0)} />
            </section>
          </div>
        )}

        {tab === 'printer' && (
          <div className="grid md:grid-cols-2 gap-6">
            <section className="space-y-3 p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
              <div className="text-sm font-semibold">Принтер (RAW:9100)</div>
              <label className="block text-xs text-slate-500">IP принтера</label>
              <div className="flex gap-2">
                <input className="w-full h-10 px-3 rounded-xl border border-slate-300 font-mono"
                       placeholder="192.168.1.126"
                       value={printerIP || ""}
                       onChange={e=>setPrinterIP(e.target.value)} />
                <button className="px-3 rounded-xl border" onClick={testRaw}>Тест RAW</button>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!printerMock} onChange={e=>setPrinterMock(e.target.checked)} />
                Режим «mock» (без реального принтера)
              </label>

              <div className="flex items-center gap-2">
                <button className="px-4 py-2 rounded-xl border text-sm bg-white text-slate-800 border-slate-300"
                        onClick={onTestPrint}>Тестовий чек (App)</button>
              </div>
            </section>

            <section className="space-y-3 p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
              <div className="text-sm font-semibold">Пошук принтерів у мережі</div>

              <div className="flex gap-2">
                <button className="h-10 px-3 rounded-xl border" onClick={scanPrinters} disabled={finding}>
                  {finding ? "Сканую…" : "Сканувати мережу"}
                </button>
                <input className="h-10 px-3 rounded-xl border border-slate-300 font-mono w-[180px]"
                       placeholder="Перевірити IP"
                       value={manualIP}
                       onChange={e=>setManualIP(e.target.value)} />
                <button className="h-10 px-3 rounded-xl border" onClick={probeIP} disabled={finding}>Перевірити</button>
              </div>

              {scanMsg && <div className="text-xs text-slate-600">{scanMsg}</div>}

              <div className="max-h-48 overflow-auto divide-y divide-slate-100 rounded-lg border">
                {(found||[]).map((p)=>(
                  <div key={p.ip} className="flex items-center justify-between px-3 py-2 bg-white">
                    <div className="text-sm">
                      <div className="font-mono">{p.ip}</div>
                      <div className="text-xs text-slate-500">
                        {p.kind?.toUpperCase() || "unknown"} • RAW:{String(p?.ports?.raw9100)} IPP:{String(p?.ports?.ipp)} LPD:{String(p?.ports?.lpd)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="h-8 px-3 rounded-lg border" onClick={()=>setPrinterIP(p.ip)}>Вибрати</button>
                      <button className="h-8 px-3 rounded-lg border" onClick={async()=>{
                        const r = await window.printers?.testRaw?.(p.ip);
                        alert(r?.ok ? "RAW:9100 тест → OK" : ("Помилка: " + (r?.error || "невідомо")));
                      }}>Тест RAW</button>
                    </div>
                  </div>
                ))}
                {!found?.length && !scanMsg && (
                  <div className="px-3 py-2 text-sm text-slate-500 bg-white">Натисніть «Сканувати мережу» або «Перевірити»</div>
                )}
              </div>

              <div className="text-xs text-slate-600">
                Підказка: XPrinter по Wi-Fi зазвичай підтримує RAW:9100. Якщо RAW недоступний — перевірте, що ПК і принтер в одній підмережі та на принтері не вимкнений RAW-порт.
              </div>
            </section>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
