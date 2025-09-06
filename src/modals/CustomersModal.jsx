// src/modals/CustomersModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";

/* ============ helpers ============ */
const cx = (...a) => a.filter(Boolean).join(" ");
const toUA = (n) => {
  try { return new Intl.NumberFormat("uk-UA").format(Number(n)||0); }
  catch { return String(Number(n)||0); }
};
const initials = (str="") => {
  const s = (str||"").trim();
  if (!s) return "??";
  const [a,b] = s.split(/\s+/);
  return ((a?.[0]||"")+(b?.[0]||"")).toUpperCase() || (a?.[0]||"").toUpperCase() || "??";
};
const phonePretty = (p="") => {
  const s = String(p||"").replace(/[^\d+]/g,"");
  if (!s) return "—";
  if (s.startsWith("+")) return s;
  return s.replace(/^(\d{3})(\d{3})(\d{2})(\d{2})$/, "$1 $2 $3 $4") || s;
};
function download(filename, text){
  const blob = new Blob([text], { type:"text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1200);
}
function parseCSV(text){
  // "name,phone,bonusBalance"
  return text.split(/\r?\n/).map(r=>r.trim()).filter(Boolean).map(line=>{
    const [name="", phone="", bonus=""] = line.split(",").map(s=>s.trim());
    return { name, phone, bonusBalance: Number(bonus||0)||0 };
  });
}

/* ============ icons ============ */
const Icon = {
  Plus:   (p)=>(<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14M5 12h14"/></svg>),
  Upload: (p)=>(<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M7 9l5-5 5 5M12 4v12"/></svg>),
  Download:(p)=>(<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>),
  Pencil: (p)=>(<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>),
  Trash:  (p)=>(<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 6h18M8 6v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6M10 10v8M14 10v8"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>),
  X:      (p)=>(<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>)
};

/* ============ tiny UI ============ */
function BalancePill({ value }){
  const color = value > 0
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : value < 0
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : "bg-slate-50 text-slate-700 ring-slate-200";
  return <span className={cx("px-2 py-0.5 rounded-lg ring-1 text-xs", color)}>{toUA(value)}</span>;
}
function SegBtn({ active, children, onClick, tone="slate" }){
  const on = active ? `bg-${tone}-900 text-white ring-${tone}-900` : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50";
  return <button className={cx("h-8 px-3 rounded-full text-sm ring-1 transition outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50", on)} onClick={onClick}>{children}</button>;
}

/* ============ drawer ============ */
function Drawer({ open, onClose, children }){
  useEffect(()=>{
    const h = (e)=>{ if (e.key==="Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    return ()=>window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className={cx(
      "absolute top-0 right-0 h-full w-full md:w-[460px] transition-transform duration-300 z-[60]",
      open ? "translate-x-0" : "translate-x-full"
    )}>
      <div className="h-full w-full bg-white md:rounded-l-2xl shadow-2xl ring-1 ring-slate-200 overflow-y-auto">
        {children}
      </div>
      {open && <button className="md:hidden absolute inset-0 -z-10" onClick={onClose} aria-label="Close drawer" />}
    </div>
  );
}

/* ============ main modal ============ */
export default function CustomersModal({ onClose }){
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");

  const [q, setQ] = useState("");
  const [sortBy, setSortBy]   = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [balanceFilter, setBalanceFilter] = useState("all");

  const PAGE = 12;
  const [page, setPage] = useState(1);

  const [drawer, setDrawer] = useState({ open:false, saving:false, bonusDelta:"", customer:null });

  async function load(){
    setLoading(true); setErr("");
    try{
      const customers = await api("customers:list");
      setList(Array.isArray(customers) ? customers : []);
    }catch(e){ setErr(e?.message || "Помилка завантаження."); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ load(); }, []);

  const filtered = useMemo(()=>{
    let arr = list.slice();
    const s = (q||"").toLowerCase().trim();
    if (s) {
      arr = arr.filter(c =>
        (c.name||"").toLowerCase().includes(s) ||
        (c.phone||"").toLowerCase().includes(s) ||
        String(c.id||"").toLowerCase().includes(s)
      );
    }
    if (balanceFilter==="positive") arr = arr.filter(c => Number(c.bonusBalance||0) > 0);
    if (balanceFilter==="zero")     arr = arr.filter(c => Number(c.bonusBalance||0) === 0);
    if (balanceFilter==="negative") arr = arr.filter(c => Number(c.bonusBalance||0) < 0);

    arr.sort((a,b)=>{
      const A = sortBy==="name" ? (a.name||"") : sortBy==="phone" ? (a.phone||"") : Number(a.bonusBalance||0);
      const B = sortBy==="name" ? (b.name||"") : sortBy==="phone" ? (b.phone||"") : Number(b.bonusBalance||0);
      if (A<B) return sortDir==="asc" ? -1 : 1;
      if (A>B) return sortDir==="asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [list, q, sortBy, sortDir, balanceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  useEffect(()=>{ if (page>totalPages) setPage(totalPages); }, [totalPages]);
  const pageItems = useMemo(()=>{
    const start = (page-1)*PAGE;
    return filtered.slice(start, start+PAGE);
  }, [filtered, page]);

  function handleExportCsv(){
    const header = ["id","name","phone","bonusBalance"];
    const rows = list.map(c => [
      c.id ?? "",
      (c.name??"").replace(/"/g,'""'),
      (c.phone??"").replace(/"/g,'""'),
      String(Number(c.bonusBalance||0)).replace(",", ".")
    ]);
    const csv = [header, ...rows].map(cols => cols.map(v => `"${v}"`).join(",")).join("\n");
    download(`customers_${new Date().toISOString().slice(0,10)}.csv`, csv);
  }
  async function handleImportCsv(file){
    if (!file) return;
    try{
      const text = await file.text();
      const rows = parseCSV(text);
      if (!rows.length) return alert("Немає рядків для імпорту.");
      if (!confirm(`Імпортувати ${rows.length} запис(ів)?`)) return;
      for (const r of rows){
        try{
          const created = await api("customers:create", { name:r.name||"", phone:r.phone||"" });
          if (r.bonusBalance) await api("customers:bonus:add", { id:created?.id, amount:Number(r.bonusBalance||0) });
        }catch(e){ /* row error ignored */ }
      }
      await load();
      alert("Імпорт завершено.");
    }catch(e){ alert("Помилка імпорту: " + (e?.message||e)); }
  }

  function openNew(){
    setDrawer({ open:true, saving:false, bonusDelta:"", customer:{ id:null, name:"", phone:"", bonusBalance:0 } });
  }
  function openEdit(c){
    setDrawer({
      open:true, saving:false, bonusDelta:"",
      customer:{ id:c.id, name:c.name||"", phone:c.phone||"", bonusBalance:Number(c.bonusBalance||0)||0 }
    });
  }
  const closeDrawer = ()=> setDrawer({ open:false, saving:false, bonusDelta:"", customer:null });

  async function saveCustomer(){
    const c = drawer.customer; if (!c) return;
    if (!c.name && !c.phone) return alert("Вкажіть хоча б ім’я або телефон.");
    setDrawer(d=>({ ...d, saving:true }));
    try{
      if (!c.id) await api("customers:create", { name:c.name||"", phone:c.phone||"" });
      else       await api("customers:update", { id:c.id, name:c.name||"", phone:c.phone||"" });
      await load();
      closeDrawer();
    }catch(e){
      alert("Не вдалося зберегти: " + (e?.message||e));
      setDrawer(d=>({ ...d, saving:false }));
    }
  }
  async function deleteCustomer(c){
    if (!c?.id) return;
    if (!confirm(`Видалити клієнта «${c.name||c.phone||c.id}»?`)) return;
    try{
      await api("customers:delete", { id:c.id });
      await load();
      if (drawer.open && drawer.customer?.id===c.id) closeDrawer();
    }catch(e){ alert("Не вдалося видалити: " + (e?.message||e)); }
  }
  async function applyBonus(sign){
    const c = drawer.customer, val = Number(drawer.bonusDelta||0);
    if (!c?.id || !val) return;
    setDrawer(d=>({ ...d, saving:true }));
    try{
      await api("customers:bonus:add", { id:c.id, amount: sign * Math.abs(val) });
      const fresh = (await api("customers:list")).find(x=>x.id===c.id);
      await load();
      setDrawer(d=>({ ...d, saving:false, bonusDelta:"", customer: fresh || d.customer }));
    }catch(e){
      setDrawer(d=>({ ...d, saving:false }));
      alert("Не вдалося оновити бонуси: " + (e?.message||e));
    }
  }

  const searchRef = useRef(null);
  useEffect(()=>{ try{ searchRef.current?.focus(); }catch{} }, []);

  return (
    <div className="fixed inset-0 z-[12000]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onMouseDown={onClose} />

      {/* трішки вища модалка */}
      <div
        className="relative mx-auto my-3 w-[min(1200px,96vw)] max-h-[94vh] bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden"
        role="dialog" aria-modal="true"
        onMouseDown={(e)=>e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 bg-white/70 backdrop-blur flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-lg font-semibold">Клієнти</div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-200">
              усього: {toUA(list.length)}
            </span>
            {err && <span className="text-xs text-rose-600">• {err}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button className="h-9 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-sm flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50" onClick={openNew}>
              <Icon.Plus/> Додати
            </button>

            <label className="h-9 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-sm flex items-center gap-1 cursor-pointer outline-none focus-within:ring-2 focus-within:ring-emerald-500/50">
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e)=>handleImportCsv(e.target.files?.[0])}/>
              <Icon.Upload/> Імпорт CSV
            </label>

            <button className="h-9 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-sm flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50" onClick={handleExportCsv}>
              <Icon.Download/> Експорт CSV
            </button>

            <button className="h-9 px-3 rounded-xl bg-slate-900 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50" onClick={onClose}>Закрити</button>
          </div>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 md:grid-cols-[320px,1fr]">
          {/* Left pane */}
          <div className="border-r border-slate-200 p-4 space-y-4">
            <div>
              <label className="text-xs text-slate-500">Пошук</label>
              <div className="relative mt-1">
                <input
                  ref={searchRef}
                  className="w-full h-10 pl-9 pr-3 rounded-xl ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500/50 outline-none"
                  placeholder="Ім’я, телефон, ID…"
                  value={q}
                  onChange={(e)=>{ setQ(e.target.value); setPage(1); }}
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60 pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
                </svg>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Сортування</label>
                <select className="mt-1 w-full h-10 px-2 rounded-xl ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-emerald-500/50" value={sortBy} onChange={(e)=>setSortBy(e.target.value)}>
                  <option value="name">За ім’ям</option>
                  <option value="phone">За телефоном</option>
                  <option value="balance">За балансом</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Порядок</label>
                <select className="mt-1 w-full h-10 px-2 rounded-xl ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-emerald-500/50" value={sortDir} onChange={(e)=>setSortDir(e.target.value)}>
                  <option value="asc">Зростання</option>
                  <option value="desc">Спадання</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500">Баланс</label>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <SegBtn active={balanceFilter==="all"}       onClick={()=>{ setBalanceFilter("all"); setPage(1); }}>Всі</SegBtn>
                <SegBtn active={balanceFilter==="positive"}  onClick={()=>{ setBalanceFilter("positive"); setPage(1); }} tone="emerald">Позитивний</SegBtn>
                <SegBtn active={balanceFilter==="zero"}      onClick={()=>{ setBalanceFilter("zero"); setPage(1); }}>Нульовий</SegBtn>
                <SegBtn active={balanceFilter==="negative"}  onClick={()=>{ setBalanceFilter("negative"); setPage(1); }} tone="rose">Негативний</SegBtn>
              </div>
            </div>

            <div className="text-xs text-slate-500 pt-2">Знайдено: <b>{toUA(filtered.length)}</b></div>
          </div>

          {/* Right pane – list */}
          <div className="p-4">
            <div className="rounded-2xl ring-1 ring-slate-200 overflow-hidden bg-white relative">
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[56%]" />
                  <col className="w-[28%]" />
                  <col className="w-[16%]" />
                </colgroup>

                <thead className="bg-slate-50 sticky top-0 z-[5]">
                  <tr className="text-left text-slate-500">
                    <th className="px-4 py-2 text-sm font-medium">Ім’я</th>
                    <th className="px-4 py-2 text-sm font-medium">Телефон</th>
                    <th className="px-4 py-2 text-sm font-medium text-right">Дії</th>
                  </tr>
                </thead>

                <tbody>
                  {loading && (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">Завантаження…</td></tr>
                  )}

                  {!loading && pageItems.length===0 && (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">Нічого не знайдено</td></tr>
                  )}

                  {!loading && pageItems.map(c => (
                    <tr key={c.id} className="even:bg-slate-50/40">
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="mt-0.5 w-9 h-9 rounded-full bg-gradient-to-br from-emerald-100 to-sky-100 ring-1 ring-slate-200 grid place-items-center text-[11px] text-slate-700 shrink-0">
                            {initials(c.name || c.phone || c.id)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{c.name || "—"}</div>
                            <div className="text-[11px] text-slate-500 truncate">ID: {c.id}</div>
                            {/* БОНУСИ ПЕРЕНЕСЕНО СЮДИ */}
                            <div className="mt-1">
                              <BalancePill value={Number(c.bonusBalance||0)} />
                              <span className="ml-2 text-[11px] text-slate-500">1 бонус = 1 грн</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 align-middle">
                        {c.phone ? <a className="text-slate-800 hover:underline whitespace-nowrap" href={`tel:${c.phone}`}>{phonePretty(c.phone)}</a> : <span className="text-slate-400">—</span>}
                      </td>

                      <td className="px-4 py-3 align-middle">
                        <div className="flex justify-end gap-2 whitespace-nowrap">
                          <button
                            className="h-8 px-2 rounded-lg border border-slate-300 hover:bg-slate-50 flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                            onClick={()=>openEdit(c)}
                          >
                            <Icon.Pencil/><span className="hidden sm:inline">Редагувати</span>
                          </button>
                          <button
                            className="h-8 px-2 rounded-lg border border-slate-300 hover:bg-slate-50 flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
                            onClick={()=>deleteCustomer(c)}
                          >
                            <Icon.Trash/><span className="hidden sm:inline">Видалити</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between text-sm">
                <div className="text-slate-500">Сторінка {page} з {totalPages}</div>
                <div className="flex items-center gap-2">
                  <button className="h-8 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                          disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>← Назад</button>
                  <button className="h-8 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                          disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Вперед →</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Drawer */}
        <Drawer open={drawer.open} onClose={closeDrawer}>
          <div className="relative">
            <div className="sticky top-0 z-10 px-4 py-3 border-b border-slate-200 bg-white/80 backdrop-blur flex items-center justify-between">
              <div className="text-sm font-semibold">
                {drawer.customer?.id ? "Редагувати клієнта" : "Новий клієнт"}
              </div>
              <div className="flex items-center gap-2">
                <button className="h-9 px-3 rounded-lg bg-slate-900 text-white disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                        disabled={drawer.saving}
                        onClick={saveCustomer}>
                  {drawer.saving ? "Збереження…" : "Зберегти"}
                </button>
                <button className="h-9 w-9 grid place-items-center rounded-lg border border-slate-300 hover:bg-slate-50 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                        onClick={closeDrawer} aria-label="Закрити">
                  <Icon.X/>
                </button>
              </div>
            </div>

            <form className="p-4 space-y-5" onSubmit={(e)=>{ e.preventDefault(); saveCustomer(); }}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-100 to-sky-100 ring-1 ring-slate-200 grid place-items-center text-xs text-slate-700">
                  {initials(drawer.customer?.name || drawer.customer?.phone || drawer.customer?.id)}
                </div>
                {!!drawer.customer?.id && (
                  <div className="text-[11px] text-slate-500">ID: {drawer.customer.id}</div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-500">Ім’я</label>
                <input
                  className="w-full h-10 px-3 rounded-xl ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500/50 outline-none"
                  value={drawer.customer?.name ?? ""}
                  onChange={(e)=>setDrawer(d=>({ ...d, customer:{ ...d.customer, name:e.target.value } }))}
                  placeholder="Ім’я клієнта"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-500">Телефон</label>
                <input
                  className="w-full h-10 px-3 rounded-xl ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500/50 outline-none"
                  value={drawer.customer?.phone ?? ""}
                  onChange={(e)=>setDrawer(d=>({ ...d, customer:{ ...d.customer, phone:e.target.value } }))}
                  placeholder="+380…"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-500">Бонусний баланс</label>
                <div className="flex items-center gap-2">
                  <BalancePill value={Number(drawer.customer?.bonusBalance||0)} />
                  <span className="text-xs text-slate-500">1 бонус = 1 грн</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-500">Нарахувати / Списати</label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    className="w-36 h-10 px-2 rounded-xl ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500/50 outline-none"
                    value={drawer.bonusDelta}
                    onChange={(e)=>setDrawer(d=>({ ...d, bonusDelta:e.target.value }))}
                    placeholder="Сума"
                  />
                  <button type="button"
                          className="h-10 px-3 rounded-xl bg-emerald-600 text-white disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                          disabled={drawer.saving || !drawer.customer?.id || !Number(drawer.bonusDelta)}
                          onClick={()=>applyBonus(+1)}
                  >+ Нарахувати</button>
                  <button type="button"
                          className="h-10 px-3 rounded-xl bg-rose-600 text-white disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50"
                          disabled={drawer.saving || !drawer.customer?.id || !Number(drawer.bonusDelta)}
                          onClick={()=>applyBonus(-1)}
                  >− Списати</button>
                </div>
              </div>
            </form>
          </div>
        </Drawer>
      </div>
    </div>
  );
}
