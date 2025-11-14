// src/services/receiptMockPrint.js
function pad2(n) { return String(n).padStart(2, '0'); }
function tsName(prefix = 'receipt') {
  const d = new Date();
  return `${prefix}_${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

export function isMockEnabled(opts = {}) {
  if (opts.mock === true) return true;
  try {
    const persisted = localStorage.getItem('bb_printer_mock');
    return persisted === '1' || persisted === 'true';
  } catch (e) { return false; }
}

export function makeReceiptHTML(text, { width = 42, fontSize = 14, lineHeight = 1.35 } = {}) {
  const cols = Number(width) || 42;
  const chW = 8;
  const px = cols * chW;
  const safe = String(text || '').replace(/</g, '&lt;');
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  body{margin:0;padding:20px;background:#f5f5f5}
  .paper{width:${px}px;margin:0 auto;background:#fff;padding:16px;border:1px solid #ddd}
  pre{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;
      font-size:${Number(fontSize)||14}px;line-height:${Number(lineHeight)||1.35};
      white-space:pre-wrap;word-break:break-word}
</style></head><body>
  <div class="paper"><pre>${safe}</pre></div>
</body></html>`;
}

export function saveReceiptHTML(text, opts = {}) {
  try {
    const html = makeReceiptHTML(text, opts);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${tsName('receipt')}.html`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  } catch (e) { console.error('saveReceiptHTML failed:', e); }
}

export function saveReceiptTXT(text) {
  try {
    const blob = new Blob([String(text || '')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${tsName('receipt')}.txt`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  } catch (e) { console.error('saveReceiptTXT failed:', e); }
}

export function printOrSaveReceipt(text, opts = {}) {
  const isMock = isMockEnabled(opts);
  if (isMock) {
    if (opts.saveAs === 'txt') return saveReceiptTXT(text);
    return saveReceiptHTML(text, opts);
  }
  try {
    const html = makeReceiptHTML(text, opts);
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
    w.print?.();
  } catch (e) { console.error('printOrSaveReceipt failed:', e); }
}
