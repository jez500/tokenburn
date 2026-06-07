import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Service } from '../src/service.js';
import { Metrics } from '../src/metrics.js';

const here = dirname(fileURLToPath(import.meta.url));
const stub = join(here, 'fixtures', 'stub-codexbar');

function baseConfig(overrides = {}) {
  return {
    codexbarBin: stub,
    providers: ['codex'],
    cacheTtlMs: 1000,
    execTimeoutMs: 5000,
    oauthProviders: new Set(['claude', 'codex']),
    ...overrides,
  };
}

function makeService(overrides = {}, deps = {}) {
  return new Service(baseConfig(overrides), new Metrics(), deps);
}

test('getUsage returns reshaped, enveloped result (via stub)', async () => {
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

test('getCost respects stub and getSummary merges (via stub)', async () => {
  const svc = makeService();
  const cost = await svc.getCost(30);
  assert.equal(cost.providers[0].cost.window, '30d');
  const summary = await svc.getSummary(30);
  assert.equal(summary.providers[0].usage.percent, 28);
  assert.equal(summary.providers[0].cost.usd, 12.34);
});

test('usage uses --source oauth for claude/codex and --source api for others', async () => {
  const calls = [];
  const run = async (_bin, args) => {
    calls.push(args);
    const p = args[args.indexOf('--provider') + 1];
    const s = args[args.indexOf('--source') + 1];
    return [{ provider: p, source: s, usage: { primary: { usedPercent: 1 } } }];
  };
  const svc = makeService({ providers: ['claude', 'codex', 'zai'] }, { run });
  const res = await svc.getUsage();
  const bySource = Object.fromEntries(res.providers.map((p) => [p.provider, p.source]));
  assert.equal(bySource.claude, 'oauth');
  assert.equal(bySource.codex, 'oauth');
  assert.equal(bySource.zai, 'api');
});

test('cost is skipped for non-claude/codex and passes no --days/--source', async () => {
  const calls = [];
  const run = async (_bin, args) => {
    calls.push(args);
    const p = args[args.indexOf('--provider') + 1];
    return [{ provider: p, historyDays: 30, last30DaysCostUSD: 5 }];
  };
  const svc = makeService({ providers: ['claude', 'zai'] }, { run });
  const res = await svc.getCost(30);
  assert.equal(calls.length, 1); // only claude queried
  assert.equal(calls[0][calls[0].indexOf('--provider') + 1], 'claude');
  assert.ok(!calls[0].includes('--days'));
  assert.ok(!calls[0].includes('--source'));
  assert.equal(res.providers.length, 1);
  assert.equal(res.providers[0].provider, 'claude');
});

test('explicit cost request for unsupported provider returns an error entry', async () => {
  let called = 0;
  const run = async () => { called += 1; return []; };
  const svc = makeService({ providers: ['claude', 'codex'] }, { run });
  const res = await svc.getCost(30, 'zai');
  assert.equal(called, 0);
  assert.equal(res.providers.length, 1);
  assert.equal(res.providers[0].provider, 'zai');
  assert.match(res.providers[0].error.message, /only supported for Claude and Codex/);
});

test('one failing provider does not fail the combined usage request', async () => {
  const run = async (_bin, args) => {
    const p = args[args.indexOf('--provider') + 1];
    if (p === 'codex') throw new Error('boom');
    return [{ provider: p, source: 'oauth', usage: { primary: { usedPercent: 2 } } }];
  };
  const svc = makeService({ providers: ['claude', 'codex'] }, { run });
  const res = await svc.getUsage();
  const codex = res.providers.find((p) => p.provider === 'codex');
  const claude = res.providers.find((p) => p.provider === 'claude');
  assert.match(codex.error.message, /boom/);
  assert.equal(claude.usage.percent, 2);
});

test('getUsage throws (→502) only when ALL providers fail', async () => {
  const run = async () => { throw new Error('total outage'); };
  const svc = makeService({ providers: ['claude', 'codex'] }, { run });
  await assert.rejects(() => svc.getUsage(), /total outage/);
});

test('getSummary does not throw (stays best-effort) when every provider fails', async () => {
  const run = async () => { throw new Error('everything down'); };
  const svc = makeService({ providers: ['claude', 'codex'] }, { run });
  const res = await svc.getSummary(30);
  assert.equal(res.providers.length, 2);
  assert.ok(res.providers.every((p) => p.error));
});

test('zai enrichment: plan + token cost merge for the "z.ai" config id (emitted as "zai")', async () => {
  const run = async () => [{ provider: 'zai', source: 'api', usage: { primary: { usedPercent: 10, windowMinutes: 300 } } }];
  const zai = {
    fetchPlan: async () => 'GLM Coding Pro',
    fetchCostRaw: async () => ({
      provider: 'zai', source: 'zai-api', historyDays: 30, last30DaysCostUSD: null, last30DaysTokens: 1000,
      daily: [{ date: '2026-06-07', totalCost: null, totalTokens: 1000, modelBreakdowns: [{ modelName: 'GLM-4.7', cost: null, totalTokens: 1000 }] }],
    }),
  };
  const svc = makeService({ providers: ['z.ai'] }, { run, zai });
  const r = await svc.getSummary(30);
  const z = r.providers.find((p) => p.provider === 'zai');
  assert.equal(z.usage.plan, 'GLM Coding Pro');
  assert.equal(z.cost.usd, null);
  assert.equal(z.cost.tokens.total, 1000);
  assert.equal(z.cost.models[0].name, 'GLM-4.7');
});
