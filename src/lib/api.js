// src/lib/api.js
const LS_CUSTOMERS = "bb_customers_v1";
const LS_PROMOS    = "bb_promos_v1";

function lsGet(key, def) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : def; } catch { return def; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function genId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* =========================
 * Клієнти
 * ========================= */
function customersList() { return lsGet(LS_CUSTOMERS, []); }
function customersSave(list) { lsSet(LS_CUSTOMERS, list); }

function customersCreate(payload) {
  const list = customersList();
  const rec = {
    id: genId("c"),
    name: String(payload?.name || "").trim(),
    phone: String(payload?.phone || "").trim(),
    note: String(payload?.note || "").trim(),
    createdAt: Date.now(),
    visits: 0,
    totalSpent: 0,
    // бонуси
    bonusBalance: 0,
    bonusEarned: 0,
    bonusSpent: 0,
    ...payload,
  };
  list.unshift(rec);
  customersSave(list);
  return rec;
}
function customersUpdate(id, patch) {
  const list = customersList();
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) throw new Error("CUSTOMER_NOT_FOUND");
  list[idx] = { ...list[idx], ...patch };
  customersSave(list);
  return list[idx];
}
function customersRemove(id) {
  const list = customersList().filter((x) => x.id !== id);
  customersSave(list);
  return { ok: true };
}
function customersById(id) {
  return customersList().find(c => c.id === id) || null;
}
function round2(n){ return Math.round((Number(n)||0)*100)/100; }
function customersBonusAdd({ id, amount }) {
  const list = customersList();
  const idx = list.findIndex(c => c.id === id);
  if (idx === -1) throw new Error("CUSTOMER_NOT_FOUND");
  const v = round2(amount);
  list[idx].bonusBalance = round2((list[idx].bonusBalance || 0) + v);
  if (v > 0) list[idx].bonusEarned = round2((list[idx].bonusEarned || 0) + v);
  if (v < 0) list[idx].bonusSpent  = round2((list[idx].bonusSpent  || 0) + Math.abs(v));
  customersSave(list);
  return list[idx];
}
function customersVisitsAdd({ id, amount }) {
  const list = customersList();
  const idx = list.findIndex(c => c.id === id);
  if (idx === -1) throw new Error("CUSTOMER_NOT_FOUND");
  list[idx].visits = (list[idx].visits || 0) + 1;
  list[idx].totalSpent = round2((list[idx].totalSpent || 0) + (Number(amount)||0));
  customersSave(list);
  return list[idx];
}

/* =========================
 * Акції/знижки
 * ========================= */
function promosList() { return lsGet(LS_PROMOS, []); }
function promosSave(list) { lsSet(LS_PROMOS, list); }

function promosCreate(payload) {
  const list = promosList();
  const rec = {
    id: genId("p"),
    title: String(payload?.title || "Нова акція"),
    description: String(payload?.description || ""),
    type: payload?.type === "fixed" ? "fixed" : "percent", // percent | fixed
    value: Number(payload?.value || 0), // 10 (%) або 50 (грн)
    active: payload?.active ?? true,
    validFrom: payload?.validFrom ?? null, // timestamp або null
    validTo: payload?.validTo ?? null,     // timestamp або null
    minAmount: Number(payload?.minAmount || 0),
  };
  list.unshift(rec);
  promosSave(list);
  return rec;
}
function promosUpdate(id, patch) {
  const list = promosList();
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) throw new Error("PROMO_NOT_FOUND");
  list[idx] = { ...list[idx], ...patch };
  promosSave(list);
  return list[idx];
}
function promosRemove(id) {
  const list = promosList().filter((x) => x.id !== id);
  promosSave(list);
  return { ok: true };
}

/* =========================
 * Універсальний виклик
 * ========================= */
export async function api(route, payload) {
  switch (route) {
    // customers
    case "customers:list":   return customersList();
    case "customers:create": return customersCreate(payload);
    case "customers:update": return customersUpdate(payload?.id, payload?.patch || {});
    case "customers:remove": return customersRemove(payload?.id);
    case "customers:byId":   return customersById(payload?.id);
    case "customers:bonus:add": return customersBonusAdd(payload);
    case "customers:visits:add": return customersVisitsAdd(payload);

    // promos
    case "promos:list":   return promosList();
    case "promos:create": return promosCreate(payload);
    case "promos:update": return promosUpdate(payload?.id, payload?.patch || {});
    case "promos:remove": return promosRemove(payload?.id);

    default:
      throw new Error("UNKNOWN_API_ROUTE");
  }
}

// синтаксичний цукор
api.customers = {
  list: () => Promise.resolve(customersList()),
  create: (p) => Promise.resolve(customersCreate(p)),
  update: (id, patch) => Promise.resolve(customersUpdate(id, patch)),
  remove: (id) => Promise.resolve(customersRemove(id)),
  byId: (id) => Promise.resolve(customersById(id)),
  bonusAdd: (id, amount) => Promise.resolve(customersBonusAdd({ id, amount })),
  visitsAdd: (id, amount) => Promise.resolve(customersVisitsAdd({ id, amount })),
};
api.promos = {
  list: () => Promise.resolve(promosList()),
  create: (p) => Promise.resolve(promosCreate(p)),
  update: (id, patch) => Promise.resolve(promosUpdate(id, patch)),
  remove: (id) => Promise.resolve(promosRemove(id)),
};

/* формат грошей (якщо треба) */
export function formatMoney(n) {
  try {
    return new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 2 }).format(Number(n) || 0);
  } catch {
    const v = Number(n) || 0;
    return `₴${v.toFixed(2)}`;
  }
}
