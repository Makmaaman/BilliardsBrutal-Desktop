
// src/services/receiptPrint.js
export async function listPrinters(){
  if (!window.receipt?.listPrinters) return { ok:false, error: 'bridge-missing' };
  return await window.receipt.listPrinters();
}

function fmt(n){
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export async function printReceipt(data, opts = {}){
  if (!window.receipt?.print) return { ok:false, error: 'bridge-missing' };
  const { title = 'Receipt', items = [], total = 0, footer = '' } = data || {};
  const body = `
    <div class="center bold">${title}</div>
    <div class="mt8"></div>
    ${items.map(it => `
      <div class="row">
        <div>${it.name || ''}</div>
        <div>${fmt(it.qty || 1)} x ${fmt(it.price || 0)}</div>
      </div>
    `).join('')}
    <div class="mt12 row bold"><div>Разом</div><div>${fmt(total)}</div></div>
    ${footer ? `<div class="center mt12">${footer}</div>` : ''}
  `;

  return await window.receipt.print({
    htmlBody: body,
    deviceName: opts.deviceName || undefined,
    widthMM: opts.widthMM || 80,
    heightMM: opts.heightMM || 200,
  });
}
