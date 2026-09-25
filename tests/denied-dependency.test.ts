import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { MockAdapter } from '../src/harness/mock.js';
import { buildExecutorPrompt } from '../src/harness/prompt.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const PASS_SCRIPT = 'process.exit(0);\n';

const MANIFEST_BASE = `${JSON.stringify(
  { dependencies: { chokidar: '^3' }, devDependencies: { tsx: '^4' } },
  null,
  2,
)}\n`;
const MANIFEST_ZOD = `${JSON.stringify(
  { dependencies: { chokidar: '^3', zod: '^3' }, devDependencies: { tsx: '^4' } },
  null,
  2,
)}\n`;
const MANIFEST_VUE = `${JSON.stringify(
  { dependencies: { chokidar: '^3', vue: '^3' }, devDependencies: { tsx: '^4' } },
  null,
  2,
)}\n`;

const ACCEPTED_ADR = `---
status: accepted
rule: Do not use Vue
denies:
  - vue
---
# 7. No Vue

Do not use Vue.
`;

const SUPERSEDED_ADR = `---
status: superseded
rule: Do not use Vue
denies:
  - vue
superseded_by: 007
---
# 7. No Vue

Do not use Vue.
`;

const TASKS_MD = `# Tasks

- [ ] 1. When a task adds a package, the watcher records it
`;

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

function proposal(): string {
  return `---
title: Dependency gate
depends_on: []
verify: node pass.cjs
features:
  reads: []
---
## Goal

Exercise the dependency gate.

## Surface

None

## Decisions

None
`;
}

function taskMarkdown(scope: readonly string[]): string {
  return [
    '---',
    'title: When a task adds a package, the watcher records it',
    'verify: node pass.cjs',
    `scope: ${JSON.stringify(scope)}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] the watcher records and gates the addition',
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

async function setupProject(
  options: { adr?: string; scope?: readonly string[] } = {},
): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-deps-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'pass.cjs'), PASS_SCRIPT, 'utf8');
  await fs.writeFile(path.join(root, 'package.json'), MANIFEST_BASE, 'utf8');
  if (options.adr) {
    await fs.mkdir(path.join(root, 'decisions'), { recursive: true });
    await fs.writeFile(path.join(root, 'decisions', '007-vue.md'), options.adr, 'utf8');
  }

  const folder = path.join(root, 'openspec', 'changes', '001-dependency-gate');
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposal(), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks.md'), TASKS_MD, 'utf8');
  await fs.writeFile(
    path.join(folder, 'tasks', '1.md'),
    taskMarkdown(options.scope ?? ['package.json']),
    'utf8',
  );
  await approveSpec(root, '001', DEFAULT_CONFIG);
  return { root, folder };
}

describe('dependency baseline and addition in runTask', () => {
  const roots: string[] = [];

  async function setup(
    options: { adr?: string; scope?: readonly string[] } = {},
  ): Promise<Project> {
    const project = await setupProject(options);
    roots.push(project.root);
    return project;
  }

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('records the scoped manifest baseline in the start measures event', async () => {
    const { root, folder } = await setup();

    const result = await runTask(root, folder, '1', DEFAULT_CONFIG, new ManifestAdapter());

    assert.equal(result.success, true);
    const start = measuresStart(await readEvents(folder));
    assert.deepEqual(start?.data?.dependencies, { 'package.json': ['chokidar', 'tsx'] });
  });

  it('omits the baseline and reads nothing when no manifest is in scope', async () => {
    const { root, folder } = await setup({ scope: [] });
    await fs.writeFile(path.join(root, 'package.json'), 'not valid json', 'utf8');

    const result = await runTask(root, folder, '1', DEFAULT_CONFIG, new ManifestAdapter());

    assert.equal(result.success, true);
    const start = measuresStart(await readEvents(folder));
    assert.equal('dependencies' in (start?.data ?? {}), false);
  });

  it('records an allowed addition and goes on to verify', async () => {
    const { root, folder } = await setup();

    const result = await runTask(
      root,
      folder,
      '1',
      DEFAULT_CONFIG,
      new ManifestAdapter([{ file: 'package.json', content: MANIFEST_ZOD }]),
    );

    assert.equal(result.success, true);
    const events = await readEvents(folder);
    const added = events.find((event) => event.type === 'dependencies_added');
    assert.deepEqual(added?.data, { added: [{ file: 'package.json', name: 'zod' }] });
    assert.ok(
      events.some((event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn'),
    );
    assert.ok(events.some((event) => event.type === 'done'));
  });

  it('kills the task with denied_dependency naming the package, file, ADR, and rule', async () => {
    const { root, folder } = await setup({ adr: ACCEPTED_ADR });

    const result = await runTask(
      root,
      folder,
      '1',
      DEFAULT_CONFIG,
      new ManifestAdapter([{ file: 'package.json', content: MANIFEST_VUE }]),
    );

    assert.equal(result.success, false);
    assert.equal(result.reason, 'denied_dependency');

    const events = await readEvents(folder);
    assert.deepEqual(events.find((event) => event.type === 'dependencies_added')?.data, {
      added: [{ file: 'package.json', name: 'vue' }],
    });
    assert.equal(
      events.some((event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn'),
      false,
    );
    assert.deepEqual(events.find((event) => event.type === 'dead')?.data, {
      task: '1',
      reason: 'denied_dependency',
    });
    const addedIndex = events.findIndex((event) => event.type === 'dependencies_added');
    const deadIndex = events.findIndex((event) => event.type === 'dead');
    assert.ok(addedIndex < deadIndex, 'the event is appended before the task dies');

    const marker = await fs.readFile(path.join(folder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(marker, /reason: denied_dependency/);
    assert.match(marker, /The task added packages an accepted ADR denies:/);
    assert.match(marker, /^- vue in package\.json: ADR 007: Do not use Vue$/m);
  });

  it('does not enforce a package denied only by a superseded ADR', async () => {
    const { root, folder } = await setup({ adr: SUPERSEDED_ADR });

    const result = await runTask(
      root,
      folder,
      '1',
      DEFAULT_CONFIG,
      new ManifestAdapter([{ file: 'package.json', content: MANIFEST_VUE }]),
    );

    assert.equal(result.success, true);
    const events = await readEvents(folder);
    assert.ok(events.some((event) => event.type === 'dependencies_added'));
    assert.equal(
      events.some((event) => event.type === 'dead'),
      false,
    );
  });
});

interface LoopFixture {
  root: string;
  config: OsqConfig;
  adapter: RetryingManifestAdapter;
}

/** Mock adapter that adds `vue` on its first attempt and removes it on the retry. */
class RetryingManifestAdapter extends MockAdapter {
  readonly spawns: SpawnTaskOptions[] = [];

  override async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.spawns.push(options);
    const manifestPath = path.join(options.projectRoot, 'package.json');
    await fs.writeFile(manifestPath, options.attempt === 1 ? MANIFEST_VUE : MANIFEST_BASE, 'utf8');
    return super.spawn(options);
  }
}

async function setupLoop(): Promise<LoopFixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-deps-loop-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'pass.cjs'), PASS_SCRIPT, 'utf8');
  await fs.writeFile(path.join(root, 'package.json'), MANIFEST_BASE, 'utf8');
  await fs.mkdir(path.join(root, 'decisions'), { recursive: true });
  await fs.writeFile(path.join(root, 'decisions', '007-vue.md'), ACCEPTED_ADR, 'utf8');

  const spec = await createNewSpec(root, 'Dependency Gate');
  await fs.writeFile(
    path.join(spec.folderPath, 'tasks', '1.md'),
    taskMarkdown(['package.json']),
    'utf8',
  );
  const proposalPath = path.join(spec.folderPath, 'proposal.md');
  const content = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(
    proposalPath,
    content.replace(/^verify:.*$/m, 'verify: node pass.cjs'),
    'utf8',
  );
  await approveSpec(root, '001', DEFAULT_CONFIG);

  const config: OsqConfig = {
    ...DEFAULT_CONFIG,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  };
  return { root, config, adapter: new RetryingManifestAdapter() };
}

describe('denied_dependency through the watcher loop', () => {
  it('retries the death automatically and the next prompt names the package', async () => {
    const fixture = await setupLoop();
    try {
      const summary = await runWatcherOnce(
        fixture.root,
        fixture.config,
        fixture.adapter,
        undefined,
      );

      assert.equal(summary.retried, 1);
      assert.equal(summary.tasksRun, 2);
      assert.equal(fixture.adapter.spawns.length, 2);

      const retrySpawn = fixture.adapter.spawns[1];
      assert.equal(retrySpawn?.attempt, 2);
      assert.equal(retrySpawn?.priorFailureReason, 'denied_dependency');
      assert.match(retrySpawn?.priorFailureOutput ?? '', /vue/);
      assert.match(retrySpawn?.priorFailureOutput ?? '', /ADR 007/);
      assert.match(buildExecutorPrompt(retrySpawn as SpawnTaskOptions), /vue/);
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });
});
