// src/services/onlineBookingApi.js
// API-клієнт для VPS (nginx -> /api/*)

function normalizeBaseUrl(serverUrl) {
  let u = String(serverUrl || "").trim();
  u = u.replace(/\/+$/, "");
  return u;
}

async function fetchJson(url, opt = {}) {
  const r = await fetch(url, opt);
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!r.ok) {
    const msg =
      (data && typeof data === "object" && (data.error || data.message)) ||
      (typeof data === "string" ? data : "") ||
      `${r.status} Request failed`;
    const err = new Error(msg);
    err.status = r.status;
    err.data = data;
    throw err;
  }

  return data;
}

function authHeaders(token) {
  const t = String(token || "").trim();
  return t ? { "X-Terminal-Token": t } : {};
}

// ---------- Public ----------
export async function apiServerHealth(serverUrl) {
  const base = normalizeBaseUrl(serverUrl);
  return fetchJson(`${base}/api/health`, { method: "GET" });
}

export async function apiGetTables(serverUrl) {
  const base = normalizeBaseUrl(serverUrl);
  return fetchJson(`${base}/api/tables`, { method: "GET" });
}

export async function apiGetClients(serverUrl) {
  const base = normalizeBaseUrl(serverUrl);
  return fetchJson(`${base}/api/clients`, { method: "GET" });
}

// ---------- Terminal (auth) ----------
export async function apiListBookings(serverUrl, token, params = {}) {
  const base = normalizeBaseUrl(serverUrl);

  const qs = new URLSearchParams();
  if (params.since) qs.set("since", String(params.since));
  if (params.status) qs.set("status", String(params.status));
  if (params.unacked) qs.set("unacked", "1"); // сервер фільтрує ackAt=0
  if (params.unconsumed) qs.set("unconsumed", "1");

  const url = `${base}/api/online-bookings${qs.toString() ? "?" + qs.toString() : ""}`;
  return fetchJson(url, {
    method: "GET",
    headers: {
      ...authHeaders(token),
    },
  });
}

export async function apiAckOnlineBooking(serverUrl, token, id) {
  const base = normalizeBaseUrl(serverUrl);
  const bid = encodeURIComponent(String(id || ""));
  return fetchJson(`${base}/api/online-bookings/${bid}/ack`, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
}

export async function apiUpdateBookingStatus(serverUrl, token, id, status, note) {
  const base = normalizeBaseUrl(serverUrl);
  const bid = encodeURIComponent(String(id || ""));
  return fetchJson(`${base}/api/online-bookings/${bid}/status`, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status, note }),
  });
}

export async function apiTerminalHeartbeat(serverUrl, token, payload = {}) {
  const base = normalizeBaseUrl(serverUrl);
  return fetchJson(`${base}/api/terminal/heartbeat`, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
}

// Сумісність зі старим клієнтом/модалкою: "consume" == "ack" (бо на сервері нема /consume)
export async function apiConsumeBooking(serverUrl, token, id) {
  return apiAckOnlineBooking(serverUrl, token, id);
}
