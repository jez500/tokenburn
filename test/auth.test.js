import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearerAuth } from '../src/auth.js';

function mockReqRes(header) {
  const req = { headers: header ? { authorization: header } : {} };
  let statusCode = 200; let body = null; let nextCalled = false;
  const res = {
    status(c) { statusCode = c; return this; },
    json(b) { body = b; return this; },
  };
  const next = () => { nextCalled = true; };
  return { req, res, next, get: () => ({ statusCode, body, nextCalled }) };
}

test('bearerAuth allows correct token', () => {
  const mw = bearerAuth('secret');
  const m = mockReqRes('Bearer secret');
  mw(m.req, m.res, m.next);
  assert.equal(m.get().nextCalled, true);
});

test('bearerAuth rejects wrong token with 401', () => {
  const mw = bearerAuth('secret');
  const m = mockReqRes('Bearer nope');
  mw(m.req, m.res, m.next);
  assert.equal(m.get().nextCalled, false);
  assert.equal(m.get().statusCode, 401);
});

test('bearerAuth rejects missing header with 401', () => {
  const mw = bearerAuth('secret');
  const m = mockReqRes(null);
  mw(m.req, m.res, m.next);
  assert.equal(m.get().statusCode, 401);
});
