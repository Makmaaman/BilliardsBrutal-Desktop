import React from "react";
import { rtStore } from "../state/rtStore";
export function useRtStore(){
  const get = React.useCallback(()=>rtStore.getState(),[]);
  const sub = React.useCallback(cb=>rtStore.subscribe(()=>cb()),[]);
  return React.useSyncExternalStore(sub, get, get);
}
