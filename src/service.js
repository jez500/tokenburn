import { runCodexbar } from './codexbar.js';
import { TtlCache } from './cache.js';
import { transformUsage, transformCost, mergeUsageCost } from './transform.js';

function nowIso() {
  return new Date().toISOString();
}

export class Service {
  constructor(config, metrics) {
    this.config = config;
    this.metrics = metrics;
    this.cache = new TtlCache(config.cacheTtlMs);
  }

  _providerArgs(provider) {
    return provider && provider !== 'all'
      ? ['--provider', provider]
      : ['--provider', 'all'];
  }

  async _exec(command, args) {
    const start = Date.now();
    try {
      const out = await runCodexbar(this.config.codexbarBin, [command, ...args, '--format', 'json'], this.config.execTimeoutMs);
      this.metrics.recordScrape(command, true, (Date.now() - start) / 1000);
      return out;
    } catch (e) {
      this.metrics.recordScrape(command, false, (Date.now() - start) / 1000);
      throw e;
    }
  }

  _envelope(providers, cached) {
    this.metrics.recordProviders(providers);
    return { generatedAt: nowIso(), cached, providers };
  }

  async getUsage(provider = 'all') {
    const key = `usage:${provider}`;
    let cached = true;
    const providers = await this.cache.getOrLoad(key, async () => {
      cached = false;
      const raw = await this._exec('usage', this._providerArgs(provider));
      return transformUsage(raw);
    });
    return this._envelope(providers, cached);
  }

  async getCost(days = 30, provider = 'all') {
    const key = `cost:${provider}:${days}`;
    let cached = true;
    const providers = await this.cache.getOrLoad(key, async () => {
      cached = false;
      const raw = await this._exec('cost', [...this._providerArgs(provider), '--days', String(days)]);
      return transformCost(raw, days);
    });
    return this._envelope(providers, cached);
  }

  async getSummary(days = 30, provider = 'all') {
    const key = `summary:${provider}:${days}`;
    let cached = true;
    const providers = await this.cache.getOrLoad(key, async () => {
      cached = false;
      const [usageRaw, costRaw] = await Promise.all([
        this._exec('usage', this._providerArgs(provider)),
        this._exec('cost', [...this._providerArgs(provider), '--days', String(days)]),
      ]);
      return mergeUsageCost(transformUsage(usageRaw), transformCost(costRaw, days));
    });
    return this._envelope(providers, cached);
  }
}
