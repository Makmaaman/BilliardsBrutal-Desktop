import React from "react";
import { getMonthMatrix, isSameDay } from "./reservationUtils";

export default function LeftCalendar({ nowTick }) {
  const today = new Date(nowTick);
  const matrix = getMonthMatrix(today);

  return (
    <div className="leftcal">
      <div className="leftcal-head">
        {today.toLocaleString("uk-UA", { month: "long", year: "numeric" })}
      </div>
      <div className="leftcal-grid">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((d) => (
          <div key={d} className="leftcal-dow">
            {d}
          </div>
        ))}
        {matrix.map((day, i) => {
          const isToday = isSameDay(day, today);
          return (
            <div key={i} className={"leftcal-cell" + (isToday ? " is-today" : "")}>
              <span className="leftcal-num">{day.getDate()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
