// test/source-map.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  oauthProvidersFromEnv,
  sourceForProvider,
  costSupported,
  usageArgs,
  costArgs,
  DEFAULT_OAUTH_PROVIDERS,
} from '../src/source-map.js';

test('oauthProvidersFromEnv defaults to claude,codex', () => {
  const s = oauthProvidersFromEnv({});
  assert.deepEqual([...s].sort(), ['claude', 'codex']);
  assert.deepEqual(DEFAULT_OAUTH_PROVIDERS, ['claude', 'codex']);
});

test('oauthProvidersFromEnv parses and trims override', () => {
  const s = oauthProvidersFromEnv({ CODEXBAR_OAUTH_PROVIDERS: ' claude , codex , foo ' });
  assert.deepEqual([...s].sort(), ['claude', 'codex', 'foo']);
});

test('sourceForProvider returns oauth for members, api otherwise', () => {
  const oauth = new Set(['claude', 'codex']);
  assert.equal(sourceForProvider('claude', oauth), 'oauth');
  assert.equal(sourceForProvider('codex', oauth), 'oauth');
  assert.equal(sourceForProvider('zai', oauth), 'api');
  assert.equal(sourceForProvider('gemini', oauth), 'api');
});

test('costSupported is true only for claude and codex', () => {
  assert.equal(costSupported('claude'), true);
  assert.equal(costSupported('codex'), true);
  assert.equal(costSupported('zai'), false);
  assert.equal(costSupported('gemini'), false);
});

test('usageArgs includes --source and --format json, no --days', () => {
  assert.deepEqual(
    usageArgs('claude', 'oauth'),
    ['usage', '--provider', 'claude', '--source', 'oauth', '--format', 'json'],
  );
  assert.ok(!usageArgs('claude', 'oauth').includes('--days'));
});

test('costArgs has no --source and no --days', () => {
  assert.deepEqual(costArgs('claude'), ['cost', '--provider', 'claude', '--format', 'json']);
  const a = costArgs('claude');
  assert.ok(!a.includes('--source'));
  assert.ok(!a.includes('--days'));
});
