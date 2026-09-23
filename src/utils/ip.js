export function isValidIPv4(ip) {
  if (typeof ip !== "string") return false;
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  return m.slice(1).every(n => {
    const v = Number(n);
    return v >= 0 && v <= 255;
  });
}
export function cleanIP(ip) {
  if (typeof ip !== "string") return "";
  return ip.trim().replace(/^https?:\/\//i, "").replace(/\/+$/,"");
}
