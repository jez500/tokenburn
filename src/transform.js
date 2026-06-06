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

function mapDaily(daily) {
  if (!Array.isArray(daily)) return [];
  return daily.map((d) => ({
    date: d.date ?? null,
    usd: d.totalCost ?? null,
    tokens: d.totalTokens ?? null,
    models: (Array.isArray(d.modelBreakdowns) ? d.modelBreakdowns : []).map((m) => ({
      name: m.modelName ?? null,
      usd: m.cost ?? null,
      tokens: m.totalTokens ?? null,
    })),
  }));
}

function aggregateModels(daily) {
  const acc = new Map();
  for (const d of Array.isArray(daily) ? daily : []) {
    for (const m of Array.isArray(d.modelBreakdowns) ? d.modelBreakdowns : []) {
      const cur = acc.get(m.modelName) || { name: m.modelName ?? null, usd: 0, tokens: 0 };
      cur.usd += m.cost ?? 0;
      cur.tokens += m.totalTokens ?? 0;
      acc.set(m.modelName, cur);
    }
  }
  return [...acc.values()].sort((a, b) => b.usd - a.usd);
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
            daily: mapDaily(p.daily),
            models: aggregateModels(p.daily),
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
