import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const PASS_SCRIPT = 'process.exit(0);\n';

const CARGO_BASE = `[package]
name = "core"
version = "0.1.0"

[dependencies]
serde = "1.0"

[dev-dependencies]
insta = "1"
`;

const CARGO_REGEX = `[package]
name = "core"
version = "0.1.0"

[dependencies]
serde = "1.0"
regex = "1"

[dev-dependencies]
insta = "1"
`;

const CARGO_OPENSSL_TARGET = `[package]
name = "core"
version = "0.1.0"

[dependencies]
serde = "1.0"

[dev-dependencies]
insta = "1"

[target.'cfg(unix)'.dependencies]
openssl = { version = "0.10" }
`;

const CARGO_OPENSSL_RENAMED = `[package]
name = "core"
version = "0.1.0"

[dependencies]
serde = "1.0"
tls = { package = "openssl", version = "0.10" }

[dev-dependencies]
insta = "1"
`;

/** Line 3 is an unterminated string, so the Rust adapter stops reading there. */
const CARGO_UNREADABLE = `[package]
name = "core"
serde = "1.0
`;

const ACCEPTED_ADR = `---
status: accepted
rule: Do not use OpenSSL
denies:
  - openssl
---
# 7. No OpenSSL

Do not use OpenSSL.
`;

const TASKS_MD = `# Tasks

- [ ] 1. When a task adds a crate, the watcher records it
`;

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

function proposal(): string {
  return `---
title: Cargo dependency gate
depends_on: []
verify: node pass.cjs
features:
  reads: []
---
## Goal

Exercise the dependency gate on a Cargo manifest.

## Surface

None

## Decisions

None
`;
}

function taskMarkdown(): string {
  return [
    '---',
    'title: When a task adds a crate, the watcher records it',
    'verify: node pass.cjs',
    'scope: ["crates/core/Cargo.toml"]',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] the watcher records and gates the crate addition',
    '',
  ].join('\n');
}

/** Adapter that writes its result file plus any project-relative files. */
class ManifestAdapter implements HarnessAdapter {
  readonly name = 'manifest';
  spawnCalls = 0;

  constructor(private readonly writes: readonly { file: string; content: string }[] = []) {}

  async setup(_projectRoot: string, _config: OsqConfig): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.spawnCalls += 1;
    for (const write of this.writes) {
      const target = path.join(options.projectRoot, write.file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, write.content, 'utf8');
    }
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(
      path.join(resultsDir, `${options.taskNumber}.md`),
      '# Agent result\n',
      'utf8',
    );
    return { exitCode: 0 };
  }
}

async function readEvents(folder: string, taskNumber = '1'): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(folder, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ParsedEvent);
}

function measuresStart(events: ParsedEvent[]): ParsedEvent | undefined {
  return events.find((event) => event.type === 'measures' && event.data?.phase === 'start');
}

interface Project {
  root: string;
  folder: string;
}

async function setupProject(options: { adr?: string } = {}): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-deps-cargo-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'pass.cjs'), PASS_SCRIPT, 'utf8');
  await fs.mkdir(path.join(root, 'crates', 'core'), { recursive: true });
  await fs.writeFile(path.join(root, 'crates', 'core', 'Cargo.toml'), CARGO_BASE, 'utf8');
  if (options.adr) {
    await fs.mkdir(path.join(root, 'decisions'), { recursive: true });
    await fs.writeFile(path.join(root, 'decisions', '007-openssl.md'), options.adr, 'utf8');
  }

  const folder = path.join(root, 'openspec', 'changes', '001-cargo-dependency-gate');
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposal(), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks.md'), TASKS_MD, 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), taskMarkdown(), 'utf8');
  await approveSpec(root, '001', DEFAULT_CONFIG);
  return { root, folder };
}

describe('Cargo dependency baseline and addition in runTask', () => {
  const roots: string[] = [];

  async function setup(options: { adr?: string } = {}): Promise<Project> {
    const project = await setupProject(options);
    roots.push(project.root);
    return project;
  }

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('Scoped Cargo manifest', async () => {
    const { root, folder } = await setup();

    const result = await runTask(root, folder, '1', DEFAULT_CONFIG, new ManifestAdapter());

    assert.equal(result.success, true);
    const start = measuresStart(await readEvents(folder));
    assert.deepEqual(start?.data?.dependencies, {
      'crates/core/Cargo.toml': ['insta', 'serde'],
    });
  });

  it('Allowed crate addition', async () => {
    const { root, folder } = await setup();

    const result = await runTask(
      root,
      folder,
      '1',
      DEFAULT_CONFIG,
      new ManifestAdapter([{ file: 'crates/core/Cargo.toml', content: CARGO_REGEX }]),
    );

    assert.equal(result.success, true);
    const events = await readEvents(folder);
    const added = events.find((event) => event.type === 'dependencies_added');
    assert.deepEqual(added?.data, {
      added: [{ file: 'crates/core/Cargo.toml', name: 'regex' }],
    });
    assert.ok(
      events.some((event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn'),
    );
    assert.ok(events.some((event) => event.type === 'done'));
  });

  it('Crate denied', async () => {
    const { root, folder } = await setup({ adr: ACCEPTED_ADR });

    const result = await runTask(
      root,
      folder,
      '1',
      DEFAULT_CONFIG,
      new ManifestAdapter([{ file: 'crates/core/Cargo.toml', content: CARGO_OPENSSL_TARGET }]),
    );

    assert.equal(result.success, false);
    assert.equal(result.reason, 'denied_dependency');
    const events = await readEvents(folder);
    assert.deepEqual(events.find((event) => event.type === 'dependencies_added')?.data, {
      added: [{ file: 'crates/core/Cargo.toml', name: 'openssl' }],
    });
    assert.equal(
      events.some((event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn'),
      false,
    );

    const marker = await fs.readFile(path.join(folder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(marker, /reason: denied_dependency/);
    assert.match(marker, /The task added packages an accepted ADR denies:/);
    assert.match(marker, /^- openssl in crates\/core\/Cargo\.toml: ADR 007: Do not use OpenSSL$/m);
  });

  it('Renamed crate denied', async () => {
    const { root, folder } = await setup({ adr: ACCEPTED_ADR });

    const result = await runTask(
      root,
      folder,
      '1',
      DEFAULT_CONFIG,
      new ManifestAdapter([{ file: 'crates/core/Cargo.toml', content: CARGO_OPENSSL_RENAMED }]),
    );

    assert.equal(result.success, false);
    assert.equal(result.reason, 'denied_dependency');
    const events = await readEvents(folder);
    assert.deepEqual(events.find((event) => event.type === 'dependencies_added')?.data, {
      added: [{ file: 'crates/core/Cargo.toml', name: 'openssl' }],
    });

    const marker = await fs.readFile(path.join(folder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(marker, /^- openssl in crates\/core\/Cargo\.toml: ADR 007: Do not use OpenSSL$/m);
  });

  it('Unreadable Cargo manifest', async () => {
    const { root, folder } = await setup({ adr: ACCEPTED_ADR });

    const result = await runTask(
      root,
      folder,
      '1',
      DEFAULT_CONFIG,
      new ManifestAdapter([{ file: 'crates/core/Cargo.toml', content: CARGO_UNREADABLE }]),
    );

    assert.equal(result.success, false);
    assert.equal(result.reason, 'denied_dependency');
    assert.equal(result.error, 'Cannot read dependency tables: crates/core/Cargo.toml');

    const marker = await fs.readFile(path.join(folder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(marker, /reason: denied_dependency/);
    assert.match(marker, /osq cannot read the dependency tables of these manifests:/);
    assert.match(marker, /^- crates\/core\/Cargo\.toml: line 3: /m);
  });

  it('Unreadable manifest without denials', async () => {
    const { root, folder } = await setup();

    const result = await runTask(
      root,
      folder,
      '1',
      DEFAULT_CONFIG,
      new ManifestAdapter([{ file: 'crates/core/Cargo.toml', content: CARGO_UNREADABLE }]),
    );

    assert.equal(result.success, true);
    const events = await readEvents(folder);
    assert.equal(
      events.some((event) => event.type === 'dead'),
      false,
    );
    assert.ok(
      events.some((event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn'),
    );
  });
});
