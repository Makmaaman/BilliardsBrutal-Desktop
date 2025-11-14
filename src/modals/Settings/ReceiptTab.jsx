import React, { useEffect, useMemo, useState } from "react";

const LS_RECEIPT_FORMAT = "bb_receipt_format_v1";
const LS_RECEIPT_WIDTH  = "bb_receipt_width_v1";
const LS_RECEIPT_STYLE  = "bb_receipt_style_v1";

const DEFAULT_TEMPLATE = [
  "{{title}}",
  "Дата: {{date}} {{time}}",
  "Стіл: {{table}}  Оператор: {{operator}}",
  "------------------------------",
  "{{items}}",
  "------------------------------",
  "СУМА: {{total}}",
  "",
  "Дякуємо за візит!"
].join("\n");

const DEFAULT_STYLE = { title: "Більярдний клуб", fontSize: 14, lineHeight: 1.35, align: "left" };

function lsGet(key, fallback){ try{const raw=localStorage.getItem(key); return raw?JSON.parse(raw):fallback;}catch(e){return fallback;} }
function lsSet(key, val){ try{localStorage.setItem(key, JSON.stringify(val));}catch(e){} }
function clamp(n, min, max){ n = Number(n)||0; return Math.min(max, Math.max(min, n)); }

function renderTemplate(tpl, data){
  const itemsBlock = Array.isArray(data.items) ? data.items.join("\n") : "";
  let out = String(tpl || "").replaceAll("{{items}}", itemsBlock);
  ["title","date","time","table","operator","total"].forEach(k => {
    const re = new RegExp("{{\\s*"+k+"\\s*}}","g");
    out = out.replace(re, String(data[k] ?? ""));
  });
  return out;
}

export default function ReceiptTab(){
  const [template, setTemplate] = useState(() => lsGet(LS_RECEIPT_FORMAT, DEFAULT_TEMPLATE));
  const [width, setWidth]       = useState(() => lsGet(LS_RECEIPT_WIDTH, 42));
  const [style, setStyle]       = useState(() => lsGet(LS_RECEIPT_STYLE, DEFAULT_STYLE));

  useEffect(() => { lsSet(LS_RECEIPT_FORMAT, template); }, [template]);
  useEffect(() => { lsSet(LS_RECEIPT_WIDTH, width); }, [width]);
  useEffect(() => { lsSet(LS_RECEIPT_STYLE, style); }, [style]);

  const testData = useMemo(() => {
    const now = new Date(); const pad = (n)=> String(n).padStart(2,"0");
    return {
      title: style.title || "Більярдний клуб",
      date: `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      table: "№2",
      operator: "Адміністратор",
      items: ["Гра (1:20)       250.00","Оренда кия x2     60.00","Напої             80.00"],
      total: "390.00"
    };
  }, [style.title]);

  const rendered = useMemo(() => renderTemplate(template, testData), [template, testData]);

  function onStyleChange(key, val){
    const next = { ...style, [key]: val };
    if (key === "fontSize") next.fontSize = clamp(val, 10, 22);
    if (key === "lineHeight") next.lineHeight = Math.max(1, Number(val)||1);
    setStyle(next);
  }
  function onWidthChange(e){ setWidth(Number(e?.target?.value ?? width) || 42); }

  function handleTestPrint(){
    const cols = Number(width)||42, chW=8, px = cols*chW;
    const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
      body{margin:0;padding:20px;background:#f5f5f5}
      .paper{width:${px}px;margin:0 auto;background:#fff;padding:16px;border:1px solid #ddd}
      pre{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;
          font-size:${Number(style.fontSize)||14}px;line-height:${Number(style.lineHeight)||1.35};
          white-space:pre-wrap;word-break:break-word}
      .title{text-align:${style.align||"left"};font-weight:600;margin-bottom:8px}
    </style></head><body>
      <div class="paper"><div class="title">${testData.title}</div><pre>${rendered.replace(/</g,"&lt;")}</pre></div>
      <script>window.print()</script>
    </body></html>`;
    const w = window.open("","_blank","width=800,height=900"); if(!w) return;
    w.document.open(); w.document.write(html); w.document.close();
  }

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="text-sm font-medium">Шаблон чеку</div>
          <textarea className="w-full h-64 rounded-xl border p-3 font-mono" value={template} onChange={(e)=>setTemplate(e.target.value)} />
          <div className="text-xs text-gray-500">Токени: {"{{title}} {{date}} {{time}} {{table}} {{operator}} {{items}} {{total}}"}</div>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">Попередній перегляд</div>
          <div className="rounded-xl border p-3 bg-white">
            <div className="mb-2 text-xs text-gray-500">Ширина (колонки): {width}</div>
            <div className="mb-2 font-semibold" style={{textAlign: style.align}}>{testData.title}</div>
            <pre style={{fontSize: style.fontSize, lineHeight: style.lineHeight}}>{rendered}</pre>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <div className="text-sm font-medium">Ширина друку (колонки)</div>
          <select className="w-full rounded-xl border p-2" value={width} onChange={onWidthChange}>
            <option value={32}>32 (вузько, 58мм)</option>
            <option value={42}>42 (58мм / 76мм)</option>
            <option value={48}>48 (80мм)</option>
            <option value={56}>56 (деякі 80мм)</option>
          </select>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">Стиль</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs w-20">Розмір</span>
              <input type="number" className="w-full rounded-xl border p-2" value={style.fontSize} onChange={(e)=>onStyleChange("fontSize", e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs w-20">Інтерліньяж</span>
              <input type="number" step="0.05" className="w-full rounded-xl border p-2" value={style.lineHeight} onChange={(e)=>onStyleChange("lineHeight", e.target.value)} />
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <span className="text-xs w-20">Вирівнювання</span>
              <select className="w-full rounded-xl border p-2" value={style.align} onChange={(e)=>onStyleChange("align", e.target.value)}>
                <option value="left">Ліворуч</option>
                <option value="center">По центру</option>
                <option value="right">Праворуч</option>
              </select>
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <span className="text-xs w-20">Заголовок</span>
              <input type="text" className="w-full rounded-xl border p-2" value={style.title} onChange={(e)=>onStyleChange("title", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Дії</div>
          <button className="rounded-xl border px-3 py-2 hover:bg-gray-50" onClick={handleTestPrint}>Тестовий друк</button>
          <div className="text-xs text-gray-500 mt-2">Тест відкриє попередній перегляд у новому вікні та викличе системний друк.</div>
        </div>
      </div>
    </div>
  );
}
