import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TtlCache } from '../src/cache.js';

test('getOrLoad caches value within TTL', async () => {
  const cache = new TtlCache(1000);
  let calls = 0;
  const loader = async () => { calls++; return { n: calls }; };
  const a = await cache.getOrLoad('k', loader);
  const b = await cache.getOrLoad('k', loader);
  assert.deepEqual(a, { n: 1 });
  assert.deepEqual(b, { n: 1 });
  assert.equal(calls, 1);
});

test('getOrLoad coalesces concurrent misses into one load', async () => {
  const cache = new TtlCache(1000);
  let calls = 0;
  const loader = () => new Promise((res) => setTimeout(() => { calls++; res(calls); }, 20));
  const [a, b, c] = await Promise.all([
    cache.getOrLoad('k', loader),
    cache.getOrLoad('k', loader),
    cache.getOrLoad('k', loader),
  ]);
  assert.equal(calls, 1);
  assert.equal(a, 1); assert.equal(b, 1); assert.equal(c, 1);
});

test('expired entries reload', async () => {
  const cache = new TtlCache(10);
  let calls = 0;
  const loader = async () => ++calls;
  await cache.getOrLoad('k', loader);
  await new Promise((r) => setTimeout(r, 25));
  await cache.getOrLoad('k', loader);
  assert.equal(calls, 2);
});

test('failed loads are not cached', async () => {
  const cache = new TtlCache(1000);
  let calls = 0;
  const loader = async () => { calls++; throw new Error('boom'); };
  await assert.rejects(cache.getOrLoad('k', loader));
  await assert.rejects(cache.getOrLoad('k', loader));
  assert.equal(calls, 2);
});

test('concurrent failing loads all reject and do not poison the key', async () => {
  const cache = new TtlCache(1000);
  let calls = 0;
  const failing = () => new Promise((_res, rej) => setTimeout(() => { calls++; rej(new Error('boom')); }, 20));
  const results = await Promise.allSettled([
    cache.getOrLoad('k', failing),
    cache.getOrLoad('k', failing),
  ]);
  assert.equal(calls, 1); // coalesced into a single loader invocation
  assert.ok(results.every((r) => r.status === 'rejected'));
  // key not poisoned: a later call re-invokes the loader
  let ok = 0;
  const value = await cache.getOrLoad('k', async () => { ok++; return 42; });
  assert.equal(value, 42);
  assert.equal(ok, 1);
});
