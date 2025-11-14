// src/services/print.js

// Будівник простого ESC/POS чека (UTF-8 -> CP866/Win1251 працює на більшості сучасних прошивок)
export function escposReceipt({
  header = 'БІЛЬЯРДНИЙ КЛУБ "DUNA"',
  tableNo = null,
  tableName = "",
  totalMs = "00:00:00",
  amount = "0.00",
  currency = "₴",
  plan = "",
  closedAt = new Date(),
  linesExtra = [],
} = {}) {
  const z = (s = "") =>
    s && typeof s === "string" && s.normalize ? s.normalize("NFC") : String(s ?? "");

  const hr = "================================\n";
  const pad = (s) => {
    s = String(s ?? "");
    return s.length > 32 ? s.slice(0, 32) : s.padEnd(32, " ");
  };

  let out = "";

  // Ініціалізація принтера
  out += "\x1B@";      // init
  out += "\x1B!\x38";  // double height+width + bold
  out += pad(z(header)) + "\n";
  out += "\x1B!\x00";  // normal
  out += hr + "\n";

  // Інформація про стіл
  if (tableNo != null || tableName) {
    const label = tableNo != null ? tableNo : (tableName || "—");
    out += `Ви грали за столом № ${label}\n\n`;
  }

  // Час гри
  out += `Час гри: ${totalMs}\n`;

  // Додаткові рядки (опції, коментарі тощо)
  for (const ln of linesExtra || []) {
    out += z(ln) + "\n";
  }

  // Сума
  out += `\nСума:     ${amount} ${currency}\n\n`;

  // Тариф / план
  if (plan) {
    out += `Тариф:   ${z(plan)}\n`;
  }

  // Дата/час закриття
  if (closedAt instanceof Date && !Number.isNaN(closedAt.getTime())) {
    out += `Закрито: ${closedAt.toLocaleDateString()} ${closedAt.toLocaleTimeString()}\n`;
  }

  out += "\nДякуємо за гру!\n";
  out += hr;
  out += "\n\n\n\n"; // кілька порожніх рядків для відриву

  return out;
}

// Друк / збереження чека
export async function printReceipt(ip, rawPayload, mock = false) {
  // mock-режим: завжди зберігаємо чек у файл (для тестів / коли немає реального принтера)
  if (mock) {
    const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
    const blob = new Blob([rawPayload], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt_${stamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true, mock: true };
  }

  // Не mock-режим: очікуємо наявність інтеграції з принтером
  if (!window?.printer?.sendRaw) {
    return {
      ok: false,
      error: "Принтер не підключено або не підтримується в цій конфігурації.",
    };
  }

  try {
    await window.printer.sendRaw(ip, rawPayload, 9100);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "Помилка з'єднання з принтером.",
    };
  }
}

// Сканер мережевих принтерів RAW9100
export async function scanPrinters(opts = {}) {
  if (!window?.printer?.scan) return [];
  const res = await window.printer.scan({
    timeout: opts.timeout || 900,
    limit: opts.limit || 254,
  });
  // тільки RAW9100
  return (res || []).filter((r) => r.kind === "raw9100");
}

// Швидкий тестовий друк
export async function quickTestPrint(ip) {
  if (!ip) return false;
  const payload = escposReceipt({
    header: "TEST",
    tableName: "—",
    totalMs: "00:00:01",
    amount: "0.00",
    currency: "₴",
    plan: "TEST",
  });

  if (!window?.printer?.test) {
    return false;
  }

  const r = await window.printer.test({ ip, data: payload });
  return r?.ok === true;
}
