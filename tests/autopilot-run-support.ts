import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAutopilotCommands } from '../src/cli/autopilot-commands.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { worktreePath } from '../src/core/vcs/worktree.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import type { AutopilotCommands } from '../src/watcher/autopilot.js';
import { installFakeValidator } from './helpers.js';
import { git, writeAt } from './recovery-support.js';

/**
 * The three-item queue every autopilot run test starts from: each item depends
 * on the one before, so the watcher must work them in order. The project is a
 * temporary git repository with `vcs.enabled`, the queue budgets and
 * `gates.autoRetries` 0, and a `node verify.cjs` verifier, exactly the shape
 * `tests/recovery-support.ts` builds for the recovery tests.
 */

/** One queue item and the change folder autopilot creates for it. */
export interface QueueItemSpec {
  readonly slug: string;
  readonly title: string;
  readonly change: string;
}

/** The three items, in order, each depending on the one before it. */
export const ITEMS: readonly QueueItemSpec[] = [
  { slug: 'alpha', title: 'Alpha item', change: '001-alpha' },
  { slug: 'beta', title: 'Beta item', change: '002-beta' },
  { slug: 'gamma', title: 'Gamma item', change: '003-gamma' },
];

const QUEUE_REL = path.posix.join('openspec', 'queue.md');

/** The queue file's text: three items, each depending on the one before. */
export function queueMarkdown(): string {
  return ITEMS.map((item, index) => {
    const depends = index === 0 ? 'nothing' : ITEMS[index - 1]?.slug;
    return [
      `## [${item.slug}] ${item.title}`,
      `Depends on: ${depends}`,
      '',
      `Brief body for ${item.slug}.`,
      '',
    ].join('\n');
  }).join('\n');
}

/** The verifier: red only when an existing `src/*.txt` holds `bad`. */
const VERIFY = `${[
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  "const dir = 'src';",
  'let bad = false;',
  'if (fs.existsSync(dir)) {',
  '  for (const name of fs.readdirSync(dir)) {',
  "    if (!name.endsWith('.txt')) continue;",
  "    if (fs.readFileSync(path.join(dir, name), 'utf8').includes('bad')) bad = true;",
  '  }',
  '}',
  'process.exit(bad ? 1 : 0);',
].join('\n')}\n`;

/** The config every autopilot project and its watcher build. */
export function autopilotConfig(worktreeRoot: string, enabled = true): OsqConfig {
  return defineConfig({
    harness: 'mock',
    vcs: { enabled: true, author: 'Osq <osq@example.invalid>', worktreeRoot },
    queue: { maxPlanningSessions: 100, maxPlanningCost: 100 },
    autopilot: { enabled },
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off', autoRetries: 0 },
  });
}

/** The fixture: its repo, its config, and the path helpers tests assert on. */
export interface AutopilotProject {
  readonly repo: string;
  readonly worktrees: string;
  readonly config: OsqConfig;
  /** The worktree change folder for one item's change, while it runs. */
  worktreeFolder(folder: string): string;
  /** The archived folder inside one item's worktree. */
  archivedFolder(folder: string): string;
}

async function commitSeed(repo: string): Promise<void> {
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);
}

/**
 * Build the temporary repository one autopilot test starts from: a committed
 * project whose `openspec/queue.md` holds the three ordered items. Nothing is
 * approved and no change folder exists yet.
 */
export async function createAutopilotProject(
  tmpDirs: string[],
  options: { enabled?: boolean } = {},
): Promise<AutopilotProject> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-autopilot-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, 'verify.cjs'), VERIFY, 'utf8');
  await writeAt(repo, 'src/seed.txt', 'seed\n');
  await writeAt(repo, QUEUE_REL, queueMarkdown());
  await commitSeed(repo);
  const config = autopilotConfig(worktrees, options.enabled ?? true);
  const vcs = config.vcs ?? { enabled: false };
  return {
    repo,
    worktrees,
    config,
    worktreeFolder: (folder) =>
      path.join(worktreePath(vcs, repo, folder), 'openspec', 'changes', folder),
    archivedFolder: (folder) =>
      path.join(worktreePath(vcs, repo, folder), 'openspec', 'changes', 'archive', folder),
  };
}

/** The port `osq watch` builds, with the test's planner adapter and seams. */
export function autopilotCommands(
  project: AutopilotProject,
  planner: HarnessAdapter,
): AutopilotCommands {
  return createAutopilotCommands(project.repo, project.config, {
    adapter: planner,
    planningReaders: [],
    allowStale: true,
  });
}

/**
 * A planner adapter that writes a lint-green plan: it replaces the template's
 * sentinel verify in `proposal.md` and `tasks/1.md` with `node verify.cjs` and
 * scopes the single task to `src/<queue item slug>.txt`, as `scratchPlanner` in
 * `tests/plan-run-worker.test.ts` writes plan files.
 */
export class AutopilotPlanner implements HarnessAdapter {
  readonly name = 'autopilot-planner';
  readonly calls: SpawnTaskOptions[] = [];

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    const brief = await fs.readFile(path.join(options.specFolderPath, 'brief.md'), 'utf8');
    const slug = String(parseFrontmatter(brief).data.queue_item ?? 'item');
    const proposalPath = path.join(options.specFolderPath, 'proposal.md');
    await fs.writeFile(
      proposalPath,
      (await fs.readFile(proposalPath, 'utf8')).replace(/^verify:.*$/m, 'verify: node verify.cjs'),
      'utf8',
    );
    const taskPath = path.join(options.specFolderPath, 'tasks', '1.md');
    const task = (await fs.readFile(taskPath, 'utf8'))
      .replace(/^verify:.*$/m, 'verify: node verify.cjs')
      .replace(/^scope:.*$/m, `scope: ["src/${slug}.txt"]`);
    await fs.writeFile(taskPath, task, 'utf8');
    return { exitCode: 0 };
  }
}

/**
 * A planner adapter that leaves the plan lint-red: it keeps the sentinel verify
 * while changing bytes, so the outcome is `lint_red`.
 */
export class LintRedPlanner implements HarnessAdapter {
  readonly name = 'lint-red-planner';
  readonly calls: SpawnTaskOptions[] = [];

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    const taskPath = path.join(options.specFolderPath, 'tasks', '1.md');
    const task = await fs.readFile(taskPath, 'utf8');
    await fs.writeFile(
      taskPath,
      task.replace('Acceptance criterion 1', 'still does the thing'),
      'utf8',
    );
    return { exitCode: 0 };
  }
}

/** A port that records every call and resolves, for "no command runs" checks. */
export interface RecordingCommands extends AutopilotCommands {
  readonly calls: string[];
}

export function recordingCommands(): RecordingCommands {
  const calls: string[] = [];
  return {
    calls,
    planNext: async () => {
      calls.push('plan-next');
    },
    plan: async (id) => {
      calls.push(`plan ${id}`);
    },
    approve: async (id) => {
      calls.push(`approve ${id}`);
    },
    land: async (id) => {
      calls.push(`land ${id}`);
    },
  };
}
