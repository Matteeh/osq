import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { showCommand } from '../src/cli/show.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { readDependencyState } from '../src/core/spec/stack-dependencies.js';
import { selectVcs } from '../src/core/vcs/select.js';
import { worktreePath } from '../src/core/vcs/worktree.js';

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
  config: OsqConfig;
  vcs: VcsConfig;
}

/** A committed temp repository with no change folders yet. */
async function newRepo(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-show-runs-after-'));
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
  return { root, repo, config: defineConfig({ vcs }), vcs };
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

/** Approve a change into its worktree. */
async function approve(p: Project, change: Change): Promise<void> {
  const result = await approveSpec(p.repo, change.folderName, p.config);
  assert.ok(result.worktreePath, `expected a worktree for ${change.folderName}`);
}

/** Land an approved change by putting its worktree folder in main's archive. */
async function landApproved(p: Project, change: Change): Promise<void> {
  const wtPath = worktreePath(p.vcs, p.repo, change.folderName);
  const source = path.join(wtPath, 'openspec', 'changes', change.folderName);
  const archive = path.join(p.repo, 'openspec', 'changes', 'archive', change.folderName);
  await fs.mkdir(path.dirname(archive), { recursive: true });
  await fs.cp(source, archive, { recursive: true });
  await git(['add', '-A'], p.repo);
  await git(['commit', '-qm', `land ${change.folderName}`], p.repo);
}

/** Run `osq show <id>` and return its stdout text. */
async function showText(p: Project, id: string): Promise<string> {
  const out: string[] = [];
  await showCommand(id, {
    cwd: p.repo,
    config: p.config,
    stdout: (text) => out.push(text),
    stderr: () => {},
  });
  return out.join('');
}

/** Run `osq show <id> --json` and parse its stdout. */
async function showJson(p: Project, id: string): Promise<Record<string, unknown>> {
  const out: string[] = [];
  await showCommand(id, {
    cwd: p.repo,
    config: p.config,
    json: true,
    stdout: (text) => out.push(text),
    stderr: () => {},
  });
  return JSON.parse(out.join(''));
}

/** The line directly after `Depends on:`, or null when there is none. */
function lineAfterDependsOn(text: string): string | null {
  const lines = text.split('\n');
  const index = lines.findIndex((line) => line.startsWith('Depends on:'));
  assert.ok(index >= 0, 'show output should carry a Depends on: line');
  return lines[index + 1] ?? null;
}

describe('Show a change that runs after another', () => {
  it('prints an overlap line after Depends on for a draft', async () => {
    const p = await newRepo();
    const one = await addChange(p, 'A', ['orders']);
    await addChange(p, 'B', ['orders']);
    await approve(p, one);

    const text = await showText(p, '002');
    assert.equal(lineAfterDependsOn(text), 'Runs after: 001-a (also writes orders)');
  });

  it('prints an overlap line for a change approved and stacked', async () => {
    const p = await newRepo();
    const one = await addChange(p, 'A', ['orders']);
    const two = await addChange(p, 'B', ['orders']);
    await approve(p, one);
    await approveSpec(p.repo, two.folderName, p.config);

    const text = await showText(p, '002');
    assert.equal(lineAfterDependsOn(text), 'Runs after: 001-a (also writes orders)');
  });

  it('prints a depends_on line for a declared dependency', async () => {
    const p = await newRepo();
    const one = await addChange(p, 'A', ['orders']);
    await addChange(p, 'B', ['billing'], ['001']);
    await approve(p, one);

    const text = await showText(p, '002');
    assert.equal(lineAfterDependsOn(text), 'Runs after: 001-a (depends_on)');
  });

  it('prints no Runs after line when it shares no capability', async () => {
    const p = await newRepo();
    const one = await addChange(p, 'A', ['orders']);
    await addChange(p, 'B', ['billing']);
    await approve(p, one);

    const text = await showText(p, '002');
    assert.equal(text.includes('Runs after:'), false);
  });
});

describe('Runs after in show JSON', () => {
  it('carries runsAfter while the overlapped change waits, and none after it lands', async () => {
    const p = await newRepo();
    const one = await addChange(p, 'A', ['orders']);
    const two = await addChange(p, 'B', ['orders']);
    await approve(p, one);
    await approveSpec(p.repo, two.folderName, p.config);

    const stacked = await showJson(p, '002');
    assert.deepEqual(stacked.runsAfter, [{ folder: '001-a', capabilities: ['orders'] }]);

    await landApproved(p, one);
    const vcs = await selectVcs(p.repo, p.config);
    assert.equal(
      (await readDependencyState(p.repo, p.config, vcs, one.folderName)).state,
      'landed',
    );

    const landed = await showJson(p, '002');
    assert.equal('runsAfter' in landed, false);
  });
});
