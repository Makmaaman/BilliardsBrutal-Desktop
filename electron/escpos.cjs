const tcp = require("net");

function toBuffer(bytesOrString) {
  if (Array.isArray(bytesOrString)) return Buffer.from(bytesOrString);
  if (typeof bytesOrString === "string") return Buffer.from(bytesOrString, "ascii");
  return Buffer.from([]);
}

function sendRaw({ ip, port = 9100, data, timeoutMs = 8000 }) {
  return new Promise((resolve) => {
    const sock = new tcp.Socket();
    let finished = false;
    const done = (ok, error) => {
      if (finished) return;
      finished = true;
      try { sock.destroy(); } catch {}
      resolve(ok ? { ok:true } : { ok:false, error: error || "unknown" });
    };
    const timer = setTimeout(() => done(false, "timeout"), timeoutMs);
    sock.once("error", (e) => { clearTimeout(timer); done(false, e && e.message); });
    sock.connect(port, ip, () => {
      const buf = toBuffer(data);
      sock.write(buf, () => { sock.end(); });
    });
    sock.once("close", () => { clearTimeout(timer); done(true); });
  });
}

function buildTestBytes({ title = "Duna Billiard Club" } = {}) {
  const ESC = 0x1B, GS = 0x1D;
  const seq = [];
  // init
  seq.push(ESC, 0x40);
  // центр
  seq.push(ESC, 0x61, 0x01);
  // жирний
  seq.push(ESC, 0x45, 0x01);
  // заголовок
  const head = `TEST PRINT\n${title}\n`;
  for (const ch of Buffer.from(head, "ascii")) seq.push(ch);
  // звичайний
  seq.push(ESC, 0x45, 0x00);
  const now = new Date();
  const line = `\n${now.toISOString().slice(0,19).replace("T"," ")}\n\n`;
  for (const ch of Buffer.from(line, "ascii")) seq.push(ch);
  // частковий відріз
  seq.push(GS, 0x56, 0x42, 0x00); // GS V 66 0
  return Buffer.from(seq);
}

function registerEscposPrinting(ipcMain) {
  ipcMain.handle("escpos:printRaw", async (_evt, { ip, port = 9100, bytes, text }) => {
    if (!ip) return { ok:false, error:"ip-required" };
    let payload = bytes;
    if (!payload && typeof text === "string") payload = Buffer.from(text, "ascii");
    if (!payload) return { ok:false, error:"no-bytes" };
    try { return await sendRaw({ ip, port, data: payload }); }
    catch (e) { return { ok:false, error: e && e.message || String(e) }; }
  });

  ipcMain.handle("escpos:test", async (_evt, { ip, port = 9100, title } = {}) => {
    if (!ip) return { ok:false, error:"ip-required" };
    try {
      const bytes = buildTestBytes({ title });
      return await sendRaw({ ip, port, data: bytes });
    } catch (e) {
      return { ok:false, error: e && e.message || String(e) };
    }
  });
}

module.exports = { registerEscposPrinting, sendRaw, buildTestBytes };
