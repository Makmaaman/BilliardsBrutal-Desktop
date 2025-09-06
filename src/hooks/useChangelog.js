// src/hooks/useChangelog.js
import data from "../meta/changelog.json";

const LS_LAST_SEEN_VER = "bb_last_seen_version";

function cmp(a, b) {
  const pa = String(a).split(".").map(n => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function useChangelog(appVersion) {
  const entries = [...(data.entries || [])].sort((a, b) => cmp(b.version, a.version));
  const footerTagline = data.footerTagline || "";

  const lastSeen = (typeof localStorage !== "undefined" && localStorage.getItem(LS_LAST_SEEN_VER)) || "";
  const shouldShowOnBoot = appVersion && lastSeen !== appVersion;

  function markSeen(version) {
    try { localStorage.setItem(LS_LAST_SEEN_VER, version || ""); } catch {}
  }

  return { entries, footerTagline, shouldShowOnBoot, markSeen };
}
