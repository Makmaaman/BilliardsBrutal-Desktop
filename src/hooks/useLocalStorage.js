// src/hooks/useLocalStorage.js
import { useEffect, useState } from "react";

/**
 * useLocalStorage(key, initialValue)
 * - Keeps React state in sync with localStorage
 * - Avoids JSON parse errors and SSR issues
 */
export function useLocalStorage(key, initialValue) {
  const [state, setState] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return initialValue;
      return JSON.parse(raw);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch { /* ignore quota errors */ }
  }, [key, state]);

  return [state, setState];
}
