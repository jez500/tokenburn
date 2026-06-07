import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZaiClient, modelUsageToCostRaw } from '../src/zai.js';
import { transformCost } from '../src/transform.js';

// Trimmed real-shape model-usage response (3 daily buckets, 2 models).
const MODEL_USAGE = {
  x_time: ['2026-06-05 00:00', '2026-06-06 00:00', '2026-06-07 00:00'],
  tokensUsage: [1000, 0, 2500],
  modelCallCount: [3, 0, 5],
  totalUsage: {
    totalModelCallCount: 8,
    totalTokensUsage: 3500,
    modelSummaryList: [
      { modelName: 'GLM-4.7', totalTokens: 2500, sortOrder: 1 },
      { modelName: 'GLM-5.1', totalTokens: 1000, sortOrder: 2 },
    ],
  },
  modelDataList: [
    { modelName: 'GLM-4.7', tokensUsage: [0, 0, 2500], totalTokens: 2500 },
    { modelName: 'GLM-5.1', tokensUsage: [1000, 0, 0], totalTokens: 1000 },
  ],
  granularity: 'daily',
};

const QUOTA = { code: 200, success: true, data: { level: 'pro', limits: [{ type: 'TOKENS_LIMIT', percentage: 8 }] } };

function stubFetch(map) {
  return async (url) => {
    const key = Object.keys(map).find((k) => url.includes(k));
    if (!key) throw new Error('unexpected url ' + url);
    return { json: async () => map[key] };
  };
}

test('modelUsageToCostRaw maps token series + per-model into codexbar cost shape (usd null)', () => {
  const raw = modelUsageToCostRaw(MODEL_USAGE, 30);
  assert.equal(raw.provider, 'zai');
  assert.equal(raw.last30DaysCostUSD, null);
  assert.equal(raw.last30DaysTokens, 3500);
  assert.equal(raw.daily.length, 3);
  assert.deepEqual(raw.daily[2], {
    date: '2026-06-07',
    totalCost: null,
    totalTokens: 2500,
    modelBreakdowns: [{ modelName: 'GLM-4.7', cost: null, totalTokens: 2500 }],
  });
  assert.deepEqual(raw.daily[1], { date: '2026-06-06', totalCost: null, totalTokens: 0, modelBreakdowns: [] });
});

test('transformCost on zai raw yields token cost with models ranked by tokens', () => {
  const raw = modelUsageToCostRaw(MODEL_USAGE, 30);
  const [c] = transformCost([raw], 30);
  assert.equal(c.cost.usd, null);
  assert.equal(c.cost.tokens.total, 3500);
  assert.equal(c.cost.daily.length, 3);
  // models aggregated across daily, ranked by tokens (usd all null → tiebreak on tokens)
  assert.deepEqual(c.cost.models, [
    { name: 'GLM-4.7', usd: 0, tokens: 2500 },
    { name: 'GLM-5.1', usd: 0, tokens: 1000 },
  ]);
});

test('ZaiClient.fetchPlan returns the formatted plan tier', async () => {
  const client = new ZaiClient('k', { fetchImpl: stubFetch({ 'quota/limit': QUOTA }) });
  assert.equal(await client.fetchPlan(), 'GLM Coding Pro');
});

test('ZaiClient throws on the API error envelope (HTTP 200 + success:false)', async () => {
  const client = new ZaiClient('k', { fetchImpl: stubFetch({ 'quota/limit': { code: 401, success: false, msg: 'token expired or incorrect' } }) });
  await assert.rejects(() => client.fetchPlan(), /token expired or incorrect/);
});

test('ZaiClient.fetchCostRaw queries model-usage and shapes it', async () => {
  const client = new ZaiClient('k', {
    fetchImpl: stubFetch({ 'model-usage': { code: 200, success: true, data: MODEL_USAGE } }),
    now: () => new Date('2026-06-07T12:00:00Z'),
  });
  const raw = await client.fetchCostRaw(30);
  assert.equal(raw.last30DaysTokens, 3500);
  assert.equal(raw.daily.length, 3);
});
