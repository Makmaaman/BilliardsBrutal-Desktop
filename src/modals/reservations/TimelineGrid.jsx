
import React, { useMemo } from "react";

/**
 * Простий таймлайн по вертикалі (24 години).
 * Лише відрисовка сітки + поточного часу. Без зміни вашої логіки.
 */
export default function TimelineGrid({ stepMin = 15, nowTick }) {
  const pxPerStep = 8; // 5 хв = 8px
  const pxPerMin = pxPerStep / 5;
  const totalHeight = Math.round(24 * 60 * pxPerMin);

  const hours = useMemo(() => Array.from({length:24}, (_,h)=>h), []);

  const now = new Date(nowTick || Date.now());
  const nowMinutes = now.getHours()*60 + now.getMinutes();
  const nowTop = Math.round(nowMinutes * pxPerMin);

  const hourToTop = (h) => Math.round(h * 60 * pxPerMin);

  return (
    <div className="rsv-grid" style={{height: totalHeight}}>
      <div className="rsv-hours" aria-hidden>
        {hours.map(h => (
          <div key={h} className="rsv-hour" style={{ position:"absolute", top: hourToTop(h), height: 1 }}>
            {String(h).padStart(2,"0")}:00
          </div>
        ))}
      </div>
      <div className="rsv-canvas">
        {hours.map(h => (
          <div key={h} className="rsv-hline" style={{ top: hourToTop(h) }} />
        ))}
        <div className="rsv-now" style={{ top: nowTop }} />
      </div>
    </div>
  );
}
