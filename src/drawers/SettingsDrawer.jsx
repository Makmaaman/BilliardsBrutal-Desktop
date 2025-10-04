
import React from "react";

function isValidIPv4(ip){
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(ip||'').trim());
}

export default function SettingsDrawer(props){
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
  } = props || {};

  const [tab, setTab] = React.useState("controllers");

  const [online, setOnline] = React.useState({});
  const bases = React.useMemo(()=>{
    const out = {};
    (controllers||[]).forEach(c=>{
      const ip = (c?.ip||"").trim();
      if(ip && isValidIPv4(ip)) out[c.id] = "http://"+ip;
    });
    return out;
  }, [controllers]);

  async function pingCtrl(id){
    const base = bases[id];
    if(!base) return false;
    try {
      const ctrl = {};
      if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) ctrl.mode = 'no-cors';
      const r = await Promise.race([
        fetch(base + "/ping", ctrl),
        new Promise((_,rej)=> setTimeout(()=>rej(new Error("TO")), 1200))
      ]);
      return !!r;
    } catch { return false; }
  }

  React.useEffect(()=>{
    let stop = false;
    async function tick(){
      const ids = (controllers||[]).filter(x=>x && x.enabled!==false).map(x=>x.id);
      const result = {};
      for(const id of ids){
        result[id] = await pingCtrl(id);
      }
      if(!stop) setOnline(result);
    }
    tick();
    const t = setInterval(tick, 7000);
    return ()=>{ stop=true; clearInterval(t); };
  }, [controllers, bases]);

  function updateController(idx, patch){
    setControllers(arr => {
      const next = [...(arr||[])];
      next[idx] = { ...(next[idx]||{}), ...patch };
      return next;
    });
  }
  function addController(){
    setControllers(arr => {
      const id = "ctrl-"+Math.random().toString(36).slice(2,8);
      return [...(arr||[]), { id, name: "Контролер", ip: "", channels: 8, enabled: true }];
    });
  }
  function removeController(idx){
    setControllers(arr => (arr||[]).filter((_,i)=> i!==idx));
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex justify-end z-50">
      <div className="w-[860px] max-w-[95vw] h-full bg-white shadow-xl p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Налаштування</div>
          <button onClick={onClose} className="h-9 px-4 rounded-lg border">Закрити</button>
        </div>

        <div className="flex gap-2 mb-3">
          <button className={"h-9 px-4 rounded-xl border "+(tab==='general'?'bg-slate-900 text-white border-slate-900':'bg-white')} onClick={()=>setTab('general')}>Загальні</button>
          <button className={"h-9 px-4 rounded-xl border "+(tab==='printer'?'bg-slate-900 text-white border-slate-900':'bg-white')} onClick={()=>setTab('printer')}>Принтер</button>
          <button className={"h-9 px-4 rounded-xl border "+(tab==='controllers'?'bg-slate-900 text-white border-slate-900':'bg-white')} onClick={()=>setTab('controllers')}>Контролери</button>
          <button className={"h-9 px-4 rounded-xl border "+(tab==='tables'?'bg-slate-900 text-white border-slate-900':'bg-white')} onClick={()=>setTab('tables')}>Столи</button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pr-2 space-y-4">
          {tab === 'controllers' && (
            <section className="space-y-3 p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">ESP контролери</div>
                <div className="flex flex-wrap gap-2">
                  <button className="h-9 px-3 rounded-xl border" onClick={addController}>Додати</button>
                </div>
              </div>

              {(controllers||[]).length === 0 && (
                <div className="text-xs text-slate-500">Немає контролерів. Натисніть <b>Додати</b>, щоб створити перший.</div>
              )}

              <div className="space-y-2">
                {(controllers||[]).map((c, idx)=>(
                  <div
                    key={c.id || idx}
                    className="grid grid-cols-1 gap-2 md:grid-cols-12 md:gap-3 p-2 rounded-xl border border-slate-200"
                  >
                    <div className="md:col-span-3 min-w-0">
                      <label className="text-xs text-slate-500">Назва</label>
                      <input className="w-full h-9 px-3 rounded-xl border border-slate-300"
                             value={c?.name || ""}
                             onChange={e=>updateController(idx, { name: e.target.value })} />
                    </div>

                    <div className="md:col-span-3 min-w-0">
                      <label className="text-xs text-slate-500">IP</label>
                      <input className="w-full h-9 px-3 rounded-xl border border-slate-300 font-mono text-xs break-words"
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
                <div className="text-sm font-semibold">Принтер</div>
                <label className="block text-xs text-slate-500">IP принтера</label>
                <input className="w-full h-10 px-3 rounded-xl border border-slate-300" value={printerIP || ""} onChange={e=>setPrinterIP(e.target.value)} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!printerMock} onChange={e=>setPrinterMock(e.target.checked)} />
                  Режим «mock» (без реального принтера)
                </label>
                <div>
                  <button className="px-4 py-2 rounded-xl border text-sm bg-white text-slate-800 border-slate-300"
                          onClick={onTestPrint}>Тестовий чек</button>
                </div>
              </section>

              <section className="space-y-3 p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
                <div className="text-sm font-semibold">Підказка</div>
                <div className="text-xs text-slate-600">
                  Якщо принтер напряму по IP — вкажіть адресу й вимкніть mock.<br/>
                  Якщо принтер відсутній — залиште mock увімкненим.
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
