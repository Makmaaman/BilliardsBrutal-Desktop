
// src/components/GlobalAlerts.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import ModalShell from "./ModalShell";
import { _registerConfirm } from "../lib/confirm";

export default function GlobalAlertsProvider({ children }) {
  const [confirmState, setConfirmState] = useState({ open: false, message: "", resolve: null, yesText: "OK", noText: "Скасувати" });
  const lastFocusRef = React.useRef(null);

  const [state, setState] = useState({ open: false, message: "" });

  const openAlert = useCallback((message) => {
    setState({ open: true, message: String(message ?? "") });
  }, []);

  const closeAlert = useCallback(() => setState({ open: false, message: "" }), []);

    // Реєструємо confirmAsync провайдер
  useEffect(() => {
    _registerConfirm((message, opts = {}) => new Promise((resolve) => {
      lastFocusRef.current = document.activeElement;
      setConfirmState({ open: true, message, resolve, yesText: opts.yesText || "OK", noText: opts.noText || "Скасувати" });
    }));
    return () => _registerConfirm(null);
  }, []);

// Перехоплюємо window.alert
  useEffect(() => {
    const prev = window.alert;
    window.alert = (msg) => {
      openAlert(msg);
    };
    return () => { window.alert = prev; };
  }, [openAlert]);

  return (
    <>
      {children}
      <ModalShell
        open={state.open}
        onClose={closeAlert}
        title="Повідомлення"
        maxWidth={560}
        maxHeightVh={70}
        footer={
          <div className="text-right">
            <button
              type="button"
              className="h-9 px-4 rounded-lg bg-slate-900 text-white hover:brightness-110"
              onClick={closeAlert}
            >
              OK
            </button>
          </div>
        }
      >
        <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{state.message}</div>
      </ModalShell>

      {/* Confirm modal */}
      <ModalShell
        open={confirmState.open}
        onClose={() => {
          const res = confirmState.resolve; setConfirmState(s=>({ ...s, open:false }));
          if (res) res(false);
          setTimeout(()=> lastFocusRef.current && lastFocusRef.current.focus?.(), 0);
        }}
        title="Підтвердження"
        maxWidth={420}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="h-9 px-4 rounded-lg bg-slate-200"
              onClick={() => {
                const res = confirmState.resolve; setConfirmState(s=>({ ...s, open:false }));
                if (res) res(false);
                setTimeout(()=> lastFocusRef.current && lastFocusRef.current.focus?.(), 0);
              }}
            >{confirmState.noText || "Скасувати"}</button>
            <button
              type="button"
              className="h-9 px-4 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => {
                const res = confirmState.resolve; setConfirmState(s=>({ ...s, open:false }));
                if (res) res(true);
                setTimeout(()=> lastFocusRef.current && lastFocusRef.current.focus?.(), 0);
              }}
            >{confirmState.yesText || "OK"}</button>
          </div>
        }
      >
        <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{confirmState.message}</div>
      </ModalShell>
    </>
  );
}
