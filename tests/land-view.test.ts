import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG, type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { landLines } from '../src/core/status/show-land-lines.js';
import { readLandView } from '../src/core/status/show-land-model.js';
import type { SpecDetails } from '../src/core/status/show-types.js';
import { formatShowJson, formatShowText, getSpecDetails } from '../src/core/status/show.js';
import { selectVcs } from '../src/core/vcs/select.js';
import { getWebChange } from '../src/core/web/web-data.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.posix.join('openspec', 'changes');
const ARCHIVE = path.join(CHANGES, 'archive');
const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-land-view-'));
  tmpDirs.push(root);
  return root;
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

async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function proposalMd(): string {
  return [
    '---',
    'title: Pricing',
    'depends_on: []',
    'verify: node verify.cjs',
    'check: node check.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    '',
    'Pricing goal.',
    '',
  ].join('\n');
}

function taskMd(): string {
  return [
    '---',
    'title: Only task',
    'verify: node verify.cjs',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

const DELTA = [
  '## ADDED Requirements',
  '',
  '### Requirement: Volume pricing',
  'The system SHALL price volume.',
  '',
  '#### Scenario: Ten or more',
  '- **WHEN** ten arrive',
  '- **THEN** a discount applies',
  '',
].join('\n');

const RESULT = [
  '# Result',
  '',
  '## Deviated',
  '',
  '- Renamed the helper.',
  '',
  '## Outside scope',
  '',
  '- Left a TODO elsewhere.',
  '',
].join('\n');

/** The pre-archive gate events: pre-spawn, then two later task verifies. */
const TASK_EVENTS = [
  {
    type: 'verify_ran',
    timestamp: '2026-10-01T09:00:00.000Z',
    data: { command: 'node verify.cjs', exitCode: 1, duration: 0.5, phase: 'pre_spawn' },
  },
  {
    type: 'verify_ran',
    timestamp: '2026-10-01T09:05:00.000Z',
    data: { command: 'node verify.cjs', exitCode: 1, duration: 1.2 },
  },
  {
    type: 'verify_ran',
    timestamp: '2026-10-01T09:06:00.000Z',
    data: { command: 'node verify.cjs', exitCode: 0, duration: 1.5 },
  },
];

const CHANGE_EVENTS = [
  {
    type: 'verify_ran',
    timestamp: '2026-10-01T09:07:00.000Z',
    data: { command: 'node verify.cjs', exitCode: 1, duration: 2.0 },
  },
  {
    type: 'verify_ran',
    timestamp: '2026-10-01T09:08:00.000Z',
    data: { command: 'node verify.cjs', exitCode: 0, duration: 2.4 },
  },
  {
    type: 'verify_ran',
    timestamp: '2026-10-01T09:08:30.000Z',
    data: { command: 'node check.cjs', exitCode: 0, duration: 0.7 },
  },
  {
    type: 'validator_ran',
    timestamp: '2026-10-01T09:09:00.000Z',
    data: {
      outcome: 'validated',
      harness: 'claude',
      model: 'claude-opus-5-5',
      duration: 61.4,
      exitCode: 0,
      scenarios: 3,
      findings: [
        {
          kind: 'scenario',
          capability: 'pricing',
          requirement: 'Volume pricing',
          scenario: 'Ten or more',
          problem: 'no_test',
          detail: 'Only the five-item tier is tested.',
        },
      ],
      restored: [],
    },
  },
  {
    type: 'archived',
    timestamp: '2026-10-01T09:10:00.000Z',
    data: { archivePath: 'openspec/changes/archive/042-pricing' },
  },
  {
    type: 'verify_ran',
    timestamp: '2026-10-01T12:00:00.000Z',
    data: { command: 'node verify.cjs', exitCode: 0, duration: 9999 },
  },
];

/** Writes an archived change folder with its gate events, result and delta. */
async function writeArchivedChange(root: string, folder: string): Promise<string> {
  const folderPath = path.join(root, ARCHIVE, folder);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMd(), 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMd(), 'utf8');
  await writeAt(folderPath, path.join('specs', 'pricing', 'spec.md'), DELTA);
  await writeAt(folderPath, path.join('.run', 'approved'), 'sha256:abc\n');
  await writeAt(
    folderPath,
    path.join('.run', 'events', '1.jsonl'),
    `${TASK_EVENTS.map((event) => JSON.stringify(event)).join('\n')}\n`,
  );
  await writeAt(
    folderPath,
    path.join('.run', 'events', 'change.jsonl'),
    `${CHANGE_EVENTS.map((event) => JSON.stringify(event)).join('\n')}\n`,
  );
  await writeAt(folderPath, path.join('.run', 'results', '1.md'), RESULT);
  return folderPath;
}

async function writeActiveChange(root: string, folder: string): Promise<void> {
  await writeAt(root, path.join(CHANGES, folder, 'proposal.md'), proposalMd());
  await writeAt(root, path.join(CHANGES, folder, 'tasks', '1.md'), taskMd());
}

/** A committed temp repository with one change archived in an `osq/` worktree. */
async function setupWorktreeProject(): Promise<{
  root: string;
  repo: string;
  config: OsqConfig;
  folder: string;
}> {
  const root = await tempRoot();
  const repo = path.join(root, 'repo');
  await fs.mkdir(repo, { recursive: true });
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await fs.writeFile(path.join(repo, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const folder = '042-pricing';
  const worktreeRoot = path.join(root, 'worktrees');
  const worktree = path.join(worktreeRoot, 'repo', folder);
  await git(['worktree', 'add', '-q', '-b', `osq/${folder}`, worktree, 'main'], repo);
  await writeArchivedChange(worktree, folder);
  await fs.mkdir(path.join(worktree, 'src'), { recursive: true });
  await fs.writeFile(path.join(worktree, 'src', 'code.txt'), 'code\n', 'utf8');
  await git(['add', '-A'], worktree);
  await git(['commit', '-qm', 'archive'], worktree);

  await fs.writeFile(path.join(repo, 'main1.txt'), 'one\n', 'utf8');
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'main1'], repo);
  await fs.writeFile(path.join(repo, 'main2.txt'), 'two\n', 'utf8');
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'main2'], repo);

  const config = defineConfig({
    vcs: {
      enabled: true,
      author: 'Osq <osq@example.invalid>',
      worktreeRoot,
      defaultBranch: 'main',
    },
  });
  return { root, repo, config, folder };
}

describe('land view model', () => {
  it('Default branch moved after archive: landed is false and mainCommits is 2', async () => {
    const { repo, config, folder } = await setupWorktreeProject();
    const details = await getSpecDetails(repo, '042', config);
    const land = await readLandView(repo, details, config);
    assert.ok(land);
    assert.equal(land.landed, false);
    assert.equal(land.defaultBranch, 'main');
    assert.equal(land.mainCommits, 2);
    assert.equal(land.folderName, folder);
  });

  it('Landed change: landed is true and mainCommits is null', async () => {
    const root = await tempRoot();
    const repo = path.join(root, 'repo');
    await fs.mkdir(repo, { recursive: true });
    await git(['init', '-q', '-b', 'main'], repo);
    await git(['config', 'user.name', 'osq'], repo);
    await git(['config', 'user.email', 'osq@example.invalid'], repo);
    await writeArchivedChange(repo, '042-pricing');
    await git(['add', '-A'], repo);
    await git(['commit', '-qm', 'landed'], repo);
    const config = defineConfig({
      vcs: {
        enabled: true,
        author: 'Osq <osq@example.invalid>',
        worktreeRoot: path.join(root, 'worktrees'),
        defaultBranch: 'main',
      },
    });

    const details = await getSpecDetails(repo, '042', config);
    const land = await readLandView(repo, details, config);
    assert.ok(land);
    assert.equal(land.landed, true);
    assert.equal(land.mainCommits, null);
  });

  it('Gates at archive: task 1, verify, check and validator, and no event after archived', async () => {
    const { repo, config } = await setupWorktreeProject();
    const details = await getSpecDetails(repo, '042', config);
    const land = await readLandView(repo, details, config);
    assert.ok(land);

    assert.deepEqual(
      land.gates.map((gate) => [gate.kind, gate.task, gate.command, gate.outcome]),
      [
        ['task', '1', 'node verify.cjs', 'passed'],
        ['verify', null, 'node verify.cjs', 'passed'],
        ['check', null, 'node check.cjs', 'passed'],
        ['validator', null, 'claude/claude-opus-5-5', 'validated'],
      ],
    );
    assert.equal(land.gates[0]?.durationSeconds, 1.5);
    assert.equal(land.gates[0]?.exitCode, 0);
    assert.equal(land.gates[1]?.durationSeconds, 2.4);
    assert.equal(land.gates[2]?.durationSeconds, 0.7);
    assert.equal(land.gates[3]?.findings, 1);
    // The sync's post-archive verify (duration 9999) is not an archive gate.
    assert.ok(!land.gates.some((gate) => gate.durationSeconds === 9999));
    const archivedAt = Date.parse('2026-10-01T09:10:00.000Z');
    assert.ok(land.gates.every((gate) => Date.parse(gate.timestamp) <= archivedAt));
  });

  it('reads capabilities, disclosures and a halt, and compares diff to diffStat', async () => {
    const { repo, config, folder } = await setupWorktreeProject();
    const details = await getSpecDetails(repo, '042', config);
    const land = await readLandView(repo, details, config);
    assert.ok(land);

    assert.deepEqual(
      land.capabilities.map((capability) => ({
        name: capability.name,
        added: [...capability.added],
      })),
      [{ name: 'pricing', added: ['Volume pricing'] }],
    );
    assert.deepEqual(land.disclosures, [
      {
        task: '1',
        deviated: '- Renamed the helper.',
        outsideScope: '- Left a TODO elsewhere.',
      },
    ]);

    const vcs = await selectVcs(repo, config);
    const expected = await vcs.diffStat('main', `osq/${folder}`, ['openspec']);
    assert.deepEqual(land.diff, expected);
    assert.deepEqual(land.diff, { files: 1, added: 1, removed: 0 });
  });

  it('reads a halt marker and a sync stop', async () => {
    const root = await tempRoot();
    await writeArchivedChange(root, '042-pricing');
    const folderPath = path.join(root, ARCHIVE, '042-pricing');
    await writeAt(
      folderPath,
      path.join('.run', 'regressed', 'change.md'),
      '---\nreason: sync_conflict\n---\nfirst line\nsecond line\n',
    );
    await writeAt(
      folderPath,
      path.join('.run', 'events', 'change.jsonl'),
      `${[
        ...CHANGE_EVENTS,
        {
          type: 'sync_stopped',
          timestamp: '2026-10-02T00:00:00.000Z',
          data: { reason: 'sync_conflict', message: 'stopped line\nmore', defaultBranch: 'main' },
        },
      ]
        .map((event) => JSON.stringify(event))
        .join('\n')}\n`,
    );

    const details = await getSpecDetails(root, '042', DEFAULT_CONFIG);
    const land = await readLandView(root, details, DEFAULT_CONFIG);
    assert.ok(land);
    assert.deepEqual(land.halt, { reason: 'sync_conflict', message: 'first line\nsecond line' });
    assert.equal(land.lastSyncStop?.reason, 'sync_conflict');
    assert.equal(land.lastSyncStop?.message, 'stopped line\nmore');
  });

  it('Active change: readLandView returns null for active and rejected changes', async () => {
    const root = await tempRoot();
    await writeActiveChange(root, '010-active');
    await writeAt(root, path.join(CHANGES, 'rejected', '002-gone', 'proposal.md'), proposalMd());

    const active = await getSpecDetails(root, '010', DEFAULT_CONFIG);
    assert.equal(await readLandView(root, active, DEFAULT_CONFIG), null);

    const rejected = await getSpecDetails(root, '002', DEFAULT_CONFIG);
    assert.equal(rejected.location, 'rejected');
    assert.equal(await readLandView(root, rejected, DEFAULT_CONFIG), null);
  });

  it('Git off: git fields are null while gates, capabilities and disclosures are read', async () => {
    const root = await tempRoot();
    await writeArchivedChange(root, '042-pricing');

    const details = await getSpecDetails(root, '042', DEFAULT_CONFIG);
    const land = await readLandView(root, details, DEFAULT_CONFIG);
    assert.ok(land);
    assert.equal(land.landed, null);
    assert.equal(land.defaultBranch, null);
    assert.equal(land.mainCommits, null);
    assert.equal(land.diff, null);
    assert.equal(land.gates.length, 4);
    assert.deepEqual(
      land.capabilities.map((capability) => capability.name),
      ['pricing'],
    );
    assert.equal(land.disclosures.length, 1);
  });
});

describe('land in show', () => {
  it('Show prints the land summary: two commits behind, with gates', async () => {
    const { repo, config } = await setupWorktreeProject();
    const details = await getSpecDetails(repo, '042', config);
    const text = formatShowText(details);
    assert.ok(
      text.includes(
        'Land: not landed; main has 2 new commits since archive, so osq land will sync and verify again',
      ),
      text,
    );
    assert.ok(text.includes('  Gates at archive:'), text);
    assert.ok(text.includes('    task 1: passed in 2s (node verify.cjs)'), text);
    assert.ok(
      text.includes('    validator: validated in 61s (claude/claude-opus-5-5), 1 findings'),
      text,
    );
    assert.ok(text.includes('  Diff: 1 files, +1 -0'), text);
    assert.ok(text.includes('  Spec changes:'), text);
    assert.ok(text.includes('    pricing: 1 added, 0 modified, 0 removed, 0 renamed'), text);
    assert.ok(text.includes('  Disclosures: task 1 deviated, task 1 outside scope'), text);

    const document = JSON.parse(formatShowJson(details)) as Record<string, unknown>;
    assert.ok('land' in document, 'land key present');
    const keys = Object.keys(document);
    assert.ok(keys.indexOf('land') < keys.indexOf('digest'), 'land before digest');
  });

  it('Show prints a git-off headline', async () => {
    const root = await tempRoot();
    await writeArchivedChange(root, '042-pricing');
    const details = await getSpecDetails(root, '042', DEFAULT_CONFIG);
    const text = formatShowText(details);
    assert.ok(text.includes('Land: git is off'), text);
    assert.ok(text.includes('  Gates at archive:'), text);
  });

  it('Active change unchanged: no Land line and no land key', async () => {
    const root = await tempRoot();
    await writeActiveChange(root, '010-active');
    const details = await getSpecDetails(root, '010', DEFAULT_CONFIG);

    const text = formatShowText(details);
    assert.ok(!text.includes('Land:'), text);
    const document = JSON.parse(formatShowJson(details)) as Record<string, unknown>;
    assert.equal('land' in document, false);
  });

  it('names one commit, no movement and a missing branch', () => {
    const gateView = {
      folderName: '042-pricing',
      defaultBranch: 'main',
      gates: [],
      diff: null,
      capabilities: [],
      disclosures: [],
      halt: null,
      lastSync: null,
      lastSyncStop: null,
    };
    const headline = (land: SpecDetails['land']): string =>
      landLines({ land } as SpecDetails)[1] ?? '';
    assert.equal(
      headline({ ...gateView, landed: false, mainCommits: 1 }),
      'Land: not landed; main has 1 new commit since archive, so osq land will sync and verify again',
    );
    assert.equal(
      headline({ ...gateView, landed: false, mainCommits: 0 }),
      'Land: not landed; main has not moved since archive',
    );
    assert.equal(
      headline({ ...gateView, landed: false, mainCommits: null }),
      'Land: not landed; branch osq/042-pricing not found',
    );
    assert.equal(headline({ ...gateView, landed: true, mainCommits: null }), 'Land: landed');
  });
});

describe('land view document', () => {
  it('Archived change document: land equals readLandView for the same change', async () => {
    const root = await tempRoot();
    await writeArchivedChange(root, '042-pricing');
    const details = await getSpecDetails(root, '042', DEFAULT_CONFIG);
    const expected = await readLandView(root, details, DEFAULT_CONFIG);

    const document = await getWebChange(root, '042-pricing', DEFAULT_CONFIG);
    assert.equal(document.location, 'archived');
    assert.deepEqual(document.land, expected);
  });

  it('Active change document: land is null', async () => {
    const root = await tempRoot();
    await writeActiveChange(root, '010-active');
    const document = await getWebChange(root, '010-active', DEFAULT_CONFIG);
    assert.equal(document.land, null);
  });
});
