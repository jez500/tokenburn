/* TokenBurn — API client, formatters, and envelope→view-model mapping. */

export const PROVIDER_META = {
  claude: { name: 'Claude', accent: '#d9785b', glyph: '✳' },
  codex: { name: 'OpenAI', accent: '#10a37f', glyph: '◍' },
  gemini: { name: 'Gemini', accent: '#4587f0', glyph: '✦' },
  zai: { name: 'Z.AI', accent: '#8b5cf6', glyph: '◆' },
  // codexbar emits the id as "zai", but accept the config spelling "z.ai" too.
  'z.ai': { name: 'Z.AI', accent: '#8b5cf6', glyph: '◆' },
};

/* ---- formatters (mirror the prototype's tb-data.js) ---- */
export const fmtUSD = (n, dp = 2) =>
  '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtTok = (n) => {
  n = Number(n || 0);
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 2).replace(/\.0+$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(n);
};

export const pct = (n) => (n < 1 && n > 0 ? '<1' : Math.round(n)) + '%';

/* ---- time-relative derivations (now is injectable for tests) ---- */
export function relativeTime(iso, now = Date.now()) {
  if (!iso) return 'unknown';
  const s = Math.floor((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

export function fmtReset(iso, now = Date.now()) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return 'now';
  const totalMin = Math.floor(diff / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${String(h).padStart(2, '0')}h`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function computePace(win, now = Date.now()) {
  if (!win || win.usedPercent == null || !win.windowMinutes || !win.resetsAt) return null;
  const end = new Date(win.resetsAt).getTime();
  const windowMs = win.windowMinutes * 60000;
  const start = end - windowMs;
  const frac = Math.max(0.0001, Math.min(1, (now - start) / windowMs));
  const expected = frac * 100;
  const delta = Math.round(win.usedPercent - expected);
  const projectedEnd = win.usedPercent / frac;
  const state = projectedEnd >= 100 ? 'crit' : projectedEnd >= 80 ? 'warn' : 'ok';
  const label = delta > 5 ? 'Ahead' : delta < -5 ? 'Behind' : 'On track';
  return { label, delta, state };
}

function utcDateKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function buildSpend14(daily, now = Date.now(), days = 14) {
  if (!Array.isArray(daily) || daily.length === 0) return null;
  // Spend in $ where available (Claude/Codex); tokens for flat-rate providers (Z.AI).
  const byDate = new Map(daily.map((d) => [d.date, d.usd ?? d.tokens ?? 0]));
  const today = new Date(now);
  const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(byDate.get(utcDateKey(base - i * 86400000)) ?? 0);
  }
  return out;
}

export function deriveToday(daily, now = Date.now()) {
  if (!Array.isArray(daily) || daily.length === 0) return null;
  const key = utcDateKey(now);
  const e = daily.find((d) => d.date === key);
  return e ? { usd: e.usd ?? null, tokens: e.tokens ?? 0 } : null;
}

export function statusFromPct(p) {
  if (p == null) return 'ok';
  return p >= 95 ? 'crit' : p >= 80 ? 'warn' : 'ok';
}

export function prettyModel(name) {
  if (!name) return name;
  const m = String(name).match(/(opus|sonnet|haiku)-(\d+)-(\d+)/i);
  if (m) return m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + ' ' + m[2] + '.' + m[3];
  return name;
}

export function modelsFromCost(cost, topN = 4) {
  if (!cost || !Array.isArray(cost.models) || cost.models.length === 0) return null;
  // Share by spend when there's any $; otherwise by tokens (flat-rate providers).
  const usdTotal = cost.models.reduce((a, m) => a + (m.usd || 0), 0);
  const useTokens = usdTotal <= 0;
  const total = (useTokens ? cost.models.reduce((a, m) => a + (m.tokens || 0), 0) : usdTotal) || 1;
  return cost.models.slice(0, topN).map((m) => ({
    name: prettyModel(m.name),
    pct: ((useTokens ? m.tokens || 0 : m.usd || 0) / total) * 100,
  }));
}

const WEEK_MINUTES = 10080;

// codexbar orders usage windows differently per provider (e.g. Z.AI puts its
// 1-week window in `primary` and its 5h window in `tertiary`). Select the two
// meters the dashboard shows by window DURATION, not slot position:
//   session = the shortest-duration window (e.g. the ~5h limit)
//   weekly  = the ~1-week (10080 min) window
export function pickWindows(u) {
  const all = [u?.windows?.primary, u?.windows?.secondary, u?.windows?.tertiary]
    .filter((w) => w && w.usedPercent != null);
  let session = null;
  for (const w of all) {
    if (w.windowMinutes == null) continue; // undurated windows can't be the session
    if (!session || w.windowMinutes < session.windowMinutes) session = w;
  }
  const weekly =
    all.find((w) => w !== session && w.windowMinutes === WEEK_MINUTES) ||
    all.find((w) => w !== session && w.windowMinutes != null && w.windowMinutes >= 1440) ||
    null;
  return { session, weekly };
}

export function mapProvider(entry, now = Date.now()) {
  const meta = PROVIDER_META[entry.provider] || { name: entry.provider, accent: '#4f8df7', glyph: '○' };
  const u = entry.usage;
  const { session: sw, weekly: ww } = pickWindows(u);
  const session = sw
    ? { pct: sw.usedPercent, resetsIn: fmtReset(sw.resetsAt, now) } : null;
  const weekly = ww
    ? { pct: ww.usedPercent, resetsIn: fmtReset(ww.resetsAt, now), pace: computePace(ww, now) } : null;
  const extraWin = u?.extra?.[0];
  const cost = entry.cost;
  return {
    id: entry.provider,
    name: meta.name,
    accent: meta.accent,
    glyph: meta.glyph,
    error: entry.error?.message || null,
    updated: relativeTime(entry.updatedAt, now),
    plan: u?.plan || null,
    status: statusFromPct(weekly?.pct ?? session?.pct),
    session,
    weekly,
    extra: extraWin ? { title: extraWin.title || 'Extra', pct: extraWin.percent ?? 0 } : null,
    models: modelsFromCost(cost),
    cost: {
      today: cost ? deriveToday(cost.daily, now) : null,
      // Present when there's $ (Claude/Codex) or tokens (Z.AI). usd may be null.
      last30: cost && (cost.usd != null || cost.tokens?.total != null)
        ? { usd: cost.usd ?? null, tokens: cost.tokens?.total ?? 0 }
        : null,
    },
    spend14: cost ? buildSpend14(cost.daily, now) : null,
  };
}

export function mapProviders(envelope, now = Date.now()) {
  return (envelope?.providers || []).map((e) => mapProvider(e, now));
}

// Providers that errored (e.g. missing API key, not logged in) are treated as
// unconfigured and hidden from the dashboard.
export function visibleProviders(list) {
  return (list || []).filter((p) => !p.error);
}
