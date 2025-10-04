
// src/lib/confirm.js
let _ask = null;

/** Internal: provider registers itself here */
export function _registerConfirm(fn){
  _ask = fn;
}

/**
 * Async confirm that returns a Promise<boolean>.
 * If provider is missing, falls back to native confirm to avoid breaking UX.
 */
export async function confirmAsync(message, opts = {}){
  if (typeof _ask === "function"){
    try{
      return await _ask(String(message ?? ""), opts);
    }catch(e){
      return false;
    }
  }
  try{
    return !!window.confirm(String(message ?? ""));
  }catch{
    return false;
  }
}
