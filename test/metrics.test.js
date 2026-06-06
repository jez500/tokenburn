import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Metrics } from '../src/metrics.js';

test('recordProviders sets cost and usage gauges', async () => {
  const m = new Metrics();
  m.recordProviders([
    { provider: 'codex', usage: { percent: 28 }, cost: { window: '30d', usd: 12.34 } },
    { provider: 'claude', usage: { percent: null }, cost: null, error: 'missing credential' },
  ]);
  const text = await m.registry.metrics();
  assert.match(text, /codexbar_usage_percent\{provider="codex"\} 28/);
  assert.match(text, /codexbar_cost_usd\{provider="codex",window="30d"\} 12.34/);
});

test('recordScrape increments success/failure counters', async () => {
  const m = new Metrics();
  m.recordScrape('usage', true, 0.12);
  m.recordScrape('usage', false, 0.05);
  const text = await m.registry.metrics();
  assert.match(text, /codexbar_scrape_success_total\{command="usage"\} 1/);
  assert.match(text, /codexbar_scrape_failure_total\{command="usage"\} 1/);
});
