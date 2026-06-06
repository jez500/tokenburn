import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('loadConfig returns defaults and parses env', () => {
  const cfg = loadConfig({ API_TOKEN: 'secret' });
  assert.equal(cfg.apiToken, 'secret');
  assert.equal(cfg.port, 3000);
  assert.equal(cfg.cacheTtlMs, 300000);
  assert.equal(cfg.execTimeoutMs, 30000);
  assert.equal(cfg.codexbarBin, 'codexbar');
  assert.deepEqual(cfg.providers, ['codex', 'claude', 'gemini', 'z.ai']);
});

test('loadConfig overrides from env', () => {
  const cfg = loadConfig({
    API_TOKEN: 's', PORT: '8080', CACHE_TTL_SECONDS: '60',
    EXEC_TIMEOUT_MS: '5000', CODEXBAR_BIN: '/tmp/stub',
    CODEXBAR_PROVIDERS: 'codex,claude'
  });
  assert.equal(cfg.port, 8080);
  assert.equal(cfg.cacheTtlMs, 60000);
  assert.equal(cfg.execTimeoutMs, 5000);
  assert.equal(cfg.codexbarBin, '/tmp/stub');
  assert.deepEqual(cfg.providers, ['codex', 'claude']);
});

test('loadConfig throws when API_TOKEN missing', () => {
  assert.throws(() => loadConfig({}), /API_TOKEN is required/);
});

test('loadConfig defaults oauthProviders to claude,codex', () => {
  const cfg = loadConfig({ API_TOKEN: 't' });
  assert.ok(cfg.oauthProviders instanceof Set);
  assert.deepEqual([...cfg.oauthProviders].sort(), ['claude', 'codex']);
});

test('loadConfig honors CODEXBAR_OAUTH_PROVIDERS override', () => {
  const cfg = loadConfig({ API_TOKEN: 't', CODEXBAR_OAUTH_PROVIDERS: 'claude' });
  assert.deepEqual([...cfg.oauthProviders], ['claude']);
});
