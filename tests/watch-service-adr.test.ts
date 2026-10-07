import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/core/foundation/config.js';
import { readDecisions } from '../src/core/foundation/decisions.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RULE =
  "The watcher runs in the background under osq's own detached supervisor, which restarts it after a crash or a new build and never while a task runs.";

describe('ADR 012: watch service', () => {
  it('is accepted, applies to the watcher and the CLI, and names its checks', async () => {
    const config = await loadConfig(REPO_ROOT);
    const records = await readDecisions(REPO_ROOT, config);
    const adr = records.adrs.find((entry) => entry.number === '012');

    assert.ok(adr, 'ADR 012 must be read');
    assert.equal(adr.status, 'accepted');
    assert.deepEqual(adr.appliesTo, ['watcher-and-harness', 'cli-foundation']);
    assert.equal(adr.rule, RULE);
    for (const check of ['tests/watch-supervisor.test.ts', 'tests/watch-service-build.test.ts']) {
      assert.ok(
        adr.checks.includes(check),
        `ADR 012 checks must name ${check}, got ${adr.checks.join(', ')}`,
      );
    }
  });

  it('names check files that exist', async () => {
    const config = await loadConfig(REPO_ROOT);
    const records = await readDecisions(REPO_ROOT, config);
    const adr = records.adrs.find((entry) => entry.number === '012');

    assert.ok(adr, 'ADR 012 must be read');
    for (const check of adr.checks) {
      await fs
        .access(path.join(REPO_ROOT, check))
        .catch(() => assert.fail(`ADR 012 check ${check} must exist`));
    }
  });

  it('follows the ADR 011 layout', async () => {
    const content = await fs.readFile(
      path.join(REPO_ROOT, 'decisions', '012-watch-service.md'),
      'utf8',
    );

    assert.match(content, /^# 012\. Watch service$/m);
    assert.match(content, /^Date: 2026-10-07$/m);
    for (const section of ['Status', 'Context', 'Decision', 'Consequences', 'Rejected']) {
      assert.match(content, new RegExp(`^## ${section}$`, 'm'));
    }
  });
});
