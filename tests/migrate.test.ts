import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createProgram } from '../src/cli/index.js';
import { migrateCommand } from '../src/cli/migrate.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { OPENSPEC_EXPECTED_VERSION, validateWithOpenSpec } from '../src/core/linter.js';
import {
  convertSpecToProposal,
  migrateToOpenSpec,
  tickAllCheckboxes,
} from '../src/core/migrate.js';
import { parseFrontmatter, parseTaskMd } from '../src/core/parser.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECORD_FILE = 'openspec-invocations.json';

const FEATURE_DOC = `# CLI Foundation

Describes the foundational command-line interface.

## Configuration

Loads from osq.config.ts.
`;

const LEGACY_SPEC = `---
title: Example change
depends_on: []
features:
  reads: [cli-foundation]
  writes: [cli-foundation]
---
## Goal

Do the example thing.

## Contract

| A | B |
|---|---|
| 1 | 2 |

## Non-goals

None.

## Delta

Legacy prose delta that must survive migration.
`;

const TASK_UNIT = `---
title: When example runs, it works
verify: node -e "process.exit(0)"
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] works
`;

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function seedLegacyProject(root: string): Promise<void> {
  await fs.mkdir(path.join(root, 'features'), { recursive: true });
  await fs.writeFile(path.join(root, 'features', 'cli-foundation.md'), FEATURE_DOC, 'utf8');

  const active = path.join(root, 'specs', '016-example');
  await fs.mkdir(path.join(active, 'tasks'), { recursive: true });
  await fs.mkdir(path.join(active, '.run', 'done'), { recursive: true });
  await fs.mkdir(path.join(active, '.run', 'results'), { recursive: true });
  await fs.writeFile(path.join(active, 'spec.md'), LEGACY_SPEC, 'utf8');
  await fs.writeFile(
    path.join(active, 'tasks.md'),
    '# Tasks\n\n- [ ] 1. When example runs, it works\n',
    'utf8',
  );
  await fs.writeFile(path.join(active, 'tasks', '1.md'), TASK_UNIT, 'utf8');
  await fs.writeFile(path.join(active, '.run', 'approved'), 'sha256:active\n', 'utf8');
  await fs.writeFile(path.join(active, '.run', 'done', '1'), '', 'utf8');
  await fs.writeFile(path.join(active, '.run', 'results', '1.md'), 'active result', 'utf8');

  const archived = path.join(root, 'specs', 'archive', '001-old');
  await fs.mkdir(path.join(archived, 'tasks'), { recursive: true });
  await fs.mkdir(path.join(archived, '.run', 'events'), { recursive: true });
  await fs.writeFile(
    path.join(archived, 'spec.md'),
    LEGACY_SPEC.replace('Example change', 'Old change'),
    'utf8',
  );
  await fs.writeFile(
    path.join(archived, 'tasks.md'),
    '# Tasks\n\n- [ ] 1. pending archived item\n- [x] 2. done item\n',
    'utf8',
  );
  await fs.writeFile(path.join(archived, 'tasks', '1.md'), TASK_UNIT, 'utf8');
  await fs.writeFile(path.join(archived, '.run', 'approved'), 'sha256:old\n', 'utf8');
  await fs.writeFile(
    path.join(archived, '.run', 'events', '1.jsonl'),
    '{"type":"started"}\n',
    'utf8',
  );
}

/** Seeds the real repo archive folder plus the fixture archive copies. */
async function seedArchivedCopies(root: string): Promise<void> {
  const archive = path.join(root, 'specs', 'archive');
  await fs.mkdir(archive, { recursive: true });

  const sources = [
    path.join(repoRoot, 'fixture', 'report', 'specs', 'archive', '008-opencode-harness-adapter'),
    path.join(repoRoot, 'fixture', 'report', 'specs', 'archive', '009-watcher-observability'),
    path.join(repoRoot, 'specs', 'archive', '002-spec-lint-and-approve'),
  ];

  for (const source of sources) {
    const dest = path.join(archive, path.basename(source));
    await fs.cp(source, dest, { recursive: true });
    // The report fixtures omit `tasks.md`; add a pending one so migration's
    // tick-on-archive invariant is exercised against every copied archive.
    if (!(await exists(path.join(dest, 'tasks.md')))) {
      await fs.writeFile(
        path.join(dest, 'tasks.md'),
        '# Tasks\n\n- [ ] 1. pending archived item\n',
        'utf8',
      );
    }
  }
}

async function collectFiles(root: string, name: string): Promise<string[]> {
  const found: string[] = [];
  const stack: string[] = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name === name) {
        found.push(full);
      }
    }
  }

  return found.sort();
}

async function installFakeOpenSpec(root: string): Promise<string> {
  const binDir = path.join(root, 'node_modules', '.bin');
  await fs.mkdir(binDir, { recursive: true });

  const recordPath = path.join(root, RECORD_FILE);
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

  const manifestDir = path.join(root, 'node_modules', '@fission-ai', 'openspec');
  await fs.mkdir(manifestDir, { recursive: true });
  await fs.writeFile(
    path.join(manifestDir, 'package.json'),
    JSON.stringify({ name: '@fission-ai/openspec', version: OPENSPEC_EXPECTED_VERSION }),
    'utf8',
  );

  return recordPath;
}

describe('osq migrate openspec', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-migrate-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('moves features/ to openspec/specs/ and specs/ to openspec/changes/', async () => {
    await seedLegacyProject(tmpDir);

    const result = await migrateToOpenSpec({ cwd: tmpDir, config: DEFAULT_CONFIG });

    const featureTarget = path.join(tmpDir, 'openspec', 'specs', 'cli-foundation', 'spec.md');
    assert.ok(await exists(featureTarget));
    assert.equal(await fs.readFile(featureTarget, 'utf8'), FEATURE_DOC);
    assert.equal(await exists(path.join(tmpDir, 'features', 'cli-foundation.md')), false);
    assert.equal(result.migratedFeatures.length, 1);

    const activeTarget = path.join(tmpDir, 'openspec', 'changes', '016-example');
    assert.ok(await exists(activeTarget));
    assert.equal(await exists(path.join(tmpDir, 'specs', '016-example')), false);
    assert.equal(result.migratedChanges.length, 1);
  });

  it('migrates archived changes to openspec/changes/archive/ preserving .run/ markers', async () => {
    await seedLegacyProject(tmpDir);

    const result = await migrateToOpenSpec({ cwd: tmpDir, config: DEFAULT_CONFIG });

    const archivedTarget = path.join(tmpDir, 'openspec', 'changes', 'archive', '001-old');
    assert.ok(await exists(archivedTarget));
    assert.equal(await exists(path.join(tmpDir, 'specs', 'archive', '001-old')), false);
    assert.equal(result.migratedArchives.length, 1);

    assert.equal(
      await fs.readFile(path.join(archivedTarget, '.run', 'approved'), 'utf8'),
      'sha256:old\n',
    );
    assert.equal(
      await fs.readFile(path.join(archivedTarget, '.run', 'events', '1.jsonl'), 'utf8'),
      '{"type":"started"}\n',
    );
  });

  it('converts spec.md to proposal.md with frontmatter and preserves prose under ## Delta (legacy)', async () => {
    await seedLegacyProject(tmpDir);

    await migrateToOpenSpec({ cwd: tmpDir, config: DEFAULT_CONFIG });

    for (const folder of [
      path.join(tmpDir, 'openspec', 'changes', '016-example'),
      path.join(tmpDir, 'openspec', 'changes', 'archive', '001-old'),
    ]) {
      assert.equal(await exists(path.join(folder, 'spec.md')), false);
      const proposal = await fs.readFile(path.join(folder, 'proposal.md'), 'utf8');
      const { data, body } = parseFrontmatter(proposal);

      assert.equal(typeof data.title, 'string');
      assert.ok(Array.isArray(data.depends_on));
      const features = data.features as { reads: string[]; writes?: unknown };
      assert.deepEqual(features.reads, ['cli-foundation']);
      assert.equal(features.writes, undefined);

      assert.ok(body.includes('## Delta (legacy)'));
      assert.ok(body.includes('Legacy prose delta that must survive migration.'));
      assert.ok(!/^##\s+Delta\s*$/m.test(body));
    }
  });

  it('ticks every archived tasks.md (including already-checked and real copies)', async () => {
    await seedLegacyProject(tmpDir);
    await seedArchivedCopies(tmpDir);

    const result = await migrateToOpenSpec({ cwd: tmpDir, config: DEFAULT_CONFIG });

    const source = path.join(tmpDir, 'specs', 'archive', '001-old', 'tasks.md');
    assert.ok(result.tickedTasks.some((file) => file.endsWith(path.join('001-old', 'tasks.md'))));

    const archived = await collectFiles(
      path.join(tmpDir, 'openspec', 'changes', 'archive'),
      'tasks.md',
    );
    assert.ok(archived.length >= 4);
    for (const file of archived) {
      const content = await fs.readFile(file, 'utf8');
      assert.ok(!content.includes('[ ]'), `expected no unchecked boxes in ${file}`);
    }
    assert.equal(await exists(source), false);

    const copied = await fs.readFile(
      path.join(tmpDir, 'openspec', 'changes', 'archive', '002-spec-lint-and-approve', 'tasks.md'),
      'utf8',
    );
    assert.ok(!copied.includes('[ ]'));
  });

  it('migrates fixture and real archived copies passing both validators', async () => {
    await seedArchivedCopies(tmpDir);

    await migrateToOpenSpec({ cwd: tmpDir, config: DEFAULT_CONFIG });

    // Structural validity: every archived change has a proposal and a ticked list.
    for (const folder of [
      '008-opencode-harness-adapter',
      '009-watcher-observability',
      '002-spec-lint-and-approve',
    ]) {
      const target = path.join(tmpDir, 'openspec', 'changes', 'archive', folder);
      assert.ok(await exists(path.join(target, 'proposal.md')), `${folder} proposal.md`);
      assert.equal(await exists(path.join(target, 'spec.md')), false);
      const tasks = await fs.readFile(path.join(target, 'tasks.md'), 'utf8');
      assert.ok(!tasks.includes('[ ]'), `${folder} tasks.md ticked`);
    }

    const recordPath = await installFakeOpenSpec(tmpDir);
    const outcome = await validateWithOpenSpec(tmpDir, DEFAULT_CONFIG);

    assert.equal(outcome.ran, true);
    assert.equal(outcome.errors.length, 0);
    assert.equal(outcome.version, OPENSPEC_EXPECTED_VERSION);

    const invocations = JSON.parse(await fs.readFile(recordPath, 'utf8')) as Array<{
      args: string[];
      telemetry: string;
    }>;
    assert.equal(invocations.length, 2);
    assert.deepEqual(
      invocations.map((invocation) => invocation.args[1]),
      ['--changes', '--specs'],
    );
    assert.ok(invocations.every((invocation) => invocation.telemetry === '0'));
  });

  it('creates the 017 stub change folder under openspec/changes/017-sample/', async () => {
    await seedLegacyProject(tmpDir);

    const result = await migrateToOpenSpec({ cwd: tmpDir, config: DEFAULT_CONFIG });

    const stub = path.join(tmpDir, 'openspec', 'changes', '017-sample');
    assert.equal(result.createdStub, stub);
    assert.ok(await exists(stub));
    assert.ok(await exists(path.join(stub, 'proposal.md')));
    assert.ok(await exists(path.join(stub, 'tasks.md')));
    assert.ok(await exists(path.join(stub, 'tasks', '1.md')));

    const proposal = await fs.readFile(path.join(stub, 'proposal.md'), 'utf8');
    assert.ok(proposal.includes('title: Sample change'));
    const task = parseTaskMd(await fs.readFile(path.join(stub, 'tasks', '1.md'), 'utf8'));
    assert.ok(task.verify.length > 0);
  });

  it('convertSpecToProposal drops features.writes and preserves delta prose', () => {
    const proposal = convertSpecToProposal(LEGACY_SPEC);
    const { data, body } = parseFrontmatter(proposal);

    assert.equal(data.title, 'Example change');
    const features = data.features as { reads: string[]; writes?: unknown };
    assert.deepEqual(features.reads, ['cli-foundation']);
    assert.equal(features.writes, undefined);
    assert.ok(body.includes('## Delta (legacy)'));
    assert.ok(body.includes('Legacy prose delta that must survive migration.'));
  });

  it('tickAllCheckboxes ticks only unchecked boxes and preserves structure', () => {
    const input = '- [ ] 1. one\n  - [x] 2. two\n* [ ] 3. three\n';
    assert.equal(tickAllCheckboxes(input), '- [x] 1. one\n  - [x] 2. two\n* [x] 3. three\n');
  });

  it('registers the migrate command with a required target argument', () => {
    const program = createProgram();
    const migrateCmd = program.commands.find((cmd) => cmd.name() === 'migrate');

    assert.ok(migrateCmd);
    assert.equal(migrateCmd.registeredArguments[0].name(), 'target');
    assert.equal(migrateCmd.registeredArguments[0].required, true);
  });

  it('migrate command rejects unsupported targets with a non-zero exit', async () => {
    const exitCodes: number[] = [];
    const messages: string[] = [];
    const result = await migrateCommand('legacy', {
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      logger: { info: () => {}, error: (message) => messages.push(message) },
      exit: (code) => exitCodes.push(code),
    });

    assert.equal(result, null);
    assert.deepEqual(exitCodes, [1]);
    assert.ok(messages.some((message) => message.includes('unsupported migrate target')));
  });

  it('migrate command runs the openspec migration and reports a summary', async () => {
    await seedLegacyProject(tmpDir);
    const messages: string[] = [];
    const exitCodes: number[] = [];

    const result = await migrateCommand('openspec', {
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      logger: { info: (message) => messages.push(message), error: () => {} },
      exit: (code) => exitCodes.push(code),
    });

    assert.ok(result);
    assert.deepEqual(exitCodes, []);
    assert.equal(result.migratedFeatures.length, 1);
    assert.equal(result.migratedArchives.length, 1);
    assert.ok(messages.some((message) => message.includes('openspec/specs/')));
    assert.ok(await exists(path.join(tmpDir, 'openspec', 'changes', '017-sample')));
  });
});
