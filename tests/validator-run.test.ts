import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { mergeDelta, parseDelta } from '../src/core/spec/delta.js';
import { getArchiveDir } from '../src/core/status/layout.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { checkAndArchiveSpec } from '../src/watcher/archiver.js';

const execFileAsync = promisify(execFile);
const FOLDER = '001-validator';
const CAPABILITY = 'orders';
const BRANCH = `osq/${FOLDER}`;
const LIVING_REL = `openspec/specs/${CAPABILITY}/spec.md`;
const CHANGE_REL = `openspec/changes/${FOLDER}`;
const SOURCE_REL = 'src/a.ts';
const VALIDATOR_TIMEOUT = 7;
const VALIDATOR = {
  enabled: true,
  harness: 'claude',
  model: 'validator-model',
  timeoutSeconds: VALIDATOR_TIMEOUT,
} as const;

const LIVING_SPEC = `# orders Specification

## Purpose

Orders are totalled.

## Requirements

### Requirement: Order totals
The system SHALL total orders.

#### Scenario: Totals
- **WHEN** an order arrives
- **THEN** it is totalled
`;

const DELTA_SPEC = `# Spec Delta: orders

## Purpose

Adds a checked order.

## ADDED Requirements

### Requirement: Checked order
The system SHALL check orders.

#### Scenario: Check
- **WHEN** an order arrives
- **THEN** it is checked
`;

const FINDING = {
  kind: 'scenario',
  capability: 'orders',
  requirement: 'Checked order',
  scenario: 'Check',
  problem: 'no_test',
  detail: 'No test checks the THEN.',
};

const FINDINGS_JSON = JSON.stringify({ findings: [FINDING] });
const PASS_SCRIPT = 'process.exit(0);\n';
const SOURCE_BASE = 'export const a = 1;\n';
const SOURCE_EDITED = 'export const a = 2;\n';

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

interface FakeBehavior {
  readonly findings?: string;
  readonly timedOut?: boolean;
  readonly exitCode?: number;
  readonly throwMessage?: string;
  readonly edit?: (options: SpawnTaskOptions) => Promise<void>;
}

/** A harness adapter that records its spawn options and can write or edit files. */
class FakeAdapter implements HarnessAdapter {
  readonly name = 'fake';
  readonly spawns: SpawnTaskOptions[] = [];

  constructor(private readonly behavior: FakeBehavior = {}) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.spawns.push(options);
    if (this.behavior.throwMessage !== undefined) throw new Error(this.behavior.throwMessage);
    if (this.behavior.edit) await this.behavior.edit(options);
    if (this.behavior.findings !== undefined) {
      const dir = path.join(options.specFolderPath, '.run', 'validator');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'findings.json'), this.behavior.findings, 'utf8');
    }
    return {
      exitCode: this.behavior.exitCode ?? 0,
      ...(this.behavior.timedOut ? { timedOut: true } : {}),
    };
  }
}

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** The test's own git calls ignore redirecting variables, like osq's reads. */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
    Reflect.deleteProperty(env, key);
  }
  return env;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
  return stdout.trim();
}

async function write(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function readEvents(eventsPath: string): Promise<ParsedEvent[]> {
  const raw = await fs.readFile(eventsPath, 'utf8').catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

function validatorConfig(): OsqConfig {
  return { ...DEFAULT_CONFIG, validator: { ...VALIDATOR } };
}

function proposal(check: string): string {
  return [
    '---',
    'title: Validator run',
    'depends_on: []',
    'verify: node verify.cjs',
    `check: ${check}`,
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Exercise the validator.',
    '## Contract',
    '| Input | Expected Output |',
    '|---|---|',
    '| a | b |',
    '## Non-goals',
    'None.',
    '## Surface',
    'None.',
    '## Human steps',
    '### Before approval',
    'None',
    '### After landing',
    'None',
    '## Delta',
    'None.',
  ].join('\n');
}

/** Every spawn the validator must make, and the options it must carry. */
function assertValidatorSpawn(adapter: FakeAdapter): void {
  assert.equal(adapter.spawns.length, 1, 'the validator should spawn exactly once');
  const options = adapter.spawns[0];
  assert.equal(options.taskNumber, 'validator');
  assert.equal(options.timeoutSeconds, VALIDATOR_TIMEOUT);
  assert.equal(options.config?.harness, VALIDATOR.harness);
  assert.equal(options.config?.claude?.model, VALIDATOR.model);
  assert.match(options.prompt ?? '', /\.run\/validator\/findings\.json/);
}

/** A scaffolded project outside git holding a done change and its living spec. */
async function writeScaffoldedChange(root: string): Promise<string> {
  const folder = path.join(root, CHANGE_REL);
  await write(root, LIVING_REL, LIVING_SPEC);
  await fs.mkdir(path.join(folder, 'specs', CAPABILITY), { recursive: true });
  await fs.mkdir(path.join(folder, '.run'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposal('node check.cjs'), 'utf8');
  await fs.writeFile(path.join(folder, 'specs', CAPABILITY, 'spec.md'), DELTA_SPEC, 'utf8');
  await fs.writeFile(path.join(folder, '.run', 'approved'), 'sealed\n', 'utf8');
  await fs.writeFile(path.join(root, 'verify.cjs'), PASS_SCRIPT, 'utf8');
  await fs.writeFile(path.join(root, 'check.cjs'), PASS_SCRIPT, 'utf8');
  return folder;
}

interface Scenario {
  readonly root: string;
  readonly worktree: string;
  readonly folder: string;
  readonly archived: string;
  readonly config: OsqConfig;
}

/**
 * A temporary repository whose `main` holds a scaffolded project, a source
 * file, and the living spec, plus a linked worktree on `osq/001-validator`
 * holding a done change pointed at the base commit.
 */
async function setupWorktree(): Promise<Scenario> {
  const parent = await makeTempDir('osq-validator-wt-');
  const root = path.join(parent, 'repo');
  await fs.mkdir(root);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await scaffoldProject(root);
  await write(root, LIVING_REL, LIVING_SPEC);
  await write(root, SOURCE_REL, SOURCE_BASE);
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'init'], root);
  const base = await git(['rev-parse', 'HEAD'], root);

  await git(['branch', BRANCH], root);
  const worktree = path.join(parent, 'worktree');
  await git(['worktree', 'add', worktree, BRANCH], root);

  const folder = path.join(worktree, CHANGE_REL);
  await fs.mkdir(path.join(folder, 'specs', CAPABILITY), { recursive: true });
  await fs.mkdir(path.join(folder, '.run', 'results'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposal('node check.cjs'), 'utf8');
  await fs.writeFile(path.join(folder, 'specs', CAPABILITY, 'spec.md'), DELTA_SPEC, 'utf8');
  await fs.writeFile(path.join(folder, '.run', 'base'), `${base}\n`, 'utf8');
  await fs.writeFile(path.join(folder, '.run', 'approved'), 'sealed\n', 'utf8');
  await fs.writeFile(path.join(folder, '.run', 'results', '1.md'), 'done\n', 'utf8');
  await fs.writeFile(path.join(worktree, 'verify.cjs'), PASS_SCRIPT, 'utf8');
  await fs.writeFile(path.join(worktree, 'check.cjs'), PASS_SCRIPT, 'utf8');
  await git(['add', '-A'], worktree);
  await git(['commit', '-qm', 'osq: change'], worktree);

  const archived = path.join(getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, worktree), FOLDER);
  return { root, worktree, folder, archived, config: validatorConfig() };
}

async function archive(spec: Scenario, adapter: FakeAdapter): Promise<ParsedEvent[]> {
  assert.equal(
    await checkAndArchiveSpec(spec.worktree, spec.folder, spec.config, {
      validatorAdapter: adapter,
    }),
    true,
  );
  return readEvents(path.join(spec.archived, '.run', 'events', 'change.jsonl'));
}

function validatorEvent(events: readonly ParsedEvent[]): ParsedEvent | undefined {
  return events.find((event) => event.type === 'validator_ran');
}

describe('validator at archive', () => {
  it('records findings and archives in a linked worktree', async () => {
    const spec = await setupWorktree();
    const adapter = new FakeAdapter({ findings: FINDINGS_JSON });

    const events = await archive(spec, adapter);

    assertValidatorSpawn(adapter);
    const event = validatorEvent(events);
    assert.equal(event?.data?.outcome, 'validated');
    assert.deepEqual(event?.data?.findings, [FINDING]);
    assert.deepEqual(event?.data?.restored, []);
    assert.equal(await exists(path.join(spec.archived, '.run', 'validator')), false);
  });

  it('records failed when the adapter throws', async () => {
    const spec = await setupWorktree();
    const adapter = new FakeAdapter({ throwMessage: 'boom' });

    const events = await archive(spec, adapter);

    assertValidatorSpawn(adapter);
    const event = validatorEvent(events);
    assert.equal(event?.data?.outcome, 'failed');
    assert.equal(event?.data?.output, 'boom');
    assert.deepEqual(event?.data?.findings, []);
  });

  it('records timed_out when the adapter times out', async () => {
    const spec = await setupWorktree();
    const adapter = new FakeAdapter({ timedOut: true, exitCode: 124 });

    const events = await archive(spec, adapter);

    assertValidatorSpawn(adapter);
    const event = validatorEvent(events);
    assert.equal(event?.data?.outcome, 'timed_out');
    assert.deepEqual(event?.data?.findings, []);
  });

  it('records unreadable when the findings file is not parseable', async () => {
    const spec = await setupWorktree();
    const adapter = new FakeAdapter({ findings: 'not json' });

    const events = await archive(spec, adapter);

    assertValidatorSpawn(adapter);
    const event = validatorEvent(events);
    assert.equal(event?.data?.outcome, 'unreadable');
    assert.equal(event?.data?.output, 'not json');
    assert.deepEqual(event?.data?.findings, []);
  });

  it('puts back every path the validator changes', async () => {
    const spec = await setupWorktree();
    const adapter = new FakeAdapter({
      findings: FINDINGS_JSON,
      edit: async (options) => {
        await write(options.projectRoot, SOURCE_REL, SOURCE_EDITED);
        await write(options.projectRoot, LIVING_REL, `${LIVING_SPEC}\n<!-- validator edit -->\n`);
        await write(options.projectRoot, 'notes.txt', 'notes\n');
      },
    });

    const events = await archive(spec, adapter);
    const merged = mergeDelta(LIVING_SPEC, CAPABILITY, parseDelta(DELTA_SPEC));

    assertValidatorSpawn(adapter);
    assert.equal(await fs.readFile(path.join(spec.worktree, SOURCE_REL), 'utf8'), SOURCE_BASE);
    assert.equal(await fs.readFile(path.join(spec.worktree, LIVING_REL), 'utf8'), merged);
    assert.equal(await exists(path.join(spec.worktree, 'notes.txt')), false);
    const event = validatorEvent(events);
    assert.equal(event?.data?.outcome, 'validated');
    assert.deepEqual(event?.data?.restored, ['notes.txt', LIVING_REL, SOURCE_REL]);
  });

  it('records not_run no_base outside git without spawning', async () => {
    const root = await makeTempDir('osq-validator-nobase-');
    await scaffoldProject(root);
    const folder = await writeScaffoldedChange(root);
    const adapter = new FakeAdapter();

    assert.equal(
      await checkAndArchiveSpec(root, folder, validatorConfig(), { validatorAdapter: adapter }),
      true,
    );

    assert.equal(adapter.spawns.length, 0);
    const archived = path.join(getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, root), FOLDER);
    const event = validatorEvent(
      await readEvents(path.join(archived, '.run', 'events', 'change.jsonl')),
    );
    assert.equal(event?.data?.outcome, 'not_run');
    assert.equal(event?.data?.reason, 'no_base');
  });

  it('spawns nothing and appends no event when the validator is off', async () => {
    const root = await makeTempDir('osq-validator-off-');
    await scaffoldProject(root);
    const folder = await writeScaffoldedChange(root);
    const adapter = new FakeAdapter();

    assert.equal(
      await checkAndArchiveSpec(root, folder, DEFAULT_CONFIG, { validatorAdapter: adapter }),
      true,
    );

    assert.equal(adapter.spawns.length, 0);
    const archived = path.join(getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, root), FOLDER);
    const events = await readEvents(path.join(archived, '.run', 'events', 'change.jsonl'));
    assert.equal(
      events.some((event) => event.type === 'validator_ran'),
      false,
    );
  });
});
