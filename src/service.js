import { runCodexbar } from './codexbar.js';
import { TtlCache } from './cache.js';
import { transformUsage, transformCost, mergeUsageCost } from './transform.js';
import { sourceForProvider, costSupported, usageArgs, costArgs } from './source-map.js';
import { ZaiClient } from './zai.js';

function nowIso() {
  return new Date().toISOString();
}

// codexbar accepts the provider as "z.ai" (config spelling) but emits "zai".
const isZai = (p) => p === 'zai' || p === 'z.ai';

export class Service {
  constructor(config, metrics, deps = {}) {
    this.config = config;
    this.metrics = metrics;
    this.cache = new TtlCache(config.cacheTtlMs);
    this.run = deps.run || runCodexbar;
    // Direct Z.AI monitor client (richer than codexbar). null when unconfigured.
    this.zai = deps.zai !== undefined
      ? deps.zai
      : (config.zaiApiKey ? new ZaiClient(config.zaiApiKey) : null);
  }

  _providersFor(provider) {
    return provider && provider !== 'all' ? [provider] : this.config.providers;
  }

  async _exec(args) {
    const command = args[0];
    const start = Date.now();
    try {
      const out = await this.run(this.config.codexbarBin, args, this.config.execTimeoutMs);
      this.metrics.recordScrape(command, true, (Date.now() - start) / 1000);
      return Array.isArray(out) ? out : [out];
    } catch (e) {
      this.metrics.recordScrape(command, false, (Date.now() - start) / 1000);
      throw e;
    }
  }

  async _usageOne(provider) {
    const source = sourceForProvider(provider, this.config.oauthProviders);
    let base;
    try {
      base = await this._exec(usageArgs(provider, source));
    } catch (e) {
      base = [{ provider, source, error: { message: e.message } }];
    }
    // Z.AI: keep codexbar's window meters, but enrich with the plan tier from
    // the monitor API. If codexbar errored but the API works, surface a
    // non-error entry so the provider still shows (with plan, no windows).
    if (isZai(provider) && this.zai) {
      try {
        const plan = await this.zai.fetchPlan();
        const entry = base.find((x) => x && !x.error) || base[0];
        if (!entry || entry.error) {
          // codexbar errored but the API works → show with plan, no windows.
          // Use "zai" (codexbar's output id) so it merges with the cost entry.
          return [{ provider: 'zai', source: 'zai-api', usage: { loginMethod: plan } }];
        }
        entry.usage = entry.usage || {};
        entry.usage.loginMethod = plan;
      } catch (e) {
        // Z.AI API unreachable → fall back to codexbar's result as-is.
      }
    }
    return base;
  }

  async _costOne(provider, explicit) {
    // Z.AI has no codexbar cost, but the monitor API provides token usage.
    if (isZai(provider) && this.zai) {
      try {
        return [await this.zai.fetchCostRaw(30)];
      } catch (e) {
        return [];
      }
    }
    if (!costSupported(provider)) {
      return explicit
        ? [{ provider, error: { message: 'cost is only supported for Claude and Codex' } }]
        : [];
    }
    try {
      return await this._exec(costArgs(provider));
    } catch (e) {
      return [{ provider, error: { message: e.message } }];
    }
  }

  _envelope(providers, cached) {
    this.metrics.recordProviders(providers);
    return { generatedAt: nowIso(), cached, providers };
  }

  // Total failure (every requested provider errored) is a real outage → surface
  // as a thrown error so the route returns 502. Partial failures stay 200.
  _failIfAllErrored(entries) {
    if (entries.length && entries.every((e) => e.error)) {
      throw new Error(entries.map((e) => e.error.message).join('; '));
    }
  }

  async getUsage(provider = 'all') {
    const key = `usage:${provider}`;
    let cached = true;
    const providers = await this.cache.getOrLoad(key, async () => {
      cached = false;
      const list = this._providersFor(provider);
      const raws = (await Promise.all(list.map((p) => this._usageOne(p)))).flat();
      const result = transformUsage(raws);
      this._failIfAllErrored(result);
      return result;
    });
    return this._envelope(providers, cached);
  }

  async getCost(days = 30, provider = 'all') {
    const key = `cost:${provider}:${days}`;
    const explicit = provider && provider !== 'all';
    let cached = true;
    const providers = await this.cache.getOrLoad(key, async () => {
      cached = false;
      const list = this._providersFor(provider);
      const raws = (await Promise.all(list.map((p) => this._costOne(p, explicit)))).flat();
      return transformCost(raws, days);
    });
    return this._envelope(providers, cached);
  }

  async getSummary(days = 30, provider = 'all') {
    const key = `summary:${provider}:${days}`;
    const explicit = provider && provider !== 'all';
    let cached = true;
    const providers = await this.cache.getOrLoad(key, async () => {
      cached = false;
      const list = this._providersFor(provider);
      const [usageRaws, costRaws] = await Promise.all([
        Promise.all(list.map((p) => this._usageOne(p))).then((a) => a.flat()),
        Promise.all(list.map((p) => this._costOne(p, explicit))).then((a) => a.flat()),
      ]);
      // Best-effort like getCost: no _failIfAllErrored — partial/empty results are valid.
      return mergeUsageCost(transformUsage(usageRaws), transformCost(costRaws, days));
    });
    return this._envelope(providers, cached);
  }
}
