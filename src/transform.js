function toArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return [raw];
  return [];
}

function mapExtra(u) {
  const list = Array.isArray(u.extraRateWindows) ? u.extraRateWindows : [];
  return list.map((e) => {
    const w = e.window || {};
    return {
      id: e.id ?? null,
      title: e.title ?? null,
      percent: w.usedPercent ?? null,
      windowMinutes: w.windowMinutes ?? null,
    };
  });
}

export function transformUsage(raw) {
  return toArray(raw).map((p) => {
    const u = p.usage || {};
    return {
      provider: p.provider ?? null,
      source: p.source ?? null,
      updatedAt: u.updatedAt ?? p.updatedAt ?? null,
      usage: {
        percent: u.primary?.usedPercent ?? null,
        resetsAt: u.primary?.resetsAt ?? null,
        plan: u.loginMethod ?? u.identity?.loginMethod ?? null,
        extra: mapExtra(u),
        windows: {
          primary: u.primary ?? null,
          secondary: u.secondary ?? null,
          tertiary: u.tertiary ?? null,
        },
        raw: p.usage ?? null,
      },
      cost: null,
      error: p.error ?? null,
    };
  });
}

export function transformCost(raw, days) {
  return toArray(raw).map((p) => {
    const historyDays = p.historyDays ?? days;
    return {
      provider: p.provider ?? null,
      source: p.source ?? null,
      updatedAt: p.updatedAt ?? null,
      usage: null,
      cost: p.error
        ? null
        : {
            window: `${historyDays}d`,
            usd: p.last30DaysCostUSD ?? null,
            tokens: { total: p.last30DaysTokens ?? null },
            session: { usd: p.sessionCostUSD ?? null, tokens: p.sessionTokens ?? null },
            totals: p.totals ?? null,
            raw: p,
          },
      error: p.error ?? null,
    };
  });
}

export function mergeUsageCost(usageEntries, costEntries) {
  const byProvider = new Map();
  for (const e of usageEntries) {
    byProvider.set(e.provider, { ...e });
  }
  for (const c of costEntries) {
    const existing = byProvider.get(c.provider);
    if (existing) {
      existing.cost = c.cost;
      existing.updatedAt = existing.updatedAt || c.updatedAt;
    } else {
      byProvider.set(c.provider, { ...c });
    }
  }
  return [...byProvider.values()];
}
