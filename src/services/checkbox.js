// src/services/checkbox.js — інтеграція з Checkbox ПРРО (api.checkbox.ua)
// Відновлено з бандлу v3.9.2.
//
// Потік:
//  - налаштування (ключ ліцензії каси + логін/пароль або пін-код касира) зберігаються в localStorage
//  - токен касира кешується на 7 год; при 401 скидається
//  - відкриття/закриття зміни в ПРРО, службове внесення/видача, продаж (фіскальний чек)

const API_BASE = "https://api.checkbox.ua/api/v1";
const LS_KEY = "bb_checkbox_v1";

let cachedToken = null;
let cachedTokenUntil = 0;

export function defaultCheckboxSettings() {
  return { enabled: false, login: "", password: "", pinCode: "", licenseKey: "" };
}

export function getCheckboxSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...defaultCheckboxSettings(), ...JSON.parse(raw) } : defaultCheckboxSettings();
  } catch {
    return defaultCheckboxSettings();
  }
}

export function saveCheckboxSettings(patch) {
  const next = { ...getCheckboxSettings(), ...patch };
  localStorage.setItem(LS_KEY, JSON.stringify(next));
  // зміна облікових даних — інвалідуємо кешований токен
  if ("login" in patch || "password" in patch || "pinCode" in patch || "licenseKey" in patch) {
    cachedToken = null;
    cachedTokenUntil = 0;
  }
  return next;
}

async function request(path, opts = {}) {
  const { token, licenseKey, ...rest } = opts;
  const headers = { "Content-Type": "application/json", ...(rest.headers || {}) };
  if (licenseKey) headers["X-License-Key"] = licenseKey;
  if (token) headers.Authorization = `Bearer ${token}`;
  return await Promise.race([
    fetch(API_BASE + path, { ...rest, headers }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Checkbox: таймаут (15 с)")), 15000)),
  ]);
}

/** Вхід касира без кешу токена (для «Перевірити підключення»). */
export async function signIn(login, password, licenseKey, pinCode) {
  if (login && password) {
    const res = await request("/cashier/signin", {
      method: "POST",
      licenseKey,
      body: JSON.stringify({ login, password }),
    });
    if (res.ok) return res.json();
    const err = await res.json().catch(() => ({}));
    if (res.status !== 401 && res.status !== 403) {
      throw new Error(err?.detail || `Checkbox: помилка входу (${res.status})`);
    }
    if (!pinCode) throw new Error(err?.detail || `Checkbox: невірний логін або пароль (${res.status})`);
  }
  if (pinCode) {
    const res = await request("/cashier/signinPinCode", {
      method: "POST",
      licenseKey,
      body: JSON.stringify({ pin_code: pinCode }),
    });
    if (res.ok) return res.json();
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.detail || `Checkbox: помилка входу за пін-кодом (${res.status}). Перевірте пін-код та ключ ліцензії.`,
    );
  }
  throw new Error("Checkbox: вкажіть логін+пароль або пін-код касира.");
}

export async function getToken({ login, password, pinCode, licenseKey }) {
  const now = Date.now();
  if (cachedToken && now < cachedTokenUntil) return cachedToken;
  const auth = await signIn(login, password, licenseKey, pinCode);
  if (!auth?.access_token) throw new Error("Checkbox: токен не отримано");
  cachedToken = auth.access_token;
  cachedTokenUntil = now + 7 * 3600 * 1000;
  return cachedToken;
}

const OPEN_STATUSES = new Set(["CREATED", "OPENING", "OPENED"]);

function errorMessage(body) {
  if (!body || typeof body !== "object") return null;
  if (body.detail) return String(body.detail);
  if (body.message) return String(body.message);
  if (body.error) return String(body.error);
  if (Array.isArray(body) && body[0]?.msg) return body.map((x) => x.msg).join("; ");
  return null;
}

export class CheckboxOtherCashierError extends Error {
  constructor(message) {
    super(message);
    this.name = "CheckboxOtherCashierError";
  }
}

async function getCurrentShift(token, licenseKey) {
  const res = await request("/shifts/current", { token, licenseKey });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = errorMessage(body) || "";
    console.warn(`[Checkbox] GET /shifts/current → ${res.status}`, detail, body);
    return { _error: res.status, _detail: detail };
  }
  const shift = await res.json().catch(() => null);
  console.log("[Checkbox] GET /shifts/current →", shift?.status, shift?.id);
  return shift;
}

async function ensureShiftOpen(token, licenseKey) {
  const current = await getCurrentShift(token, licenseKey);
  if (current?.status === "CLOSING") {
    throw new Error("Checkbox: зміна зараз закривається. Зачекайте кілька секунд і спробуйте знову.");
  }
  if (current && OPEN_STATUSES.has(current.status)) return current;

  const res = await request("/shifts", { method: "POST", token, licenseKey, body: JSON.stringify({}) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = errorMessage(body) || `Checkbox: не вдалося відкрити зміну (${res.status})`;
    const low = msg.toLowerCase();
    if (
      res.status === 400 &&
      (low.includes("іншим касиром") || low.includes("another cashier") || low.includes("cashier signin"))
    ) {
      throw new CheckboxOtherCashierError(msg);
    }
    if (
      res.status === 400 &&
      (low.includes("вже працює") ||
        low.includes("already working") ||
        low.includes("already open") ||
        low.includes("already exists") ||
        low.includes("каси"))
    ) {
      // «Касир вже працює з даною касою» — зміна відкривається асинхронно, чекаємо
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const s = await getCurrentShift(token, licenseKey);
        if (s && OPEN_STATUSES.has(s.status)) return s;
      }
      const last = await getCurrentShift(token, licenseKey);
      if (last && last.status !== "CLOSED") return last;
    }
    throw new Error(msg);
  }
  return res.json();
}

/** Закрити зміну старого касира (його обліковими даними) і відкрити зміну поточним. */
export async function closeOtherCashierShiftAndOpen(oldCashier, settings) {
  const licenseKey = oldCashier.licenseKey || settings.licenseKey;
  const oldToken = await signIn(oldCashier.login, oldCashier.password, licenseKey, oldCashier.pinCode).then(
    (a) => a?.access_token,
  );
  if (!oldToken) throw new Error("Checkbox: не вдалось увійти за старими даними касира");

  const cur = await request("/shifts/current", { token: oldToken, licenseKey });
  if (!cur.ok) throw new Error("Checkbox: не знайдено відкриту зміну старого касира");
  const shift = await cur.json();
  if (!shift?.id) throw new Error("Checkbox: стара зміна не знайдена");

  const closed = await request("/shifts/close", {
    method: "POST",
    token: oldToken,
    licenseKey,
    body: JSON.stringify({}),
  });
  if (!closed.ok) {
    const body = await closed.json().catch(() => ({}));
    throw new Error(errorMessage(body) || `Checkbox: не вдалось закрити стару зміну (${closed.status})`);
  }

  const token = await getToken(settings);
  return ensureShiftOpen(token, settings.licenseKey);
}

export async function openCheckboxShift(settings) {
  const token = await getToken(settings);
  return ensureShiftOpen(token, settings.licenseKey);
}

/** Повертає null, якщо зміна вже закрита / відсутня. */
export async function closeCheckboxShift(settings) {
  const token = await getToken(settings);
  const res = await request("/shifts/close", {
    method: "POST",
    token,
    licenseKey: settings.licenseKey,
    body: JSON.stringify({}),
  });
  if (res.status === 400 || res.status === 404) {
    const body = await res.json().catch(() => ({}));
    const msg = errorMessage(body) || "";
    const low = msg.toLowerCase();
    if (
      low.includes("вже закрит") ||
      low.includes("already closed") ||
      low.includes("no active shift") ||
      low.includes("not found")
    ) {
      return null;
    }
    throw new Error(msg || `Checkbox: не вдалося закрити зміну (${res.status})`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(errorMessage(body) || `Checkbox: не вдалося закрити зміну (${res.status})`);
  }
  return res.json();
}

async function waitShiftOpened(token, licenseKey) {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await request("/shifts/current", { token, licenseKey }).catch(() => null);
    if (!res || !res.ok) continue;
    const shift = await res.json().catch(() => null);
    if (shift?.status === "OPENED") return;
  }
}

/** Службове внесення готівки (початковий залишок при відкритті зміни). */
export async function serviceDeposit(settings, amountUah) {
  const kop = Math.round(Number(amountUah) * 100);
  if (!kop || kop <= 0) return null;
  const token = await getToken(settings);
  await waitShiftOpened(token, settings.licenseKey);
  const res = await request("/receipts/service", {
    method: "POST",
    token,
    licenseKey: settings.licenseKey,
    body: JSON.stringify({ payment: { type: "CASH", value: kop } }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(errorMessage(body) || `Checkbox: помилка службового внесення (${res.status})`);
  }
  return res.json();
}

/** Службова видача готівки (інкасація при закритті зміни). */
export async function serviceWithdrawal(settings, amountUah) {
  const kop = Math.round(Number(amountUah) * 100);
  if (!kop || kop <= 0) return null;
  const token = await getToken(settings);
  const res = await request("/receipts/service", {
    method: "POST",
    token,
    licenseKey: settings.licenseKey,
    body: JSON.stringify({ payment: { type: "CASH", value: -kop } }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(errorMessage(body) || `Checkbox: помилка службової видачі (${res.status})`);
  }
  return res.json();
}

async function waitFiscalCode(receiptId, token, licenseKey) {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await request(`/receipts/${receiptId}`, { token, licenseKey }).catch(() => null);
    if (!res || !res.ok) break;
    const receipt = await res.json().catch(() => null);
    if (receipt?.fiscal_code) return receipt;
  }
  return null;
}

/** Фіскальний чек продажу. Повертає об'єкт чека Checkbox (id, fiscal_code, fiscal_date, qr_url…). */
export async function fiscalizeReceipt({ totalAmount, paymentMethod, description, settings }) {
  const token = await getToken(settings);
  const kop = Math.round((Number(totalAmount) || 0) * 100);
  const payType = String(paymentMethod).toLowerCase() === "card" ? "CARD" : "CASH";
  const body = {
    goods: [{ good: { code: "0001", name: description || "Послуги більярдного клубу", price: kop }, quantity: 1000 }],
    payments: [{ type: payType, value: kop }],
  };
  const res = await request("/receipts/sell", {
    method: "POST",
    token,
    licenseKey: settings.licenseKey,
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    cachedToken = null;
    cachedTokenUntil = 0;
    throw new Error("Checkbox: сесія закінчилась, спробуйте ще раз");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || `Checkbox: помилка фіскалізації (${res.status})`);
  }
  const receipt = await res.json();
  if (!receipt.fiscal_code && receipt.id) {
    const withCode = await waitFiscalCode(receipt.id, token, settings.licenseKey);
    if (withCode) return withCode;
  }
  return receipt;
}

/** Текстовий блок для друку внизу чека. */
export function formatFiscalBlock(receipt) {
  if (!receipt) return "";
  const line = "-".repeat(30);
  const out = ["", line, "ФІСКАЛЬНИЙ ЧЕК (Checkbox ПРРО)"];
  if (receipt.fiscal_code) out.push(`ФН чеку: ${receipt.fiscal_code}`);
  if (receipt.fiscal_date) out.push(`Дата:     ${receipt.fiscal_date}`);
  if (receipt.id) out.push(`ID: ${String(receipt.id).substring(0, 13)}...`);
  if (receipt.qr_url) out.push(`QR: ${receipt.qr_url}`);
  out.push(line);
  return out.join("\n");
}
