import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { migrateCommand } from '../src/cli/migrate.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { UNGROUPED, formatSidecar } from '../src/core/spec/capability-sidecar.js';

const LIVING_SPEC = `# pricing Specification

## Purpose

A capability used by the migrate sidecars tests.

## Requirements

### Requirement: Works
The system SHALL work.

#### Scenario: Works
- **WHEN** invoked
- **THEN** it works
`;

interface CommandRun {
  readonly messages: string[];
}

async function runMigrate(root: string): Promise<CommandRun> {
  const messages: string[] = [];
  await migrateCommand('sidecars', {
    cwd: root,
    config: DEFAULT_CONFIG,
    logger: { info: (message) => messages.push(message), error: () => {} },
  });
  return { messages };
}

describe('osq migrate sidecars', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-migrate-sidecars-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeLivingSpec(capability: string): Promise<void> {
    const dir = path.join(tmpDir, 'openspec', 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), LIVING_SPEC, 'utf8');
  }

  async function readSidecar(capability: string): Promise<string | null> {
    return fs
      .readFile(path.join(tmpDir, 'openspec', 'specs', capability, 'osq.yml'), 'utf8')
      .catch(() => null);
  }

  it('scaffolds only the living capabilities that have no sidecar', async () => {
    await writeLivingSpec('pricing');
    await writeLivingSpec('orders');
    await fs.writeFile(
      path.join(tmpDir, 'openspec', 'specs', 'orders', 'osq.yml'),
      'group: fulfillment\n',
      'utf8',
    );

    const { messages } = await runMigrate(tmpDir);

    assert.ok(messages.includes('wrote 1 sidecar(s)'), messages.join('\n'));
    assert.ok(messages.includes('  pricing'), messages.join('\n'));
    assert.equal(await readSidecar('pricing'), formatSidecar({ group: UNGROUPED }));
    assert.equal(await readSidecar('pricing'), 'group: ungrouped\n');
    assert.equal(await readSidecar('orders'), 'group: fulfillment\n');
  });

  it('writes nothing and reports zero on a second run', async () => {
    await writeLivingSpec('pricing');
    await writeLivingSpec('orders');

    const first = await runMigrate(tmpDir);
    assert.ok(first.messages.includes('wrote 2 sidecar(s)'));
    assert.ok(first.messages.includes('  orders'));
    assert.ok(first.messages.includes('  pricing'));

    const second = await runMigrate(tmpDir);

    assert.deepEqual(second.messages, ['wrote 0 sidecar(s)']);
    assert.equal(await readSidecar('pricing'), 'group: ungrouped\n');
    assert.equal(await readSidecar('orders'), 'group: ungrouped\n');
  });
});
