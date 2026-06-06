import { Registry, Gauge, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

export class Metrics {
  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });

    this.usagePercent = new Gauge({
      name: 'codexbar_usage_percent', help: 'Provider usage percent (primary window)',
      labelNames: ['provider'], registers: [this.registry],
    });
    this.costUsd = new Gauge({
      name: 'codexbar_cost_usd', help: 'Provider cost in USD over the window',
      labelNames: ['provider', 'window'], registers: [this.registry],
    });
    this.scrapeSuccess = new Counter({
      name: 'codexbar_scrape_success_total', help: 'Successful codexbar scrapes',
      labelNames: ['command'], registers: [this.registry],
    });
    this.scrapeFailure = new Counter({
      name: 'codexbar_scrape_failure_total', help: 'Failed codexbar scrapes',
      labelNames: ['command'], registers: [this.registry],
    });
    this.scrapeDuration = new Histogram({
      name: 'codexbar_scrape_duration_seconds', help: 'codexbar scrape duration',
      labelNames: ['command'], registers: [this.registry],
    });
  }

  recordProviders(entries) {
    for (const e of entries) {
      if (e.usage && typeof e.usage.percent === 'number') {
        this.usagePercent.set({ provider: e.provider }, e.usage.percent);
      }
      if (e.cost && typeof e.cost.usd === 'number') {
        this.costUsd.set({ provider: e.provider, window: e.cost.window }, e.cost.usd);
      }
    }
  }

  recordScrape(command, ok, durationSeconds) {
    if (ok) this.scrapeSuccess.inc({ command });
    else this.scrapeFailure.inc({ command });
    this.scrapeDuration.observe({ command }, durationSeconds);
  }
}
