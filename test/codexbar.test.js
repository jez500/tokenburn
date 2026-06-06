import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runCodexbar } from '../src/codexbar.js';

const here = dirname(fileURLToPath(import.meta.url));
const stub = join(here, 'fixtures', 'stub-codexbar');
const stubFail = join(here, 'fixtures', 'stub-codexbar-fail');

test('runCodexbar parses usage JSON', async () => {
  const out = await runCodexbar(stub, ['usage', '--format', 'json'], 5000);
  assert.equal(out[0].provider, 'codex');
});

test('runCodexbar parses cost JSON array', async () => {
  const out = await runCodexbar(stub, ['cost', '--format', 'json'], 5000);
  assert.ok(Array.isArray(out));
  assert.equal(out[0].last30DaysCostUSD, 12.34);
});

test('runCodexbar rejects on non-zero exit with stderr', async () => {
  await assert.rejects(
    runCodexbar(stubFail, ['usage'], 5000),
    /boom: provider auth failed/
  );
});
