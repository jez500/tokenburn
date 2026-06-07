// Direct client for Z.AI's usage monitor API. codexbar only exposes Z.AI's
// window percentages; this surfaces the richer data the API provides (plan
// tier, token totals, per-model breakdown, daily token series) by shaping it
// into the same raw shape codexbar emits, so the existing transform pipeline
// consumes it unchanged. Z.AI GLM plans are flat-rate, so cost is null and the
// meaningful metric is tokens.

const BASE = 'https://api.z.ai';

function authHeaders(apiKey) {
  return { Authorization: apiKey, 'Accept-Language': 'en-US,en', 'Content-Type': 'application/json' };
}

function fmtDateTime(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Map a model-usage response into codexbar's cost raw shape (usd null; tokens
// populated). transformCost then yields cost.{tokens,daily,models}.
export function modelUsageToCostRaw(data, days) {
  const d = data || {};
  const times = Array.isArray(d.x_time) ? d.x_time : [];
  const perBucket = Array.isArray(d.tokensUsage) ? d.tokensUsage : [];
  const models = Array.isArray(d.modelDataList) ? d.modelDataList : [];
  const daily = times.map((t, i) => ({
    date: String(t).slice(0, 10),
    totalCost: null,
    totalTokens: perBucket[i] ?? 0,
    modelBreakdowns: models
      .map((m) => ({ modelName: m.modelName, cost: null, totalTokens: (m.tokensUsage || [])[i] ?? 0 }))
      .filter((m) => m.totalTokens > 0),
  }));
  return {
    provider: 'zai',
    source: 'zai-api',
    historyDays: days,
    last30DaysCostUSD: null,
    last30DaysTokens: d.totalUsage?.totalTokensUsage ?? null,
    daily,
  };
}

export class ZaiClient {
  constructor(apiKey, { fetchImpl = fetch, now = () => new Date() } = {}) {
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.now = now;
  }

  async _get(path) {
    const res = await this.fetch(BASE + path, { headers: authHeaders(this.apiKey) });
    const body = await res.json();
    // The API returns HTTP 200 with a {code,success} envelope even on auth errors.
    if (!body || body.success === false || (body.code && body.code !== 200)) {
      throw new Error(`zai api ${path}: ${(body && body.msg) || res.status}`);
    }
    return body.data;
  }

  // Subscription tier, e.g. "GLM Coding Pro".
  async fetchPlan() {
    const data = await this._get('/api/monitor/usage/quota/limit');
    return data && data.level ? `GLM Coding ${cap(data.level)}` : null;
  }

  // codexbar-cost-shaped raw for the trailing `days` window.
  async fetchCostRaw(days = 30) {
    const now = this.now();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 0, 0, 0);
    const qs = `?startTime=${encodeURIComponent(fmtDateTime(start))}&endTime=${encodeURIComponent(fmtDateTime(end))}`;
    const data = await this._get('/api/monitor/usage/model-usage' + qs);
    return modelUsageToCostRaw(data, days);
  }
}
