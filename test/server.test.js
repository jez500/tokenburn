import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createApp } from '../src/server.js';

const here = dirname(fileURLToPath(import.meta.url));
const stub = join(here, 'fixtures', 'stub-codexbar');
const stubFail = join(here, 'fixtures', 'stub-codexbar-fail');

function app() {
  return createApp({
    apiToken: 'secret', codexbarBin: stub, providers: ['codex'],
    cacheTtlMs: 1000, execTimeoutMs: 5000,
    oauthProviders: new Set(['claude', 'codex']),
  });
}

test('GET /healthz is open and returns ok', async () => {
  const res = await request(app()).get('/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('GET /v1/usage without token returns 401', async () => {
  const res = await request(app()).get('/v1/usage');
  assert.equal(res.status, 401);
});

test('GET /v1/usage with token returns reshaped data', async () => {
  const res = await request(app()).get('/v1/usage').set('Authorization', 'Bearer secret');
  assert.equal(res.status, 200);
  assert.equal(res.body.providers[0].usage.percent, 28);
});

test('GET /v1/cost?days=7 reports the binary window (30d), ignoring ?days', async () => {
  const res = await request(app()).get('/v1/cost?days=7').set('Authorization', 'Bearer secret');
  assert.equal(res.status, 200);
  assert.equal(res.body.providers[0].cost.window, '30d');
});

test('GET /v1/summary merges usage and cost', async () => {
  const res = await request(app()).get('/v1/summary').set('Authorization', 'Bearer secret');
  assert.equal(res.status, 200);
  assert.equal(res.body.providers[0].usage.percent, 28);
  assert.equal(res.body.providers[0].cost.usd, 12.34);
});

test('GET /metrics is open and exposes registry text', async () => {
  await request(app()).get('/v1/usage').set('Authorization', 'Bearer secret');
  const res = await request(app()).get('/metrics');
  assert.equal(res.status, 200);
  assert.match(res.text, /codexbar_usage_percent/);
});

test('invalid days returns 400', async () => {
  const res = await request(app()).get('/v1/cost?days=999').set('Authorization', 'Bearer secret');
  assert.equal(res.status, 400);
});

test('exec failure surfaces as 502', async () => {
  const failApp = createApp({
    apiToken: 'secret', codexbarBin: stubFail, providers: ['codex'],
    cacheTtlMs: 1000, execTimeoutMs: 5000,
    oauthProviders: new Set(['claude', 'codex']),
  });
  const res = await request(failApp).get('/v1/usage').set('Authorization', 'Bearer secret');
  assert.equal(res.status, 502);
  assert.ok(res.body.error);
});

test('unknown provider returns 400', async () => {
  const res = await request(app()).get('/v1/usage?provider=bogus').set('Authorization', 'Bearer secret');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /unknown provider/);
});

test('responses carry basic security headers', async () => {
  const res = await request(app()).get('/healthz');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
});
