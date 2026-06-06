import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import { createApp } from '../server.js';

// Spin a stub upstream that records the last request and returns a fixed envelope.
function stubUpstream(handler) {
  const calls = [];
  const server = http.createServer((req, res) => {
    calls.push({ url: req.url, auth: req.headers.authorization });
    handler(req, res);
  });
  return new Promise((resolve) => {
    server.listen(0, () => resolve({ server, calls, port: server.address().port }));
  });
}

test('GET /healthz returns ok', async () => {
  const app = createApp({ apiBaseUrl: 'http://127.0.0.1:1', apiToken: 't' });
  const res = await request(app).get('/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('GET /api/summary injects the Bearer token and passes provider through', async () => {
  const up = await stubUpstream((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ generatedAt: 'x', cached: false, providers: [{ provider: 'claude' }] }));
  });
  const app = createApp({ apiBaseUrl: `http://127.0.0.1:${up.port}`, apiToken: 'sekret' });
  const res = await request(app).get('/api/summary?provider=claude');
  assert.equal(res.status, 200);
  assert.equal(res.body.providers[0].provider, 'claude');
  assert.equal(up.calls[0].url, '/v1/summary?provider=claude');
  assert.equal(up.calls[0].auth, 'Bearer sekret');
  up.server.close();
});

test('GET /api/summary maps an upstream failure to 502', async () => {
  const up = await stubUpstream((req, res) => { res.statusCode = 500; res.end('boom'); });
  const app = createApp({ apiBaseUrl: `http://127.0.0.1:${up.port}`, apiToken: 't' });
  const res = await request(app).get('/api/summary');
  assert.equal(res.status, 502);
  assert.ok(res.body.error);
  up.server.close();
});

test('GET /api/summary returns 502 when the upstream is unreachable', async () => {
  const app = createApp({ apiBaseUrl: 'http://127.0.0.1:1', apiToken: 't' });
  const res = await request(app).get('/api/summary');
  assert.equal(res.status, 502);
  assert.ok(res.body.error);
});
