// src/hooks/useLicenseReminders.js
import { useEffect } from "react";
import { pollLicenseReminders } from "../services/license";

/**
 * Викликає cb під час наближення завершення тесту/ліцензії.
 * Приклад: useLicenseReminders((e)=>alert(`Залишилось ${e.daysLeft} днів`));
 */
export default function useLicenseReminders(cb, opts){
  useEffect(()=>{
    let stop;
    (async () => { stop = await pollLicenseReminders(cb, opts); })();
    return () => { try{ stop && stop(); } catch{} };
  }, [cb, opts?.intervalMs]);
}
