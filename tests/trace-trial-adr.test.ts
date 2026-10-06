import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/core/foundation/config.js';
import { readDecisions } from '../src/core/foundation/decisions.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RULE =
  "Traceability warns on osq's own traceability capability until its trial decides to block, widen, or drop it.";

describe('ADR 011: traceability trial', () => {
  it('is accepted, applies to traceability, and names its check', async () => {
    const config = await loadConfig(REPO_ROOT);
    const records = await readDecisions(REPO_ROOT, config);
    const adr = records.adrs.find((entry) => entry.number === '011');

    assert.ok(adr, 'ADR 011 must be read');
    assert.equal(adr.status, 'accepted');
    assert.deepEqual(adr.appliesTo, ['traceability']);
    assert.equal(adr.rule, RULE);
    assert.ok(
      adr.checks.includes('tests/trace-own-config.test.ts'),
      `ADR 011 checks must name tests/trace-own-config.test.ts, got ${adr.checks.join(', ')}`,
    );
  });

  it('holds the deadline and the Block, Widen, and Drop decisions', async () => {
    const content = await fs.readFile(
      path.join(REPO_ROOT, 'decisions', '011-traceability-trial.md'),
      'utf8',
    );

    assert.match(content, /2026-12-15/);
    assert.match(content, /\bBlock\b/);
    assert.match(content, /\bWiden\b/);
    assert.match(content, /\bDrop\b/);
  });
});
