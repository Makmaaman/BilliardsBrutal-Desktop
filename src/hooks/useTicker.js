// src/hooks/useTicker.js
import { useEffect, useRef, useState } from "react";

/**
 * Lightweight ticking hook to drive UI updates every `ms` milliseconds.
 * Does not leak intervals, safe to toggle on/off.
 */
export function useTicker(enabled = true, ms = 1000) {
  const [, setTick] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    ref.current = setInterval(() => setTick(v => v + 1), ms);
    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, [enabled, ms]);
}
