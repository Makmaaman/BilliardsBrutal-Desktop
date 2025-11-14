// React hook to keep controllers and TopBar chip in real-time sync from ONE loop.
import { useEffect, useMemo, useRef } from "react";
import { updateOnlineMeta, summarizeControllersStrict } from "../services/esp";

export function useControllersOnline(controllers, setControllers, intervalMs = 7000) {
  const timer = useRef(null);

  useEffect(() => {
    let mounted = true;
    async function tick() {
      if (!mounted) return;
      // single source of truth refresh
      setControllers(prev => Promise.all((prev || []).map(c => updateOnlineMeta(c))));
    }
    // leading edge
    tick();
    timer.current = setInterval(tick, intervalMs);
    return () => { mounted = false; clearInterval(timer.current); };
  }, [setControllers, intervalMs]);

  const relayStatus = useMemo(
    () => summarizeControllersStrict(controllers || []),
    [controllers]
  );

  return { relayStatus };
}
