import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/core/foundation/config.js';
import { formatSidecar, parseSidecar } from '../src/core/spec/capability-sidecar.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const OWN_SIDECARS: ReadonlyArray<readonly [string, string]> = [
  ['cli-foundation', 'platform'],
  ['spec-lint-and-approve', 'planning'],
  ['traceability', 'planning'],
  ['watcher-and-harness', 'execution'],
  ['version-control', 'execution'],
  ['status-inspection', 'inspection'],
  ['web-inspection', 'inspection'],
  ['metrics-and-reporting', 'inspection'],
];

describe('osq own capability sidecars', () => {
  it('gives every capability its group and turns requireGroups on', async () => {
    for (const [capability, group] of OWN_SIDECARS) {
      const sidecarPath = path.join(repoRoot, 'openspec', 'specs', capability, 'osq.yml');
      const content = await fs.readFile(sidecarPath, 'utf8');
      assert.equal(
        content,
        formatSidecar({ group }),
        `${capability} sidecar must match formatSidecar`,
      );
      assert.deepEqual(parseSidecar(content), { sidecar: { group }, problems: [] });
    }

    const { capabilities } = await loadConfig(repoRoot);
    assert.ok(capabilities, 'the resolved config must hold capabilities');
    assert.equal(capabilities.requireGroups, true);
  });

  it('documents sidecars under the Change folder section', async () => {
    const readme = await fs.readFile(path.join(repoRoot, 'README.md'), 'utf8');
    const start = readme.indexOf('## Change folder');
    assert.ok(start >= 0, 'README must hold the Change folder heading');

    const end = readme.indexOf('## What the watcher guarantees', start);
    assert.ok(end > start, 'the Change folder section must end before What the watcher guarantees');

    const section = readme.slice(start, end);
    for (const text of ['osq.yml', 'requireGroups', 'osq migrate sidecars']) {
      assert.ok(section.includes(text), `the Change folder section must hold ${text}`);
    }
  });
});
