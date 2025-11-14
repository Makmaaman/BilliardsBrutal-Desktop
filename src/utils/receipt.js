// src/utils/receipt.js

const LS_RECEIPT_FORMAT = "bb_receipt_format_v1";
const LS_CUES = "bb_cues_v1";

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
    return { lines: [], totalCueAmount: 0 };
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
  }

  return { lines, totalCueAmount };
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

  // Рядок по грі: ЧАС (H:MM:SS), тариф, сума
  const gameLine = `Гра ${durStr} год x ${gameRate} = ${money(gameAmt)}`;

  // Рядки по київ (з власними pricePerHour)
  const cue = buildCueLines({
    table,
    hours,
    durStr,
    cues,
  });

  const itemsLines = [gameLine, ...cue.lines];

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

  const text = renderTemplate(tpl, data);
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
