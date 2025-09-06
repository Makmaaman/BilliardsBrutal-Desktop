// electron/license.cjs
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { app } = require("electron");
const { machineIdSync } = require("node-machine-id");

// ⚠️ ЗАМІНИ: встав свій публічний ключ Ed25519 (Base64)
// Генеруєш пару на сервері. У клієнті — лише public key.
const PUBLIC_KEY_B64 = "REPLACE_WITH_YOUR_PUBLIC_KEY_BASE64";
const APP_ID = "club.duna.billiards";     // має збігатися з build.appId

const LICENSE_FILE = path.join(app.getPath("userData"), "license.json");

// Безпечне читання/запис
function readLicenseFile() {
  try {
    if (!fs.existsSync(LICENSE_FILE)) return null;
    const raw = fs.readFileSync(LICENSE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function writeLicenseFile(lic) {
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(lic, null, 2), "utf8");
}
function removeLicenseFile() {
  try { fs.unlinkSync(LICENSE_FILE); } catch {}
}

function getMachineId() {
  // Stable = true -> однаковий для цього пристрою
  return machineIdSync(true);
}

// Перевірка підпису Ed25519 (Node 18+: crypto.verify підтримує ed25519)
function verifyEd25519(messageUint8, signatureB64, publicKeyB64) {
  try {
    const publicKey = Buffer.from(publicKeyB64, "base64");
    const signature = Buffer.from(signatureB64, "base64");
    return crypto.verify(null, messageUint8, { key: publicKey, format: "der", type: "spki" }, signature);
  } catch {
    return false;
  }
}

/**
 * Структура ліцензії (приклад):
 * {
 *   "payload": {
 *     "appId": "club.duna.billiards",
 *     "licenseId": "LIC-0000123",
 *     "licensee": "Duna Billiard Club",
 *     "plan": "pro",
 *     "machineId": "<hash>",
 *     "issuedAt": 1737400000000,
 *     "expiresAt": 1790000000000 // або відсутнє для безстрокової
 *   },
 *   "sig": "<base64>"
 * }
 */
function validateLicenseObject(lic) {
  if (!lic || typeof lic !== "object") return { ok: false, reason: "NO_LICENSE" };
  const { payload, sig } = lic;
  if (!payload || !sig) return { ok: false, reason: "BAD_FORMAT" };

  // Перевірка підпису
  const msg = Buffer.from(JSON.stringify(payload), "utf8");
  const okSig = verifyEd25519(msg, sig, PUBLIC_KEY_B64);
  if (!okSig) return { ok: false, reason: "BAD_SIGNATURE" };

  // Бізнес-перевірки
  if (payload.appId !== APP_ID) return { ok: false, reason: "APP_ID_MISMATCH" };

  const hw = getMachineId();
  if (payload.machineId !== hw) return { ok: false, reason: "MACHINE_MISMATCH" };

  if (payload.expiresAt && Date.now() > Number(payload.expiresAt)) {
    return { ok: false, reason: "EXPIRED" };
  }

  return { ok: true, reason: "OK", payload };
}

function getStatus() {
  const lic = readLicenseFile();
  const res = validateLicenseObject(lic);
  return { ...res, license: lic, machineId: getMachineId(), path: LICENSE_FILE };
}

// Активація: приймаємо текст ліцензії (JSON рядок або Base64), перевіряємо, записуємо
function activate(licenseText) {
  let parsed = null;

  try {
    // даємо можливість вставити Base64
    const tryB64 = Buffer.from(licenseText.trim(), "base64").toString("utf8");
    parsed = JSON.parse(tryB64);
  } catch {
    try { parsed = JSON.parse(licenseText); } catch { parsed = null; }
  }
  if (!parsed) return { ok: false, reason: "CANNOT_PARSE" };

  const v = validateLicenseObject(parsed);
  if (!v.ok) return { ok: false, reason: v.reason };

  writeLicenseFile(parsed);
  return { ok: true };
}

function deactivate() {
  removeLicenseFile();
  return { ok: true };
}

module.exports = {
  getStatus,
  activate,
  deactivate,
  getMachineId,
  LICENSE_FILE,
};
