// src/utils/receipt.js

import { loadPrinterSettings } from "./printerSettings";

const LS_RECEIPT_FORMAT = "bb_receipt_format_v1";
const LS_CUES = "bb_cues_v1";

/* ---------- ESC/POS ----------
   Керуючі коди — ASCII (< 0x80), тому вони без змін переживають
   перекодування тексту в CP1251/CP866 у головному процесі. */
const ESC = {
  alignLeft: "\x1B\x61\x00",
  alignCenter: "\x1B\x61\x01",
  alignRight: "\x1B\x61\x02",
  boldOn: "\x1B\x45\x01",
  boldOff: "\x1B\x45\x00",
  sizeNormal: "\x1D\x21\x00",
  sizeDoubleH: "\x1D\x21\x01", // подвійна висота
  sizeDouble: "\x1D\x21\x11",  // подвійна ширина + висота
  underlineOn: "\x1B\x2D\x01",
  underlineOff: "\x1B\x2D\x00",
};

/** Ширина чека в символах: 58 мм → 32, 80 мм → 48 */
export function receiptCharWidth() {
  try {
    const s = loadPrinterSettings();
    return String(s.paperWidth || "80") === "58" ? 32 : 48;
  } catch {
    return 48;
  }
}

/** Рядок-роздільник на всю ширину */
function sepLine(width, ch = "-") {
  return ch.repeat(width);
}

/** Розбиття довгого тексту по словах */
function wrapText(text, width) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const out = [];
  let cur = "";
  for (const w of words) {
    if (!cur.length) cur = w;
    else if (cur.length + 1 + w.length <= width) cur += " " + w;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

/** Ліворуч — опис, праворуч — сума, вирівняна по правому краю */
function twoColumns(left, right, width) {
  const r = String(right ?? "");
  const maxLeft = width - r.length - 1;
  const leftLines = wrapText(left, Math.max(8, maxLeft));
  const last = leftLines.pop();
  const pad = Math.max(1, width - last.length - r.length);
  return [...leftLines, last + " ".repeat(pad) + r];
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
function fmtDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fmtTime(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function money(v) {
  const n = Number(v) || 0;
  return n.toFixed(2);
}

/** Форматування тривалості як H:MM:SS (0:01:00 тощо) */
function fmtHMS(ms) {
  if (!ms || ms < 0) ms = 0;
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${pad2(m)}:${pad2(s)}`;
}

/**
 * Гарний чек з ESC/POS-форматуванням: центрована назва великим шрифтом,
 * роздільники на всю ширину, суми вирівняні по правому краю, жирний підсумок.
 */
export function buildPrettyReceipt({
  width = 48,
  title = 'Більярдний клуб "Duna"',
  dateStr = "",
  timeStr = "",
  tableName = "",
  operatorName = "",
  paymentLabel = "",
  itemRows = [],
  total = "0.00",
  footer = "Дякуємо за візит!",
} = {}) {
  const out = [];

  // Шапка
  out.push(ESC.alignCenter + ESC.sizeDouble + ESC.boldOn);
  out.push(title);
  out.push(ESC.boldOff + ESC.sizeNormal);
  out.push("");

  // Реквізити
  out.push(ESC.alignLeft);
  out.push(sepLine(width, "="));
  out.push(...twoColumns("Дата:", `${dateStr} ${timeStr}`, width));
  if (tableName) out.push(...twoColumns("Стіл:", tableName, width));
  if (operatorName) out.push(...twoColumns("Оператор:", operatorName, width));
  if (paymentLabel) out.push(...twoColumns("Оплата:", paymentLabel, width));
  out.push(sepLine(width, "="));

  // Позиції
  for (const row of itemRows) {
    if (!row) continue;
    out.push(...twoColumns(row.label || "", row.amount || "", width));
    if (row.note) out.push("  " + row.note);
  }

  out.push(sepLine(width, "-"));

  // Підсумок — подвійна висота, сума праворуч
  const totalLabel = "СУМА:";
  const half = Math.floor(width / 2); // подвійна ширина ⇒ удвічі менше символів
  const pad = Math.max(1, half - totalLabel.length - String(total).length);
  out.push(ESC.sizeDouble + ESC.boldOn + totalLabel + " ".repeat(pad) + total);
  out.push(ESC.boldOff + ESC.sizeNormal);
  out.push(sepLine(width, "="));

  // Підвал
  out.push("");
  out.push(ESC.alignCenter + footer);
  out.push(ESC.alignLeft);

  return out.join("\n") + "\n";
}

/** Базовий дефолтний шаблон (якщо користувач ще нічого не налаштував) */
const DEFAULT_TEMPLATE_LINES = [
  '{{title}}',
  'Дата: {{date}} {{time}}',
  'Стіл: {{table}}  Оператор: {{operator}}',
  'Спосіб оплати: {{payment}}',
  '------------------------------',
  '{{items}}',
  '------------------------------',
  'СУМА: {{total}}',
  '',
  'Дякуємо за візит!',
];

function loadTemplateString() {
  try {
    const raw = localStorage.getItem(LS_RECEIPT_FORMAT);
    if (!raw) return DEFAULT_TEMPLATE_LINES.join("\n");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.join("\n");
    if (typeof parsed === "string") return parsed;
  } catch (_e) {}
  return DEFAULT_TEMPLATE_LINES.join("\n");
}

/**
 * Рендеринг шаблону:
 *  - {{items}} → багаторядковий блок з позиціями
 *  - будь-який {{key}} → data[key] або "" (у т.ч. {{payment}})
 */
function renderTemplate(tpl, data) {
  const itemsBlock = Array.isArray(data.items)
    ? data.items.join("\n")
    : String(data.items ?? "");

  let out = String(tpl || "");

  // Спочатку підміняємо {{items}}
  out = out.replace(/{{\s*items\s*}}/g, itemsBlock);

  // Потім усі інші {{key}}
  out = out.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, function (match, key) {
    if (key === "items") return itemsBlock; // на всякий випадок
    const val = Object.prototype.hasOwnProperty.call(data, key)
      ? data[key]
      : "";
    return val != null ? String(val) : "";
  });

  return out;
}

/** Підтягнути список київ з localStorage, якщо не передали явно */
function loadCuesFallback() {
  try {
    const raw = localStorage.getItem(LS_CUES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed).map(([id, v]) => ({
        id,
        ...(typeof v === "object" ? v : { name: String(v) }),
      }));
    }
  } catch (_e) {}
  return [];
}

/**
 * Формування рядків для ОРЕНДИ КИЇВ + розрахунок сум.
 *
 *  - тариф для кия: cue.pricePerHour (з меню «Оренда київ: Ціна / год, грн»)
 */
function buildCueLines({ table, hours, durStr, cues }) {
  const rentals =
    table?.rentals && typeof table.rentals === "object"
      ? table.rentals
      : {};

  const countsByCueId = new Map();

  // playerId -> cueId → рахуємо кількість оренд кожного кия
  for (const pid of Object.keys(rentals)) {
    const cid = String(rentals[pid] ?? "");
    if (!cid) continue;
    countsByCueId.set(cid, (countsByCueId.get(cid) || 0) + 1);
  }

  if (!countsByCueId.size) {
    return { lines: [], items: [], totalCueAmount: 0 };
  }

  let cuesSource = cues;
  if (!cuesSource || !Array.isArray(cuesSource)) {
    cuesSource = loadCuesFallback();
  }

  const cueMap = new Map();
  if (Array.isArray(cuesSource)) {
    for (const c of cuesSource) {
      const key = String(c?.id ?? c?.slug ?? c?.name);
      cueMap.set(key, c);
    }
  }

  const lines = [];
  const items = [];
  let totalCueAmount = 0;

  for (const [cid, qty] of countsByCueId.entries()) {
    const cue = cueMap.get(cid);
    const name = cue?.name || `Кий ${cid}`;

    // ТАРИФ ДЛЯ КИЯ: Ціна / год з меню «Оренда київ»
    const pricePerHour = Number(cue?.pricePerHour || 0);

    const lineAmount = hours * pricePerHour * qty;
    totalCueAmount += lineAmount;

    let line = `Оренда кия ${name} ${durStr} год x ${pricePerHour}`;
    if (qty > 1) line += ` x${qty}`;
    line += ` = ${money(lineAmount)}`;

    lines.push(line);
    items.push({
      label: `Кий ${name}${qty > 1 ? ` x${qty}` : ""}`,
      note: `${durStr} год x ${pricePerHour}`,
      amount: money(lineAmount),
    });
  }

  return { lines, items, totalCueAmount };
}

/**
 * Основний конструктор тексту чеку.
 *
 * gameAmount    — сума за гру (після тарифів/знижок/бонусів),
 * cues          — масив київ (як у меню «Оренда київ»),
 * baseTariff    — тариф за годину для гри (з меню «Тарифи»),
 * paymentMethod — "cash" | "card" | інше (для виводу способу оплати).
 */
export function buildReceiptText({
  table,
  gameAmount,
  grossAmount, // fallback, якщо не передали gameAmount
  cues,
  title = 'Більярдний клуб "Duna"',
  tableLabel,
  operatorName = "Адміністратор",
  totalMs,
  baseTariff,
  paymentMethod,
  discountPct = 0, // знижка на стіл, % (для окремого рядка в чеку)
} = {}) {
  const now = new Date();
  const dateStr = fmtDate(now);
  const timeStr = fmtTime(now);
  const tableName = tableLabel || `№${table?.id ?? ""}`;

  // Награний час у мілісекундах
  let ms = typeof totalMs === "number" ? totalMs : 0;

  // якщо totalMs не передали — рахуємо з інтервалів столу
  if ((!ms || ms <= 0) && table && Array.isArray(table.intervals)) {
    ms = table.intervals.reduce(
      (s, iv) => s + ((iv.end ?? now.getTime()) - iv.start),
      0
    );
  }

  // години для розрахунків
  const hours = ms > 0 ? ms / 3600000 : 0;
  // строка для відображення часу: H:MM:SS
  const durStr = fmtHMS(ms);

  // Сума за гру
  const gameAmt = Number(
    gameAmount !== undefined
      ? gameAmount
      : grossAmount !== undefined
      ? grossAmount
      : 0
  );

  // Тариф для гри: з меню «Тарифи» (baseTariff),
  // якщо його нема — пробуємо по факту: сума / год
  let gameRate = Number(baseTariff) || 0;
  if (!gameRate && hours > 0) {
    gameRate = gameAmt / hours;
  }

  // Рядок по грі: ЧАС (H:MM:SS), тариф, сума.
  // Якщо є знижка — показуємо повну суму, а знижку окремим рядком.
  const dPct = Number(discountPct) || 0;
  const grossForLine = dPct > 0 && grossAmount !== undefined ? Number(grossAmount) : gameAmt;
  const gameLine = `Гра ${durStr} год x ${gameRate} = ${money(grossForLine)}`;
  const discountLines = dPct > 0 ? [`Знижка -${dPct}% = -${money(grossForLine * dPct / 100)}`] : [];

  // Рядки по київ (з власними pricePerHour)
  const cue = buildCueLines({
    table,
    hours,
    durStr,
    cues,
  });

  const itemsLines = [gameLine, ...discountLines, ...cue.lines];

  // Загальна сума в чеку = гра + оренда київ
  const total = money(gameAmt + cue.totalCueAmount);

  // Людяний текст способу оплати
  const pm = String(paymentMethod || "").toLowerCase();
  let paymentLabel = "";
  if (pm === "cash") paymentLabel = "Готівка";
  else if (pm === "card") paymentLabel = "Карта";
  else paymentLabel = "—";

  const tpl = loadTemplateString();
  const data = {
    title,
    date: dateStr,
    time: timeStr,
    table: tableName,
    operator: operatorName,
    total,
    items: itemsLines,
    payment: paymentLabel,
  };

  // Структуровані позиції для гарної верстки
  const itemRows = [
    { label: "Гра", note: `${durStr} год x ${gameRate}`, amount: money(grossForLine) },
    ...(dPct > 0
      ? [{ label: `Знижка -${dPct}%`, note: "", amount: "-" + money((grossForLine * dPct) / 100) }]
      : []),
    ...cue.items,
  ];

  let printerCfg = {};
  try { printerCfg = loadPrinterSettings(); } catch {}
  const usePretty = printerCfg.receiptStyle !== "template";

  const text = usePretty
    ? buildPrettyReceipt({
        width: receiptCharWidth(),
        title,
        dateStr,
        timeStr,
        tableName,
        operatorName,
        paymentLabel,
        itemRows,
        total,
        footer: printerCfg.receiptFooter || "Дякуємо за візит!",
      })
    : renderTemplate(tpl, data);

  return {
    text,
    total,
    lines: itemsLines,
    hours,
    gameAmount: gameAmt,
    cueTotal: cue.totalCueAmount,
    payment: paymentLabel,
  };
}
