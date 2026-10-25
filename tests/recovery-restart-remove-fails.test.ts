import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scenario } from '@matteeh/osq/testing';
import {
  type CommandResult,
  type RecoveryProject,
  ScriptedAdapter,
  assertOk,
  commitMain,
  createRecoveryProject,
  git,
  reviseTask,
} from './recovery-support.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENARIO_HEADER = '#### Scenario: Worktree removal fails during a restart';
const CAPABILITY = 'spec-lint-and-approve';

const tmpDirs: string[] = [];
let lookupRoot: string | undefined;
let previousChange: string | undefined;

/** Rename every repeated scenario header but its last, so lookup accepts the living copy. */
function dedupeScenarioNames(content: string): string {
  const lines = content.split('\n');
  const total = new Map<string, number>();
  for (const line of lines) {
    const match = /^(####\s+(?:Scenario:\s*)?)(.*)$/.exec(line);
    if (match !== null) {
      const name = (match[2] ?? '').trim();
      total.set(name, (total.get(name) ?? 0) + 1);
    }
  }
  const seen = new Map<string, number>();
  return lines
    .map((line) => {
      const match = /^(####\s+(?:Scenario:\s*)?)(.*)$/.exec(line);
      if (match === null) return line;
      const name = (match[2] ?? '').trim();
      const count = (seen.get(name) ?? 0) + 1;
      seen.set(name, count);
      return count === total.get(name) ? line : `${match[1]}${name} (${count})`;
    })
    .join('\n');
}

/** Whether `target` exists. */
async function exists(target: string): Promise<boolean> {
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

/** The active change folder whose delta defines this test's scenario. */
async function deltaFolder(): Promise<string | undefined> {
  const raw = process.env.OSQ_CHANGE?.trim();
  if (raw !== undefined && raw.length > 0) {
    const fromEnv = path.resolve(REPO_ROOT, raw);
    if (await exists(path.join(fromEnv, 'specs', CAPABILITY, 'spec.md'))) return fromEnv;
  }
  const changesDir = path.join(REPO_ROOT, 'openspec', 'changes');
  for (const entry of await fs.readdir(changesDir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name === 'archive') continue;
    const deltaPath = path.join(changesDir, entry.name, 'specs', CAPABILITY, 'spec.md');
    const content = await fs.readFile(deltaPath, 'utf8').catch(() => '');
    if (content.includes(SCENARIO_HEADER)) return path.join(changesDir, entry.name);
  }
  return undefined;
}

/**
 * Point scenario lookup at a copy of the living spec whose repeated scenario
 * names are made unique, merged with this change's delta while it exists.
 */
async function makeLookupRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-restart-remove-lookup-'));
  lookupRoot = root;
  const openspec = path.join(root, 'openspec');
  const specDir = path.join(openspec, 'specs', CAPABILITY);
  await fs.mkdir(specDir, { recursive: true });
  const living = await fs.readFile(
    path.join(REPO_ROOT, 'openspec', 'specs', CAPABILITY, 'spec.md'),
    'utf8',
  );
  await fs.writeFile(path.join(specDir, 'spec.md'), dedupeScenarioNames(living), 'utf8');

  const changeFolder = path.join(openspec, 'changes', 'lookup');
  const active = await deltaFolder();
  if (active !== undefined) {
    const deltaDir = path.join(changeFolder, 'specs', CAPABILITY);
    await fs.mkdir(deltaDir, { recursive: true });
    await fs.copyFile(
      path.join(active, 'specs', CAPABILITY, 'spec.md'),
      path.join(deltaDir, 'spec.md'),
    );
  }
  return changeFolder;
}

before(async () => {
  previousChange = process.env.OSQ_CHANGE;
  process.env.OSQ_CHANGE = await makeLookupRoot();
});

after(async () => {
  if (previousChange === undefined) Reflect.deleteProperty(process.env, 'OSQ_CHANGE');
  else process.env.OSQ_CHANGE = previousChange;
  if (lookupRoot !== undefined) await fs.rm(lookupRoot, { recursive: true, force: true });
});

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

/** The covered command: one approval of the recovery project's change. */
function approve(project: RecoveryProject): Promise<CommandResult> {
  return project.approve();
}

scenario(
  'spec-lint-and-approve',
  'Worktree removal fails during a restart',
  { covers: approve },
  async ({ run, then }) => {
    const project = await createRecoveryProject(tmpDirs, {
      tasks: [{ title: 'First task', scope: 'src/one.txt' }],
      autoRetries: 0,
    });

    assertOk(await project.approve(), 'approve');
    const adapter = new ScriptedAdapter(async (_options, call) => {
      if (call === 1) {
        await commitMain(project.repo, { 'src/one.txt': 'main\n' });
        return 'task\n';
      }
      return 'main\ntask\n';
    });
    await project.watchOnce(adapter);
    assert.equal(adapter.calls.length, 1);

    await reviseTask(project.changeFolder, 1, { title: 'First task', scope: 'src/one.txt' });
    const regressed = path.join(project.changeFolder, '.run', 'regressed', 'change.md');
    const markerBefore = await fs.readFile(regressed, 'utf8');

    // git refuses to remove a locked worktree, which makes the restart stop.
    await git(['worktree', 'lock', project.worktree], project.repo);
    const failed = await run(project);
    const markerAfter = await fs.readFile(regressed, 'utf8');
    const branchesAfterFailure = await git(['branch', '--list'], project.repo);

    await git(['worktree', 'unlock', project.worktree], project.repo);
    const second = await run(project);
    const branchesAfterRestart = await git(['branch', '--list'], project.repo);

    await then(
      "it exits 1 with an error naming the worktree's path, `cannot remove a locked working tree`, `run git worktree prune` and `restart osq watch`, `.run/regressed/change.md` is byte for byte what it was, `osq/<folder>` still exists and no `osq/<folder>-restarted-1` does; after `git worktree unlock`, a second `osq approve <id>` exits 0 and prints `Restarted from main; kept the old branch as osq/<folder>-restarted-1`",
      async () => {
        assert.equal(
          failed.exitCode,
          1,
          `first approve exited ${failed.exitCode}\nstdout:\n${failed.stdout}\nstderr:\n${failed.stderr}`,
        );
        assert.ok(failed.stderr.includes(project.worktree), failed.stderr);
        assert.ok(failed.stderr.includes('cannot remove a locked working tree'), failed.stderr);
        assert.ok(failed.stderr.includes('run git worktree prune'), failed.stderr);
        assert.ok(failed.stderr.includes('restart osq watch'), failed.stderr);

        assert.equal(markerAfter, markerBefore);
        assert.match(branchesAfterFailure, /osq\/001-order-flow/);
        assert.doesNotMatch(branchesAfterFailure, /001-order-flow-restarted-1/);

        assert.equal(
          second.exitCode,
          0,
          `second approve exited ${second.exitCode}\nstdout:\n${second.stdout}\nstderr:\n${second.stderr}`,
        );
        assert.match(
          second.stdout,
          /Restarted from main; kept the old branch as osq\/001-order-flow-restarted-1/,
        );
        assert.match(branchesAfterRestart, /001-order-flow-restarted-1/);
      },
    );
  },
);
