// Якщо є window.receipt — HTML друк на системний принтер (deviceName)
// Якщо є window.escpos — сирий ESC/POS на ip:9100

export async function listPrinters(){
  if (!window.receipt?.listPrinters) return { ok:false, error: 'bridge-missing' };
  return await window.receipt.listPrinters();
}

function fmt(n){
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

async function printHtmlReceipt(data, opts = {}){
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

// Простий ESC/POS “тестовий чек” (ASCII)
async function printEscposTest(ip, port = 9100, title = 'Duna Billiard Club'){
  if (!window.escpos?.test) return { ok:false, error:'escpos-bridge-missing' };
  return await window.escpos.test({ ip, port, title });
}

export async function printReceipt(data, opts = {}){
  const ip = opts.ip || (typeof opts.deviceName === 'string' && /^[0-9.]+$/.test(opts.deviceName) ? opts.deviceName : null);
  if (ip) {
    // Маємо IP — друк сирим ESC/POS
    return await printEscposTest(ip, opts.port || 9100, (data && data.title) || 'Duna Billiard Club');
  }
  // Інакше — як раніше: системний принтер за назвою
  return await printHtmlReceipt(data, opts);
}
