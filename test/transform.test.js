import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformUsage, transformCost, mergeUsageCost } from '../src/transform.js';

test('transformUsage normalizes a single object into provider entries', () => {
  const raw = {
    provider: 'codex',
    source: 'openai-web',
    usage: {
      primary: { usedPercent: 28, windowMinutes: 300, resetsAt: '2026-06-06T12:00:00Z' },
      secondary: { usedPercent: 59, windowMinutes: 10080, resetsAt: '2026-06-10T00:00:00Z' },
      tertiary: null,
      updatedAt: '2026-06-06T11:58:00Z'
    }
  };
  const out = transformUsage(raw);
  assert.equal(out.length, 1);
  assert.equal(out[0].provider, 'codex');
  assert.equal(out[0].source, 'openai-web');
  assert.equal(out[0].updatedAt, '2026-06-06T11:58:00Z');
  assert.equal(out[0].usage.percent, 28);
  assert.equal(out[0].usage.resetsAt, '2026-06-06T12:00:00Z');
  assert.equal(out[0].usage.windows.secondary.usedPercent, 59);
  assert.equal(out[0].error, null);
});

test('transformUsage handles array input and missing usage gracefully', () => {
  const out = transformUsage([{ provider: 'gemini' }]);
  assert.equal(out[0].provider, 'gemini');
  assert.equal(out[0].usage.percent, null);
  assert.equal(out[0].error, null);
});

test('transformCost maps cost array entries', () => {
  const raw = [{
    provider: 'codex', source: 'openai', updatedAt: '2026-06-06T11:00:00Z',
    sessionTokens: 1000, sessionCostUSD: 0.5,
    last30DaysTokens: 50000, last30DaysCostUSD: 12.34
  }];
  const out = transformCost(raw, 30);
  assert.equal(out[0].provider, 'codex');
  assert.equal(out[0].cost.window, '30d');
  assert.equal(out[0].cost.usd, 12.34);
  assert.equal(out[0].cost.tokens.total, 50000);
  assert.equal(out[0].cost.session.usd, 0.5);
  assert.equal(out[0].usage, null);
});

test('mergeUsageCost combines by provider id', () => {
  const usage = transformUsage({ provider: 'codex', usage: { primary: { usedPercent: 28 } } });
  const cost = transformCost([{ provider: 'codex', last30DaysCostUSD: 9 }], 30);
  const merged = mergeUsageCost(usage, cost);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].usage.percent, 28);
  assert.equal(merged[0].cost.usd, 9);
});

test('transformCost uses real historyDays for window and passes through totals', () => {
  const raw = [{
    provider: 'claude', source: 'local', historyDays: 30,
    last30DaysCostUSD: 42.5, last30DaysTokens: 12000000,
    sessionCostUSD: 1.2, sessionTokens: 250000,
    totals: { totalCost: 42.5, totalTokens: 12000000 },
  }];
  const [c] = transformCost(raw, 7); // requested days=7, but binary reports 30
  assert.equal(c.cost.window, '30d');
  assert.equal(c.cost.usd, 42.5);
  assert.equal(c.cost.tokens.total, 12000000);
  assert.equal(c.cost.session.usd, 1.2);
  assert.deepEqual(c.cost.totals, { totalCost: 42.5, totalTokens: 12000000 });
});

test('transformCost falls back to requested days when historyDays absent', () => {
  const [c] = transformCost([{ provider: 'codex' }], 30);
  assert.equal(c.cost.window, '30d');
  assert.equal(c.cost.usd, null);
});

test('transformCost yields null cost (not numbers) for an error entry', () => {
  const [c] = transformCost([{ provider: 'zai', error: { message: 'unsupported' } }], 30);
  assert.equal(c.cost, null);
  assert.deepEqual(c.error, { message: 'unsupported' });
});
