// Logic-only rework; keeps layout to parent. No style changes here.
import React, { useMemo, useState, useEffect } from "react";
import { isValidIPv4, cleanIP } from "../../../utils/ip";
import { updateOnlineMeta, pingController } from "../../../services/esp";

export default function ControllersTab({ controllers, setControllers }) {
  const [draft, setDraft] = useState(() => controllers || []);
  const [testingId, setTestingId] = useState(null);

  useEffect(() => setDraft(controllers || []), [controllers]);

  function onChangeField(idx, field, value) {
    setDraft(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === "espIP") {
        next[idx].espIP = cleanIP(String(value || ""));
        next[idx].ipValid = isValidIPv4(next[idx].espIP);
      }
      if (field === "relayIPs") {
        const arr = (value || []).map(v => cleanIP(String(v || "")));
        next[idx].relayIPs = arr;
      }
      return next;
    });
  }

  async function testController(idx) {
    const c = draft[idx];
    if (!c) return;
    setTestingId(c.id || idx);
    const res = await pingController({ ...c, espIP: cleanIP(c.espIP) });
    const updated = {
      ...c,
      online: !!res.ok,
      latency: res.ok ? res.ms : undefined,
      lastSeen: res.ok ? Date.now() : c.lastSeen
    };
    setDraft(prev => {
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
    setTestingId(null);
  }

  function saveAll() {
    const next = (draft || []).map(c => {
      const ip = cleanIP(c.espIP || "");
      const ipValid = isValidIPv4(ip);
      if (c.enabled && !ipValid) {
        return { ...c, enabled: false, ipValid };
      }
      return { ...c, espIP: ip, ipValid };
    });
    setControllers(next);
  }

  useEffect(() => {
    let stop = false;
    async function refreshLoop() {
      while (!stop) {
        const updated = await Promise.all((draft || []).map(c => updateOnlineMeta(c)));
        if (!stop) setDraft(updated);
        await new Promise(r => setTimeout(r, 7000));
      }
    }
    refreshLoop();
    return () => { stop = true; };
  }, []);

  return (
    <div>
      {(draft || []).map((c, idx) => (
        <div key={c.id || idx} className="controller-row">
          <div className="row-main">
            <input
              value={c.name || ""}
              onChange={e => onChangeField(idx, "name", e.target.value)}
              placeholder="Назва контролера"
            />
            <input
              value={c.espIP || ""}
              onChange={e => onChangeField(idx, "espIP", e.target.value)}
              placeholder="IP контролера (наприклад 192.168.0.185)"
            />
            <label className="toggle">
              <input
                type="checkbox"
                checked={!!c.enabled}
                onChange={e => onChangeField(idx, "enabled", e.target.checked)}
              />
              <span>Увімкнено</span>
            </label>
            <button
              onClick={() => testController(idx)}
              disabled={testingId === (c.id || idx)}
              title={c.online ? `Онлайн • ${c.latency ?? "-"} мс` : "Офлайн"}
            >
              {testingId === (c.id || idx) ? "Тест..." : (c.online ? "Пінг OK" : "Тест пінга")}
            </button>
          </div>
          {c.ipValid === false && c.enabled && (
            <div className="warn">IP некоректний. Контролер вимкнено.</div>
          )}
        </div>
      ))}
      <div className="actions">
        <button onClick={saveAll}>Зберегти</button>
      </div>
    </div>
  );
}
