// proj/src/components/TopBarStatusChips.jsx
import React from 'react';
import { useControllerStore } from '../services/controllerStatus';

function fmtPlan(info) {
  if (!info) return "—";
  if (typeof info === "string") return info;
  const mode = info.mode || (info.tier && /m$/i.test(info.tier) ? "sub" : undefined);
  const plan = info.plan || info.tier || "—";
  const lim = info.tablesLimit ? ` • до ${info.tablesLimit}` : "";
  const exp = info.daysLeft != null ? ` • ${info.daysLeft} дн.` : (info.expiresAt ? " • до " + new Date(info.expiresAt).toLocaleDateString("uk-UA") : "");
  const prefix = mode === "sub" ? "Підписка" : "Повна";
  return `${prefix}: ${plan}${lim}${exp}`;
}

function GlassChip({ icon, children }) {
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/20 border border-white/10 text-slate-200 text-xs shadow-inner">
            {icon}
            <span className="truncate">{children}</span>
        </div>
    );
}

const IconInfo = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
);


export default function TopBarStatusChips({ licenseInfo, shiftStatus }) {
  const status = useControllerStore(s => s.status);
  
  const onlineCount = Object.values(status || {}).filter(v => v?.online).length;
  const totalCount = Object.keys(status || {}).length;

  let espOnline = null;
  if (totalCount > 0) {
    espOnline = onlineCount === totalCount;
  }

  return (
    <div className="items-center gap-2 hidden lg:flex">
      {totalCount > 0 && (
        <GlassChip icon={<div className={`w-2 h-2 rounded-full ${espOnline === null ? 'bg-yellow-400' : espOnline ? 'bg-emerald-400' : 'bg-rose-400'}`} />}>
          {espOnline ? `Реле онлайн (${onlineCount}/${totalCount})` : `Реле офлайн (${onlineCount}/${totalCount})`}
        </GlassChip>
      )}
      <GlassChip icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}>
          {fmtPlan(licenseInfo)}
      </GlassChip>
      {shiftStatus && (
          <GlassChip icon={<IconInfo className="w-4 w-4 text-cyan-300" />}>
              {shiftStatus}
          </GlassChip>
      )}
    </div>
  );
}