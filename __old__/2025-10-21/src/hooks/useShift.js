// src/hooks/useShift.js
import { useEffect, useState } from "react";
import { getShift, subscribe, openShift, closeShift, getShiftStatusText } from "../state/shiftStore";

export function useShift(){
  const [shift, setShift] = useState(getShift());
  useEffect(()=>subscribe(setShift), []);
  return shift;
}

export { openShift, closeShift, getShiftStatusText };
