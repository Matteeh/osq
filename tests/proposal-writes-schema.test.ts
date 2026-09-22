import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { lintCommand } from '../src/cli/lint.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { OPENSPEC_EXPECTED_VERSION, lintChangeFolder } from '../src/core/linter.js';
import { buildManifest } from '../src/core/manifest.js';
import { migrateToOpenSpec } from '../src/core/migrate.js';
import { parseFrontmatter } from '../src/core/parser.js';
import { getSpecDetails } from '../src/core/show.js';

const RECORD_FILE = 'openspec-invocations.json';

const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

async function installFakeOpenSpec(projectRoot: string): Promise<void> {
  const binDir = path.join(projectRoot, 'node_modules', '.bin');
  await fs.mkdir(binDir, { recursive: true });

  const recordPath = path.join(projectRoot, RECORD_FILE);
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const recordPath = ${JSON.stringify(recordPath)};
const args = process.argv.slice(2);
let records = [];
try { records = JSON.parse(fs.readFileSync(recordPath, 'utf8')); } catch {}
records.push({ args, telemetry: process.env.OPENSPEC_TELEMETRY, cwd: process.cwd() });
fs.writeFileSync(recordPath, JSON.stringify(records));
process.stdout.write(JSON.stringify({ valid: true, issues: [] }));
process.exit(0);
`;
  await fs.writeFile(path.join(binDir, 'openspec'), script, { mode: 0o755 });

  const manifestDir = path.join(projectRoot, 'node_modules', '@fission-ai', 'openspec');
  await fs.mkdir(manifestDir, { recursive: true });
  await fs.writeFile(
    path.join(manifestDir, 'package.json'),
    JSON.stringify({ name: '@fission-ai/openspec', version: OPENSPEC_EXPECTED_VERSION }),
    'utf8',
  );
}

function proposal(writes?: string[]): string {
  const features =
    writes === undefined
      ? 'features:\n  reads: []'
      : `features:\n  reads: []\n  writes: [${writes.join(', ')}]`;
  return `---
title: Writes Schema Probe
depends_on: []
verify: node verify.cjs
${features}
---
## Goal

Probe the retired features.writes field.

## Contract

| Input | Expected Output |
|---|---|
| probe | outcome |

## Non-goals

None.

## Delta

Delta specs declare the written capabilities.
`;
}

const TASK = `---
title: When the probe runs, it passes
verify: node verify.cjs
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] passes
`;

const ADDED_DELTA = `# Spec Delta: probe-capability

## Purpose

Probe capability used to declare writes without frontmatter.

## ADDED Requirements

### Requirement: Probe behavior

The system SHALL probe deterministically.

#### Scenario: Probe works
- **WHEN** the probe is invoked
- **THEN** it returns the expected outcome
`;

interface ChangeOptions {
  readonly writes?: string[];
  readonly deltas?: Record<string, string>;
}

async function writeChangeFolder(
  root: string,
  folderName: string,
  options: ChangeOptions = {},
): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', folderName);
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposal(options.writes), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), TASK, 'utf8');

  for (const [capability, content] of Object.entries(options.deltas ?? {})) {
    const deltaDir = path.join(folder, 'specs', capability);
    await fs.mkdir(deltaDir, { recursive: true });
    await fs.writeFile(path.join(deltaDir, 'spec.md'), content, 'utf8');
  }

  return folder;
}

describe('proposal writes schema', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-writes-schema-'));
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('osq lint rejects a proposal declaring features.writes', async () => {
    await installFakeOpenSpec(tmpDir);
    const folder = await writeChangeFolder(tmpDir, '001-writes', {
      writes: ['probe-capability'],
      deltas: { 'probe-capability': ADDED_DELTA },
    });

    const direct = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);
    assert.equal(direct.valid, false);
    assert.ok(
      direct.errors.some((error) =>
        error.includes('features.writes is no longer supported in proposal frontmatter'),
      ),
      direct.errors.join('\n'),
    );
    assert.ok(
      direct.errors.some((error) =>
        error.includes('write declarations are derived strictly from delta specs'),
      ),
    );

    const exitCodes: number[] = [];
    const result = await lintCommand(['001'], {
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      logger: { info: () => {}, verbose: () => {}, warn: () => {}, error: () => {} },
      exit: (code) => exitCodes.push(code),
    });
    assert.equal(result.valid, false);
    assert.deepEqual(exitCodes, [1]);
  });

  it('osq lint passes when features.writes is absent and deltas exist in specs/', async () => {
    await installFakeOpenSpec(tmpDir);
    const folder = await writeChangeFolder(tmpDir, '001-clean', {
      deltas: { 'probe-capability': ADDED_DELTA },
    });

    const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);
    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.errors.length, 0);
  });

  it('derives written capabilities from delta specs for show and the manifest', async () => {
    const folder = await writeChangeFolder(tmpDir, '001-derived', {
      deltas: { 'probe-capability': ADDED_DELTA },
    });

    // show: writes come from specs/<capability>/spec.md, not frontmatter.
    const details = await getSpecDetails(tmpDir, '001', DEFAULT_CONFIG);
    assert.deepEqual(details.features.reads, []);
    assert.deepEqual(details.features.writes, ['probe-capability']);

    // manifest: the delta capability is hashed even though frontmatter omits writes.
    const baseSpecPath = path.join(tmpDir, 'openspec', 'specs', 'probe-capability', 'spec.md');
    await fs.mkdir(path.dirname(baseSpecPath), { recursive: true });
    await fs.writeFile(baseSpecPath, '# probe-capability\n\ncontent\n', 'utf8');

    const manifest = await buildManifest(tmpDir, folder, DEFAULT_CONFIG);
    assert.equal(typeof manifest.hashes['probe-capability'], 'string');
    assert.ok(manifest.hashes['probe-capability']?.startsWith('sha256:'));
  });

  it('osq migrate openspec strips features.writes and removes redundant spec.md idempotently', async () => {
    const withWrites = path.join(tmpDir, 'openspec', 'changes', 'archive', '018-legacy');
    await fs.mkdir(withWrites, { recursive: true });
    await fs.writeFile(
      path.join(withWrites, 'proposal.md'),
      proposal(['probe-capability']),
      'utf8',
    );
    await fs.writeFile(path.join(withWrites, 'spec.md'), '# redundant\n', 'utf8');

    const withoutWrites = path.join(tmpDir, 'openspec', 'changes', 'archive', '017-legacy');
    await fs.mkdir(withoutWrites, { recursive: true });
    await fs.writeFile(path.join(withoutWrites, 'proposal.md'), proposal(), 'utf8');
    await fs.writeFile(path.join(withoutWrites, 'spec.md'), '# redundant\n', 'utf8');

    const first = await migrateToOpenSpec({
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      sampleStub: false,
    });

    assert.ok(first.normalizedArchives.some((entry) => entry.endsWith('018-legacy')));
    assert.ok(first.normalizedArchives.some((entry) => entry.endsWith('017-legacy')));

    for (const folder of [withWrites, withoutWrites]) {
      assert.equal(
        await fs
          .stat(path.join(folder, 'spec.md'))
          .then(() => true)
          .catch(() => false),
        false,
      );
      const { data } = parseFrontmatter(
        await fs.readFile(path.join(folder, 'proposal.md'), 'utf8'),
      );
      const features = data.features as Record<string, unknown>;
      assert.equal('writes' in features, false);
      assert.deepEqual(features.reads, []);
    }

    // Second run is a no-op: nothing left to normalize.
    const second = await migrateToOpenSpec({
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      sampleStub: false,
    });
    assert.deepEqual(second.normalizedArchives, []);
  });
});
