const parseHM = (s) => { const [h, m] = s.split(':').map(Number); return h*60 + m; };

export function rateAt(dt, rules, fallback) {
  const day = dt.getDay(); const minutes = dt.getHours()*60 + dt.getMinutes();
  for (const r of rules) {
    if (!r.days.includes(day)) continue;
    const a = parseHM(r.from), b = parseHM(r.to);
    const inRange = (a <= b) ? (minutes >= a && minutes < b) : (minutes >= a || minutes < b);
    if (inRange) return r.rate;
  }
  return fallback;
}

function nextBoundary(dt, rules) {
  const day = dt.getDay(); const minutes = dt.getHours()*60 + dt.getMinutes();
  const c = [];
  for (const r of rules) {
    if (!r.days.includes(day)) continue;
    const endMin = (r.to === "24:00") ? 1440 : parseHM(r.to);
    if (endMin > minutes) { const n = new Date(dt); n.setHours(0, endMin, 0, 0); c.push(n.getTime()); }
  }
  const midnight = new Date(dt); midnight.setHours(24,0,0,0); c.push(midnight.getTime());
  return Math.min(...c);
}

export function costForInterval(startMs, endMs, rules, fallback) {
  let sum = 0; let t = new Date(startMs);
  while (t.getTime() < endMs) {
    const rate = rateAt(t, rules, fallback);
    const nb = nextBoundary(t, rules);
    const chunkEnd = Math.min(endMs, nb);
    sum += ((chunkEnd - t.getTime()) / 3600000) * rate;
    t = new Date(chunkEnd);
  }
  return sum;
}

export const todayRange = () => {
  const d = new Date(); const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const end = start + 86400000 - 1; return { start, end };
};
export const weekRange = () => {
  const d = new Date(); const day = (d.getDay()+6)%7; const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()-day).getTime();
  return { start, end: start + 7*86400000 - 1 };
};
export const monthRange = () => {
  const d = new Date(); const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const end = new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999).getTime();
  return { start, end };
};
export const inRange = (ts, start, end) => ts >= start && ts <= end;
