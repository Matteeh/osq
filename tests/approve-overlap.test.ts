import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { approveCommand } from '../src/cli/approve.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import type { AwaitedDependency } from '../src/core/spec/stack-dependencies.js';
import {
  awaitedDependencies,
  formatStackedOn,
  parseStackedOn,
  readDependencyState,
} from '../src/core/spec/stack-dependencies.js';
import { awaitedForApproval } from '../src/core/spec/stack-overlap.js';
import { selectVcs } from '../src/core/vcs/select.js';
import { stackedPath, worktreeBranch, worktreePath } from '../src/core/vcs/worktree.js';

const execFileAsync = promisify(execFile);

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

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

async function installFakeValidator(projectRoot: string): Promise<void> {
  const binDir = path.join(projectRoot, 'node_modules', '.bin');
  await fs.mkdir(binDir, { recursive: true });
  await fs.writeFile(
    path.join(binDir, 'openspec'),
    "#!/usr/bin/env node\nprocess.stdout.write('{}');\n",
    { mode: 0o755 },
  );
  const manifestDir = path.join(projectRoot, 'node_modules', '@fission-ai', 'openspec');
  await fs.mkdir(manifestDir, { recursive: true });
  await fs.writeFile(
    path.join(manifestDir, 'package.json'),
    JSON.stringify({ name: '@fission-ai/openspec', version: '1.13.1' }),
    'utf8',
  );
}

/** Replace the seeded planning sentinel with a real local verifier. */
async function installLocalVerifier(root: string, folderPath: string): Promise<void> {
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  for (const rel of ['proposal.md', path.join('tasks', '1.md')]) {
    const target = path.join(folderPath, rel);
    const content = await fs.readFile(target, 'utf8').catch(() => null);
    if (content === null) continue;
    await fs.writeFile(
      target,
      content.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
      'utf8',
    );
  }
}

interface Change {
  folderName: string;
  folderPath: string;
}

interface Project {
  root: string;
  repo: string;
  worktrees: string;
  config: OsqConfig;
  vcs: VcsConfig;
}

/** A committed temp repository with no change folders yet. */
async function newRepo(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-approve-overlap-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });

  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  return { root, repo, worktrees, config: defineConfig({ vcs }), vcs };
}

/** The delta spec that gives `capability` one added requirement. */
function deltaSpec(capability: string): string {
  return `# Spec Delta: ${capability}

## Purpose

The ${capability} capability for the test.

## ADDED Requirements

### Requirement: ${capability} works

The ${capability} capability SHALL work.

#### Scenario: ${capability} runs
- **WHEN** it runs
- **THEN** it works
`;
}

/** Create a change with the given capability deltas and an optional dependency. */
async function addChange(
  p: Project,
  title: string,
  capabilities: readonly string[],
  dependsOn?: readonly string[],
): Promise<Change> {
  const change = await createNewSpec(p.repo, title, dependsOn ? { dependsOn } : {});
  await installLocalVerifier(p.repo, change.folderPath);
  for (const capability of capabilities) {
    const dir = path.join(change.folderPath, 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), deltaSpec(capability), 'utf8');
  }
  return { folderName: change.folderName, folderPath: change.folderPath };
}

async function projectWith(
  one: readonly string[],
  two: readonly string[],
  three: readonly string[],
  deps: { two?: readonly string[]; three?: readonly string[] } = {},
): Promise<{ p: Project; one: Change; two: Change; three: Change }> {
  const p = await newRepo();
  const c1 = await addChange(p, 'A', one);
  const c2 = await addChange(p, 'B', two, deps.two);
  const c3 = await addChange(p, 'C', three, deps.three);
  return { p, one: c1, two: c2, three: c3 };
}

/** Approve a change into its worktree and return that worktree's path. */
async function approve(p: Project, change: Change): Promise<string> {
  const result = await approveSpec(p.repo, change.folderName, p.config);
  assert.ok(result.worktreePath, `expected a worktree for ${change.folderName}`);
  return result.worktreePath;
}

/** Move a freshly approved change into its branch's archive directory. */
async function archiveOnBranch(p: Project, change: Change): Promise<void> {
  const wtPath = worktreePath(p.vcs, p.repo, change.folderName);
  const rel = path.relative(p.repo, change.folderPath);
  await fs.mkdir(path.join(wtPath, 'openspec', 'changes', 'archive'), { recursive: true });
  await git(['mv', rel, path.join('openspec', 'changes', 'archive', change.folderName)], wtPath);
  await git(['commit', '-qm', `archive ${change.folderName}`], wtPath);
}

/** Move a freshly approved change into its branch's rejected directory. */
async function rejectOnBranch(p: Project, change: Change): Promise<void> {
  const wtPath = worktreePath(p.vcs, p.repo, change.folderName);
  const rel = path.relative(p.repo, change.folderPath);
  await fs.mkdir(path.join(wtPath, 'openspec', 'changes', 'rejected'), { recursive: true });
  await git(['mv', rel, path.join('openspec', 'changes', 'rejected', change.folderName)], wtPath);
  await git(['commit', '-qm', `reject ${change.folderName}`], wtPath);
}

/** Land a draft by writing its archive to the default branch and committing. */
async function landOnMain(p: Project, change: Change): Promise<void> {
  const archive = path.join(p.repo, 'openspec', 'changes', 'archive', change.folderName);
  await fs.mkdir(path.dirname(archive), { recursive: true });
  await fs.cp(change.folderPath, archive, { recursive: true });
  await git(['add', '-A'], p.repo);
  await git(['commit', '-qm', `land ${change.folderName}`], p.repo);
}

async function stateHash(p: Project, folder: string): Promise<string> {
  const vcs = await selectVcs(p.repo, p.config);
  return (await readDependencyState(p.repo, p.config, vcs, folder)).hash ?? '';
}

async function overrideStackedOn(change: Change, body: string): Promise<void> {
  const dir = path.join(change.folderPath, '.run');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'stacked-on'), `${body}\n`, 'utf8');
}

async function branchExists(p: Project, branch: string): Promise<boolean> {
  const out = await git(['branch', '--format=%(refname:short)', '--list', branch], p.repo);
  return out !== '';
}

async function awaited(p: Project, change: Change): Promise<AwaitedDependency[]> {
  const vcs = await selectVcs(p.repo, p.config);
  return awaitedForApproval(p.repo, p.config, vcs, change.folderPath, change.folderName);
}

async function stackedOnLine(p: Project, change: Change): Promise<string> {
  const copy = path.join(
    stackedPath(p.vcs, p.repo, change.folderName),
    path.relative(p.repo, change.folderPath),
  );
  return (await fs.readFile(path.join(copy, '.run', 'stacked-on'), 'utf8')).trim();
}

describe('Which changes overlap', () => {
  it('stacks on an approved change that shares a capability', async () => {
    const { p, one, three } = await projectWith(['orders'], [], ['orders']);
    await approve(p, one);
    assert.deepEqual(await awaited(p, three), [
      { folder: one.folderName, hash: await stateHash(p, one.folderName), overlap: ['orders'] },
    ]);
  });

  it('overlaps nothing when the other writes different capabilities', async () => {
    const { p, one, three } = await projectWith(['billing'], [], ['orders']);
    await approve(p, one);
    assert.deepEqual(await awaited(p, three), []);
  });

  it('overlaps nothing when the other landed', async () => {
    const { p, one, three } = await projectWith(['orders'], [], ['orders']);
    await landOnMain(p, one);
    assert.deepEqual(await awaited(p, three), []);
  });

  it('overlaps nothing for a draft without an approval', async () => {
    const { p, three } = await projectWith(['orders'], [], ['orders']);
    assert.deepEqual(await awaited(p, three), []);
  });

  it('sorts the shared capabilities of an archived change', async () => {
    const { p, one, three } = await projectWith(['billing', 'orders'], [], ['billing', 'orders']);
    await approve(p, one);
    await archiveOnBranch(p, one);
    assert.deepEqual(await awaited(p, three), [
      {
        folder: one.folderName,
        hash: await stateHash(p, one.folderName),
        overlap: ['billing', 'orders'],
      },
    ]);
  });

  it('stacks on the tip of a chain that overlaps the same capability', async () => {
    const { p, one, two, three } = await projectWith(['orders'], ['orders'], ['orders'], {
      two: ['001'],
    });
    await approve(p, one);
    await archiveOnBranch(p, one);
    await approveSpec(p.repo, two.folderName, p.config);
    assert.deepEqual(await awaited(p, three), [
      {
        folder: two.folderName,
        hash: await stateHash(p, two.folderName),
        overlap: ['orders'],
      },
    ]);
  });

  it('returns every overlapping change sorted by folder name', async () => {
    const { p, one, two, three } = await projectWith(
      ['orders'],
      ['billing'],
      ['billing', 'orders'],
    );
    await approve(p, one);
    await approve(p, two);
    assert.deepEqual(await awaited(p, three), [
      { folder: one.folderName, hash: await stateHash(p, one.folderName), overlap: ['orders'] },
      { folder: two.folderName, hash: await stateHash(p, two.folderName), overlap: ['billing'] },
    ]);
  });

  it('stacks a change whose dependency is declared, not overlapping', async () => {
    const { p, one, two, three } = await projectWith(['orders'], ['orders'], ['orders'], {
      two: ['001'],
      three: ['002'],
    });
    await approve(p, one);
    await archiveOnBranch(p, one);
    await approveSpec(p.repo, two.folderName, p.config);
    assert.deepEqual(await awaited(p, three), [
      { folder: two.folderName, hash: await stateHash(p, two.folderName) },
    ]);
  });
});

describe('Awaited dependencies', () => {
  async function setup(): Promise<{ p: Project; two: Change; three: Change }> {
    const p = await newRepo();
    await addChange(p, 'A', []);
    const two = await addChange(p, 'B', ['orders']);
    const three = await addChange(p, 'C', ['orders']);
    return { p, two, three };
  }

  it('counts an overlap line while its change is approved', async () => {
    const { p, two, three } = await setup();
    await approve(p, two);
    const hash = await stateHash(p, two.folderName);
    await overrideStackedOn(three, `${two.folderName} ${hash} overlap orders`);
    const vcs = await selectVcs(p.repo, p.config);
    assert.deepEqual(await awaitedDependencies(p.repo, p.config, vcs, three.folderPath), [
      { folder: two.folderName, hash, overlap: ['orders'] },
    ]);
  });

  it('counts an overlap line while its change is archived', async () => {
    const { p, two, three } = await setup();
    await approve(p, two);
    await archiveOnBranch(p, two);
    const hash = await stateHash(p, two.folderName);
    await overrideStackedOn(three, `${two.folderName} ${hash} overlap orders`);
    const vcs = await selectVcs(p.repo, p.config);
    assert.deepEqual(await awaitedDependencies(p.repo, p.config, vcs, three.folderPath), [
      { folder: two.folderName, hash, overlap: ['orders'] },
    ]);
  });

  it('keeps an overlap line whose change carries another hash and marks it reapproved', async () => {
    const { p, two, three } = await setup();
    await approve(p, two);
    await overrideStackedOn(three, `${two.folderName} sha256:elsewhere overlap orders`);
    const vcs = await selectVcs(p.repo, p.config);
    assert.deepEqual(await awaitedDependencies(p.repo, p.config, vcs, three.folderPath), [
      {
        folder: two.folderName,
        hash: 'sha256:elsewhere',
        overlap: ['orders'],
        reapproved: true,
      },
    ]);
  });

  it('drops an overlap line whose change is unapproved after a rejection', async () => {
    const { p, two, three } = await setup();
    await approve(p, two);
    await rejectOnBranch(p, two);
    const hash = await stateHash(p, two.folderName);
    await overrideStackedOn(three, `${two.folderName} ${hash} overlap orders`);
    const vcs = await selectVcs(p.repo, p.config);
    assert.deepEqual(await awaitedDependencies(p.repo, p.config, vcs, three.folderPath), []);
  });

  it('drops an overlap line whose change has landed', async () => {
    const { p, two, three } = await setup();
    await landOnMain(p, two);
    await overrideStackedOn(three, `${two.folderName} sha256:landed overlap orders`);
    const vcs = await selectVcs(p.repo, p.config);
    assert.deepEqual(await awaitedDependencies(p.repo, p.config, vcs, three.folderPath), []);
  });

  it('reads and writes both line forms', () => {
    const lines = '001-a aaa\n002-b bbb overlap billing,orders';
    assert.deepEqual(parseStackedOn(lines), [
      { folder: '001-a', hash: 'aaa' },
      { folder: '002-b', hash: 'bbb', overlap: ['billing', 'orders'] },
    ]);
    assert.equal(formatStackedOn(parseStackedOn(lines)), lines);
  });
});

describe('Approve a change that overlaps a running one', () => {
  it('prints which change it runs after and stacks it', async () => {
    const p = await newRepo();
    const one = await addChange(p, 'A', ['orders']);
    const two = await addChange(p, 'B', ['orders']);
    await approve(p, one);

    const out: string[] = [];
    await approveCommand([two.folderName], {
      cwd: p.repo,
      config: p.config,
      stdout: (text) => out.push(text),
      stderr: () => {},
      planningReaders: [],
    });

    const lines = out.join('').split('\n');
    const waiting = lines.indexOf(`  Waiting for: ${one.folderName}`);
    assert.ok(waiting >= 0, `missing Waiting for line:\n${out.join('')}`);
    assert.equal(lines[waiting + 1], `  Runs after ${one.folderName}, which also writes orders`);
    assert.match(lines[waiting + 2] ?? '', /^ {2}Stacked: /);
    assert.equal(
      await stackedOnLine(p, two),
      `${one.folderName} ${await stateHash(p, one.folderName)} overlap orders`,
    );
    assert.equal(await branchExists(p, worktreeBranch(two.folderName)), false);
  });

  it('carries the overlap in the approve result', async () => {
    const p = await newRepo();
    const one = await addChange(p, 'A', ['orders']);
    const two = await addChange(p, 'B', ['orders']);
    await approve(p, one);

    const result = await approveSpec(p.repo, two.folderName, p.config);
    assert.deepEqual(result.overlaps, [{ folder: one.folderName, capabilities: ['orders'] }]);
    assert.deepEqual(result.waitingFor, [one.folderName]);
  });
});

describe('Approve a change that shares no capability', () => {
  it('approves into a worktree and prints no waiting line', async () => {
    const p = await newRepo();
    const one = await addChange(p, 'A', ['orders']);
    const two = await addChange(p, 'B', ['billing']);
    await approve(p, one);

    const out: string[] = [];
    await approveCommand([two.folderName], {
      cwd: p.repo,
      config: p.config,
      stdout: (text) => out.push(text),
      stderr: () => {},
      planningReaders: [],
    });

    const text = out.join('');
    assert.ok(!text.includes('Waiting for'), text);
    assert.ok(!text.includes('Runs after'), text);
    assert.ok(text.includes(`  Branch: ${worktreeBranch(two.folderName)}`), text);
    assert.ok(await branchExists(p, worktreeBranch(two.folderName)));
  });
});
