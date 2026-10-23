import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scenario } from '@matteeh/osq/testing';
import { runWatcherOnce } from '../src/watcher/loop.js';
import {
  ScriptedAdapter,
  assertOk,
  commitMain,
  createRecoveryProject,
  exists,
  subjects,
} from './recovery-support.js';

const CHANGE_SLUG = '316-sync-before-retry';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMP_PREFIX = 'osq-retry-sync-lookup-';

const tmpDirs: string[] = [];
let lookupRoot: string | undefined;
let previousChange: string | undefined;

/** Rename every repeated scenario header after its first, for a clean lookup root. */
function dedupeScenarioNames(content: string): string {
  const seen = new Set<string>();
  return content
    .split('\n')
    .map((line) => {
      const match = /^#### Scenario: (.+)$/.exec(line);
      if (match === null) return line;
      const name = match[1] ?? '';
      if (!seen.has(name)) {
        seen.add(name);
        return line;
      }
      return `#### Scenario: ${name} (variant)`;
    })
    .join('\n');
}

/**
 * Point scenario lookup at a copy of the living spec whose repeated scenario
 * names are made unique, merged with this change's real delta.
 */
async function makeLookupRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  const openspec = path.join(root, 'openspec');
  const specDir = path.join(openspec, 'specs', 'watcher-and-harness');
  await fs.mkdir(specDir, { recursive: true });
  const living = await fs.readFile(
    path.join(REPO_ROOT, 'openspec', 'specs', 'watcher-and-harness', 'spec.md'),
    'utf8',
  );
  await fs.writeFile(path.join(specDir, 'spec.md'), dedupeScenarioNames(living), 'utf8');
  const deltaDir = path.join(openspec, 'changes', CHANGE_SLUG, 'specs', 'watcher-and-harness');
  await fs.mkdir(deltaDir, { recursive: true });
  const deltaSource = path.join(
    REPO_ROOT,
    'openspec',
    'changes',
    CHANGE_SLUG,
    'specs',
    'watcher-and-harness',
    'spec.md',
  );
  if (await exists(deltaSource)) {
    await fs.copyFile(deltaSource, path.join(deltaDir, 'spec.md'));
  }
  return path.join(openspec, 'changes', CHANGE_SLUG);
}

before(async () => {
  previousChange = process.env.OSQ_CHANGE;
  lookupRoot = await makeLookupRoot();
  process.env.OSQ_CHANGE = lookupRoot;
});

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

after(async () => {
  if (previousChange === undefined) Reflect.deleteProperty(process.env, 'OSQ_CHANGE');
  else process.env.OSQ_CHANGE = previousChange;
  if (lookupRoot !== undefined) {
    await fs.rm(lookupRoot, { recursive: true, force: true });
  }
});

const TASKS = [
  { title: 'First task', scope: 'src/one.txt' },
  { title: 'Second task', scope: 'src/two.txt' },
];

scenario(
  'watcher-and-harness',
  'Sync before a retried attempt',
  { covers: runWatcherOnce },
  async ({ run, each }) => {
    await each(
      "task 2's second attempt reads `src/tool.txt` as `fixed\\n`, the branch's subjects after `osq: <id> task 1 verified` are, in order, `osq: <id> task 2 dead, reason verify_red`, `osq: <id> sync main`, `osq: <id> task 2 verified` and `osq: <id> archived`, and the archived folder holds `.run/done/2`",
      async (row) => {
        const autoRetries = Number.parseInt(row['gates.autoRetries'] ?? '', 10);
        const project = await createRecoveryProject(tmpDirs, {
          tasks: TASKS,
          files: { 'src/tool.txt': 'broken\n' },
          autoRetries,
        });
        assertOk(await project.approve(), 'approve');

        const reads: string[] = [];
        const adapter = new ScriptedAdapter(async (options, call) => {
          if (options.taskNumber === '1') return 'one\n';
          // An automatic retry runs inside the same `watchOnce`, so main has to
          // move during the first attempt for the second one to see the fix.
          if (call === 2) await commitMain(project.repo, { 'src/tool.txt': 'fixed\n' });
          const tool = await fs.readFile(path.join(options.projectRoot, 'src', 'tool.txt'), 'utf8');
          reads.push(tool);
          return tool === 'fixed\n' ? 'good\n' : 'bad\n';
        });

        await run(project.repo, project.config, adapter);
        if (row.Retry !== 'automatic') {
          assertOk(await project.retry('2'), 'retry');
          await run(project.repo, project.config, adapter);
        }

        assert.equal(reads.length, 2);
        assert.equal(reads[0], 'broken\n');
        assert.equal(reads[1], 'fixed\n');

        // Only osq's own transitions: a merge also brings the default branch's
        // commit into the worktree's history.
        const log = (await subjects(project.worktree)).filter((subject) =>
          subject.startsWith('osq: '),
        );
        const taskOneVerified = log.indexOf('osq: 001 task 1 verified');
        assert.notEqual(taskOneVerified, -1, `no task 1 commit in: ${log.join(' | ')}`);
        assert.deepEqual(log.slice(0, taskOneVerified).reverse(), [
          'osq: 001 task 2 dead, reason verify_red',
          'osq: 001 sync main',
          'osq: 001 task 2 verified',
          'osq: 001 archived',
        ]);
        assert.equal(await exists(path.join(project.archivedFolder, '.run', 'done', '2')), true);
      },
    );
  },
);

scenario(
  'watcher-and-harness',
  'Sync stop before a retried attempt',
  { covers: runWatcherOnce },
  async ({ run, then }) => {
    const project = await createRecoveryProject(tmpDirs, {
      tasks: TASKS,
      files: { 'src/tool.txt': 'broken\n' },
      autoRetries: 1,
    });
    assertOk(await project.approve(), 'approve');

    const adapter = new ScriptedAdapter(async (options, call) => {
      if (options.taskNumber === '1') return 'one\n';
      // Main rewrites the file task 1 wrote, so the sync before the retry
      // conflicts and the second attempt never spawns.
      if (call === 2) await commitMain(project.repo, { 'src/one.txt': 'main\n' });
      return 'bad\n';
    });

    await run(project.repo, project.config, adapter);

    await then(
      '`.run/regressed/change.md` has reason `sync_conflict` and names that file, task 2 spawned once, and later cycles spawn nothing for the change',
      async () => {
        const markerPath = path.join(project.changeFolder, '.run', 'regressed', 'change.md');
        assert.equal(await exists(markerPath), true);
        const marker = await fs.readFile(markerPath, 'utf8');
        assert.match(marker, /reason: sync_conflict/);
        assert.match(marker, /src\/one\.txt/);

        const spawns = adapter.calls.length;
        assert.equal(adapter.calls.filter((call) => call.taskNumber === '2').length, 1);
        await run(project.repo, project.config, adapter);
        assert.equal(adapter.calls.length, spawns);
      },
    );
  },
);
