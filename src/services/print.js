// src/services/print.js

import { loadPrinterSettings } from "../utils/printerSettings";

// Перекодування тексту у вибране кодування
function encodeTextWithEncoding(text, encoding) {
  const enc = (encoding || "CP866").toUpperCase();

  // Якщо preload експортує window.iconv.encode (iconv-lite)
  if (
    typeof window !== "undefined" &&
    window.iconv &&
    typeof window.iconv.encode === "function"
  ) {
    try {
      const buf = window.iconv.encode(text, enc);
      if (buf instanceof Uint8Array) return buf;
      if (Array.isArray(buf)) return Uint8Array.from(buf);
      if (buf && typeof buf.length === "number") return new Uint8Array(buf);
    } catch (e) {
      console.warn("iconv encode failed, fallback to UTF-8:", e);
    }
  }

  // Фолбек: UTF-8 через TextEncoder
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text);
  }

  // Найгрубіший фолбек: беремо молодший байт charCode
  const arr = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    arr[i] = text.charCodeAt(i) & 0xff;
  }
  return arr;
}

// Конвертація масиву байтів у "бінарний" рядок для printRaw
function bytesToBinaryString(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

// Побудова ESC/POS bitmap (GS v 0) для логотипу
async function buildLogoBytes(logoBase64, targetWidth) {
  if (!logoBase64 || typeof document === "undefined") return null;

  const img = new Image();
  const loaded = new Promise((resolve, reject) => {
    img.onload = () => resolve(true);
    img.onerror = (err) => reject(err);
  });
  img.src = logoBase64;
  await loaded;

  const scale = targetWidth / img.width;
  const width = targetWidth;
  const height = Math.max(1, Math.floor(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const bytesPerLine = Math.ceil(width / 8);
  const bitmap = new Uint8Array(bytesPerLine * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const brightness = (r + g + b) / 3;
      const bit = brightness < 140 ? 1 : 0; // 1 – чорний піксель

      const byteIndex = y * bytesPerLine + (x >> 3);
      const bitOffset = 7 - (x & 7);

      if (bit) {
        bitmap[byteIndex] |= 1 << bitOffset;
      }
    }
  }

  // ESC/POS: GS v 0
  const out = new Uint8Array(8 + bitmap.length);
  out[0] = 0x1d; // GS
  out[1] = 0x76; // 'v'
  out[2] = 0x30; // '0'
  out[3] = 0x00; // m = 0 (normal)
  out[4] = bytesPerLine & 0xff; // xL
  out[5] = (bytesPerLine >> 8) & 0xff; // xH
  out[6] = height & 0xff; // yL
  out[7] = (height >> 8) & 0xff; // yH
  out.set(bitmap, 8);

  return out;
}

// Будівник простого ESC/POS чека (UTF-8 -> CP866/Win1251 тощо)
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
    s && typeof s === "string" && s.normalize
      ? s.normalize("NFC")
      : String(s ?? "");

  const hr = "------------------------------\n";

  const settings = loadPrinterSettings();
  const extraLines =
    typeof settings.receiptExtraLines === "number" &&
    settings.receiptExtraLines > 0 &&
    settings.receiptExtraLines < 50
      ? settings.receiptExtraLines
      : 4;

  let out = "";

  // Ініціалізація принтера
  out += "\x1B\x40"; // ESC @

  // Заголовок (центрований, жирний)
  out += "\x1B\x61\x01"; // align center
  out += "\x1B\x21\x30"; // double height + double width
  out += z(header) + "\n";
  out += "\x1B\x21\x00"; // normal
  out += "\n";

  // Інфо про стіл/оператора/план
  out += "\x1B\x61\x00"; // align left

  if (tableNo != null || tableName) {
    const label = tableNo != null ? tableNo : tableName || "—";
    out += `Стіл: ${z(label)}\n`;
  }

  if (plan) {
    out += `Тариф: ${z(plan)}\n`;
  }

  out += hr;

  // Основні рядки
  for (const ln of linesExtra || []) {
    out += z(ln) + "\n";
  }

  out += hr;

  // Підсумок
  out += `СУМА: ${amount} ${currency}\n`;

  // Дата/час закриття
  if (closedAt instanceof Date && !Number.isNaN(closedAt.getTime())) {
    out += `Закрито: ${closedAt.toLocaleDateString()} ${closedAt.toLocaleTimeString()}\n`;
  }

  out += "\nДякуємо за гру!\n";
  out += hr;

  // Кількість порожніх рядків керується налаштуванням
  out += "\n".repeat(extraLines);

  return out;
}

// Друк / збереження чека з урахуванням кодування та логотипу
export async function printReceipt(ip, rawPayload, mock = false) {
  // mock-режим: зберігаємо чек у файл (текст), як і було
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

  const hasRaw =
    typeof window !== "undefined" &&
    ((window.printers && typeof window.printers.printRaw === "function") ||
      (window.printer && typeof window.printer.sendRaw === "function"));

  if (!hasRaw) {
    return {
      ok: false,
      error: "Принтер не підключено або не підтримується в цій конфігурації.",
    };
  }

  const settings = loadPrinterSettings();
  const encoding = settings.encoding || "CP866";
  const logoBase64 = settings.logoBase64 || null;
  const logoWidth = settings.logoWidth || 300;

  // Основний шлях: текст перекодовує головний процес (iconv-lite), він же
  // додає ESC @, вибір кодової таблиці, протяжку і відрізання паперу.
  if (window.printers && typeof window.printers.printText === "function") {
    try {
      let prefix = "";
      if (logoBase64) {
        try {
          const logoBytes = await buildLogoBytes(logoBase64, logoWidth);
          if (logoBytes) {
            const alignCenter = new Uint8Array([0x1b, 0x61, 0x01]);
            const alignLeft = new Uint8Array([0x1b, 0x61, 0x00]);
            prefix =
              bytesToBinaryString(alignCenter) +
              bytesToBinaryString(logoBytes) +
              bytesToBinaryString(alignLeft);
          }
        } catch (e) {
          console.warn("Не вдалося побудувати логотип ESC/POS:", e);
        }
      }

      const res = await window.printers.printText({
        ip,
        text: rawPayload,
        encoding,
        prefix,
        codepageId: settings.codepageId,
        feedLines: settings.receiptExtraLines ?? 4,
        cut: settings.autoCut !== false,
      });
      if (res?.ok) return { ok: true };
      return { ok: false, error: res?.error || "Помилка друку." };
    } catch (e) {
      return { ok: false, error: e?.message || "Помилка з'єднання з принтером." };
    }
  }

  try {
    const chunks = [];

    // Логотип (якщо завантажений)
    if (logoBase64) {
      try {
        const logoBytes = await buildLogoBytes(logoBase64, logoWidth);
        if (logoBytes) {
          const alignCenter = new Uint8Array([0x1b, 0x61, 0x01]);
          const alignLeft = new Uint8Array([0x1b, 0x61, 0x00]);
          chunks.push(alignCenter);
          chunks.push(logoBytes);
          chunks.push(alignLeft);
        }
      } catch (e) {
        console.warn("Не вдалося побудувати логотип ESC/POS:", e);
      }
    }

    // Текст чека з перекодуванням
    const textBytes = encodeTextWithEncoding(rawPayload, encoding);
    chunks.push(textBytes);

    // Склеюємо всі шматки в один Uint8Array
    let totalLength = 0;
    for (const c of chunks) totalLength += c.length;
    const allBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      allBytes.set(c, offset);
      offset += c.length;
    }

    const binaryPayload = bytesToBinaryString(allBytes);

    if (window.printers && typeof window.printers.printRaw === "function") {
      await window.printers.printRaw(ip, binaryPayload);
    } else if (
      window.printer &&
      typeof window.printer.sendRaw === "function"
    ) {
      await window.printer.sendRaw(ip, binaryPayload, 9100);
    }

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "Помилка з'єднання з принтером.",
    };
  }
}

// Сканер мережевих принтерів RAW9100 (як було)
export async function scanPrinters(opts = {}) {
  const scanFn =
    typeof window !== "undefined" &&
    ((window.printers &&
      typeof window.printers.scan === "function" &&
      window.printers.scan) ||
      (window.printer &&
        typeof window.printer.scan === "function" &&
        window.printer.scan));

  if (!scanFn) return [];

  const res = await scanFn({
    timeout: opts.timeout || 900,
    limit: opts.limit || 254,
  });
  // тільки RAW9100
  return (res || []).filter((r) => r.kind === "raw9100");
}

/**
 * Тестовий друк тим самим шляхом, що й справжній чек, з українськими
 * літерами — щоб одразу побачити, чи правильна кодова таблиця принтера.
 * Приймає рядок з IP або об'єкт налаштувань.
 */
export async function quickTestPrint(ipOrSettings) {
  if (typeof window === "undefined") return false;

  const settings = loadPrinterSettings();
  const ip =
    typeof ipOrSettings === "string"
      ? ipOrSettings
      : ipOrSettings?.ip || settings.ip;
  if (!ip) return false;

  const text = [
    'Більярдний клуб "Duna"',
    "ТЕСТ ДРУКУ",
    "------------------------------",
    "Перевірка літер:",
    "і ї є ґ І Ї Є Ґ № ₴",
    "Стіл №3 — Дякуємо за візит!",
    "------------------------------",
    "СУМА: 0.00",
  ].join("\n") + "\n";

  const res = await printReceipt(ip, text, false);
  return res?.ok === true;
}
