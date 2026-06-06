import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Service } from '../src/service.js';
import { Metrics } from '../src/metrics.js';

const here = dirname(fileURLToPath(import.meta.url));
const stub = join(here, 'fixtures', 'stub-codexbar');

function makeService() {
  return new Service({
    codexbarBin: stub, providers: ['codex'], cacheTtlMs: 1000, execTimeoutMs: 5000,
  }, new Metrics());
}

test('getUsage returns reshaped, enveloped result', async () => {
  const svc = makeService();
  const res = await svc.getUsage();
  assert.equal(res.cached, false);
  assert.equal(res.providers[0].provider, 'codex');
  assert.equal(res.providers[0].usage.percent, 28);
});

test('second getUsage call is served from cache', async () => {
  const svc = makeService();
  await svc.getUsage();
  const res = await svc.getUsage();
  assert.equal(res.cached, true);
});

test('getCost respects days and getSummary merges', async () => {
  const svc = makeService();
  const cost = await svc.getCost(30);
  assert.equal(cost.providers[0].cost.window, '30d');
  const summary = await svc.getSummary(30);
  assert.equal(summary.providers[0].usage.percent, 28);
  assert.equal(summary.providers[0].cost.usd, 12.34);
});
