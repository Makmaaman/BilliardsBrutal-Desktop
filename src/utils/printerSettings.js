// src/utils/printerSettings.js

const KEY = "duna_printer_settings_v1";

export function getDefaultPrinterSettings() {
  return {
    ip: "",
    encoding: "CP1251",      // CP866 не містить українських «і» та «ґ» — друкує «?»
    receiptExtraLines: 4,    // скільки пустих рядків внизу чека
    logoBase64: null,        // base64-картинка логотипу
    logoWidth: 384,          // ширина лого в пікселях (58мм ≤384, 80мм ≤576)
    paperWidth: "80",        // ширина паперу: "58" або "80" мм
    receiptStyle: "pretty",  // "pretty" — гарна верстка, "template" — власний шаблон
    receiptFooter: "Дякуємо за візит!",
    autoCut: true,           // відрізати папір після чека (GS V B)
    codepageId: null,        // номер для ESC t (null = авто за encoding)
  };
}

export function loadPrinterSettings() {
  if (typeof window === "undefined" || !window.localStorage) {
    return getDefaultPrinterSettings();
  }

  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return getDefaultPrinterSettings();
    const parsed = JSON.parse(raw);
    return {
      ...getDefaultPrinterSettings(),
      ...parsed,
    };
  } catch (e) {
    console.warn("Не вдалося прочитати налаштування принтера:", e);
    return getDefaultPrinterSettings();
  }
}

export function savePrinterSettings(partial) {
  const current = loadPrinterSettings();
  const next = {
    ...current,
    ...partial,
  };

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) {
      console.warn("Не вдалося зберегти налаштування принтера:", e);
    }
  }

  return next;
}
