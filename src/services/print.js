export function escposReceipt({ club="Duna Billiard Club", tableName, totalMs, amount, currency="₴" }) {
  const ESC='\x1b', LF='\n';
  let s=''; s+=ESC+'@'; s+=ESC+'a'+'\x01'; s+=ESC+'!'+'\x38'+club+LF; s+=ESC+'!'+'\x00'; s+=ESC+'a'+'\x00';
  s+=`Стіл: ${tableName}`+LF; s+=`Час: ${totalMs}`+LF; s+='--------------------------'+LF; s+=`Сума: ${amount} ${currency}`+LF;
  s+=LF+LF; s+=ESC+'d'+'\x03'; s+=ESC+'@'; return s;
}

export async function printReceipt(ip, payload, mock=true) {
  if (mock || !ip) {
    const blob = new Blob([payload], { type: "text/plain;charset=windows-1251" });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:T]/g,'-').slice(0,19);
    a.href=url; a.download=`receipt_${stamp}.txt`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2_000); return;
  }
  const res = await window.bb?.print?.({ host: ip, data: payload });
  if (!res?.ok) throw new Error(res?.error || "Помилка друку");
}
