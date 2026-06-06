import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fmtUSD, fmtTok, pct, fmtReset, computePace, buildSpend14, deriveToday,
  statusFromPct, mapProvider, visibleProviders,
} from '../src/api.js';

const NOW = Date.parse('2026-06-06T12:00:00Z');

test('formatters', () => {
  assert.equal(fmtUSD(254.2), '$254.20');
  assert.equal(fmtUSD(254, 0), '$254');
  assert.equal(fmtTok(218e6), '218M');
  assert.equal(fmtTok(1500), '2K');
  assert.equal(pct(0.4), '<1%');
  assert.equal(pct(63), '63%');
});

test('fmtReset formats future windows as d/h or h/m', () => {
  assert.equal(fmtReset('2026-06-06T15:53:00Z', NOW), '3h 53m');
  assert.equal(fmtReset(new Date(NOW + (3 * 1440 + 20 * 60) * 60000).toISOString(), NOW), '3d 20h');
  assert.equal(fmtReset(null, NOW), null);
});

test('computePace flags ahead/behind from window timing', () => {
  // Window: 10080 min (7d), half elapsed → expected ~50%. Used 88% → Ahead, crit.
  const resetsAt = new Date(NOW + 5040 * 60000).toISOString(); // half remaining
  const pace = computePace({ usedPercent: 88, windowMinutes: 10080, resetsAt }, NOW);
  assert.equal(pace.label, 'Ahead');
  assert.ok(pace.delta > 5);
  assert.equal(pace.state, 'crit');
  assert.equal(computePace(null, NOW), null);
});

test('statusFromPct thresholds', () => {
  assert.equal(statusFromPct(10), 'ok');
  assert.equal(statusFromPct(85), 'warn');
  assert.equal(statusFromPct(96), 'crit');
  assert.equal(statusFromPct(null), 'ok');
});

test('buildSpend14 zero-fills a continuous 14-day axis ending today', () => {
  const daily = [{ date: '2026-06-06', usd: 32 }, { date: '2026-06-04', usd: 30 }];
  const s = buildSpend14(daily, NOW);
  assert.equal(s.length, 14);
  assert.equal(s[13], 32); // today
  assert.equal(s[11], 30); // 2 days before today
  assert.equal(s[12], 0);  // gap day 2026-06-05 had no entry... (see note)
  assert.equal(buildSpend14([], NOW), null);
});

test('deriveToday picks the entry matching the current UTC date', () => {
  const daily = [{ date: '2026-06-05', usd: 3, tokens: 10 }, { date: '2026-06-06', usd: 32, tokens: 99 }];
  assert.deepEqual(deriveToday(daily, NOW), { usd: 32, tokens: 99 });
  assert.equal(deriveToday([{ date: '2026-06-05', usd: 3 }], NOW), null);
});

test('mapProvider builds a full view-model for a rich provider', () => {
  const entry = {
    provider: 'claude', updatedAt: '2026-06-06T11:59:30Z', error: null,
    usage: {
      plan: 'Claude Max',
      extra: [{ id: 'claude-routines', title: 'Daily Routines', percent: 7, windowMinutes: 10080 }],
      windows: {
        primary: { usedPercent: 34, windowMinutes: 300, resetsAt: '2026-06-06T15:00:00Z' },
        secondary: { usedPercent: 8, windowMinutes: 10080, resetsAt: '2026-06-12T20:00:00Z' },
      },
    },
    cost: {
      usd: 254.24, tokens: { total: 218e6 },
      daily: [{ date: '2026-06-06', usd: 32, tokens: 99, models: [] }],
      models: [{ name: 'claude-opus-4-8', usd: 75, tokens: 100 }, { name: 'claude-sonnet-4-6', usd: 25, tokens: 50 }],
    },
  };
  const vm = mapProvider(entry, NOW);
  assert.equal(vm.id, 'claude');
  assert.equal(vm.name, 'Claude');
  assert.equal(vm.accent, '#d9785b');
  assert.equal(vm.plan, 'Claude Max');
  assert.equal(vm.session.pct, 34);
  assert.equal(vm.weekly.pct, 8);
  assert.equal(vm.status, 'ok');
  assert.equal(vm.extra.title, 'Daily Routines');
  assert.equal(vm.models[0].name, 'Opus 4.8');
  assert.equal(Math.round(vm.models[0].pct), 75);
  assert.deepEqual(vm.cost.today, { usd: 32, tokens: 99 });
  assert.deepEqual(vm.cost.last30, { usd: 254.24, tokens: 218e6 });
  assert.equal(vm.spend14.length, 14);
});

test('mapProvider degrades gracefully for an errored/empty provider', () => {
  const vm = mapProvider({ provider: 'gemini', error: { message: 'no key' }, usage: null, cost: null }, NOW);
  assert.equal(vm.name, 'Gemini');
  assert.equal(vm.error, 'no key');
  assert.equal(vm.session, null);
  assert.equal(vm.weekly, null);
  assert.equal(vm.models, null);
  assert.equal(vm.spend14, null);
  assert.equal(vm.cost.last30, null);
});

test('visibleProviders hides providers that errored (unconfigured)', () => {
  const list = [
    { id: 'claude', error: null },
    { id: 'gemini', error: 'codexbar usage failed' },
    { id: 'zai', error: null },
  ];
  const out = visibleProviders(list);
  assert.deepEqual(out.map((p) => p.id), ['claude', 'zai']);
  assert.deepEqual(visibleProviders([]), []);
  assert.deepEqual(visibleProviders(null), []);
});

test('mapProvider selects session/weekly by window duration, not slot (Z.AI ordering)', () => {
  // Z.AI: primary = 1-week (7%), secondary = monthly (no windowMinutes), tertiary = 5h (13%)
  const vm = mapProvider({
    provider: 'zai',
    usage: {
      windows: {
        primary: { usedPercent: 7, windowMinutes: 10080, resetsAt: '2026-06-08T00:00:00Z' },
        secondary: { usedPercent: 0, resetsAt: '2026-07-05T00:00:00Z' },
        tertiary: { usedPercent: 13, windowMinutes: 300, resetsAt: '2026-06-06T17:00:00Z' },
      },
    },
    cost: null,
  }, NOW);
  assert.equal(vm.session.pct, 13); // the 5h window
  assert.equal(vm.weekly.pct, 7);   // the 1-week window
});

test('mapProvider keeps Claude/Codex ordering (5h in primary, weekly in secondary)', () => {
  const vm = mapProvider({
    provider: 'claude',
    usage: {
      windows: {
        primary: { usedPercent: 34, windowMinutes: 300, resetsAt: '2026-06-06T15:00:00Z' },
        secondary: { usedPercent: 8, windowMinutes: 10080, resetsAt: '2026-06-12T20:00:00Z' },
        tertiary: { usedPercent: 4, windowMinutes: 10080, resetsAt: '2026-06-12T20:00:00Z' },
      },
    },
    cost: null,
  }, NOW);
  assert.equal(vm.session.pct, 34); // 5h primary
  assert.equal(vm.weekly.pct, 8);   // first 1-week window (secondary), not tertiary
});
