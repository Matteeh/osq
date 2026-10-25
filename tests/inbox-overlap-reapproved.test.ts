import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { scenario } from '@matteeh/osq/testing';
import { inboxCommand } from '../src/cli/inbox.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { readInbox } from '../src/core/status/inbox-projection.js';
import { formatInboxText } from '../src/core/status/inbox.js';
import { worktreeBranch, worktreePath } from '../src/core/vcs/worktree.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);

const CHANGES = path.join('openspec', 'changes');
const ARCHIVE = path.join('openspec', 'changes', 'archive');
const IN_SCOPE = 'src/one.txt';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENARIO_HEADER = '#### Scenario: Overlap approved again in the inbox';
const TEMP_PREFIX = 'osq-inbox-overlap-reapproved-lookup-';

const tmpDirs: string[] = [];
let lookupRoot: string | undefined;
let previousChange: string | undefined;

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

after(async () => {
  if (previousChange === undefined) Reflect.deleteProperty(process.env, 'OSQ_CHANGE');
  else process.env.OSQ_CHANGE = previousChange;
  if (lookupRoot !== undefined) await fs.rm(lookupRoot, { recursive: true, force: true });
});

/** The spec table wraps a cell's text in backticks; read what is inside. */
function cellText(cell: string): string {
  return cell.startsWith('`') && cell.endsWith('`') ? cell.slice(1, -1) : cell;
}

/** The needs-you object a spec cell writes with unquoted keys, or null for none. */
function parseItemCell(cell: string): Record<string, unknown> | null {
  if (cell === 'none') return null;
  return JSON.parse(cell.replace(/([{,]\s*)([A-Za-z][A-Za-z0-9_]*)\s*:/g, '$1"$2":')) as Record<
    string,
    unknown
  >;
}

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

/** The change folder whose status delta defines this test's scenario. */
async function deltaFolder(): Promise<string | undefined> {
  const fromEnv = process.env.OSQ_CHANGE?.trim();
  if (fromEnv !== undefined && fromEnv !== '') return path.resolve(process.cwd(), fromEnv);
  const changesDir = path.join(REPO_ROOT, 'openspec', 'changes');
  const folders: string[] = [];
  for (const entry of await fs.readdir(changesDir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'archive') {
      const archiveDir = path.join(changesDir, 'archive');
      for (const archived of await fs
        .readdir(archiveDir, { withFileTypes: true })
        .catch(() => [])) {
        if (archived.isDirectory()) folders.push(path.join(archiveDir, archived.name));
      }
    } else {
      folders.push(path.join(changesDir, entry.name));
    }
  }
  for (const folder of folders) {
    const content = await fs
      .readFile(path.join(folder, 'specs', 'status-inspection', 'spec.md'), 'utf8')
      .catch(() => '');
    if (content.includes(SCENARIO_HEADER)) return folder;
  }
  return undefined;
}

/** Point scenario lookup at a deduped living spec merged with this change's delta. */
async function makeLookupRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  const openspec = path.join(root, 'openspec');
  const specDir = path.join(openspec, 'specs', 'status-inspection');
  await fs.mkdir(specDir, { recursive: true });
  const living = await fs.readFile(
    path.join(REPO_ROOT, 'openspec', 'specs', 'status-inspection', 'spec.md'),
    'utf8',
  );
  await fs.writeFile(path.join(specDir, 'spec.md'), dedupeScenarioNames(living), 'utf8');

  const active = await deltaFolder();
  const name = active === undefined ? 'lookup' : path.basename(active);
  if (active !== undefined) {
    const deltaDir = path.join(openspec, 'changes', name, 'specs', 'status-inspection');
    await fs.mkdir(deltaDir, { recursive: true });
    await fs.copyFile(
      path.join(active, 'specs', 'status-inspection', 'spec.md'),
      path.join(deltaDir, 'spec.md'),
    );
  }
  return path.join(openspec, 'changes', name);
}

before(async () => {
  previousChange = process.env.OSQ_CHANGE;
  lookupRoot = await makeLookupRoot();
  process.env.OSQ_CHANGE = lookupRoot;
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

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly caps: readonly string[];
}

const ONE: ChangeDef = { folder: '001-a', title: 'One', caps: ['orders'] };
const TWO: ChangeDef = { folder: '002-b', title: 'Two', caps: ['orders'] };

function deltaSpec(capability: string): string {
  return [
    `# Spec Delta: ${capability}`,
    '',
    '## Purpose',
    '',
    `The ${capability} capability for the test.`,
    '',
    '## ADDED Requirements',
    '',
    `### Requirement: ${capability} works`,
    '',
    `The ${capability} capability SHALL work.`,
    '',
    `#### Scenario: ${capability} runs`,
    '- **WHEN** it runs',
    '- **THEN** it works',
    '',
  ].join('\n');
}

function proposalMarkdown(change: ChangeDef): string {
  return [
    '---',
    `title: ${change.title}`,
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Run the task.',
    '',
    '## Surface',
    'None.',
    '',
    '## Human steps',
    'None',
    '',
  ].join('\n');
}

function taskMarkdown(change: ChangeDef): string {
  return [
    '---',
    `title: ${change.title} task`,
    'verify: node verify.cjs',
    `scope: ${JSON.stringify([IN_SCOPE])}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

async function writeChange(folderPath: string, change: ChangeDef): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown(change), 'utf8');
  await fs.writeFile(
    path.join(folderPath, 'tasks.md'),
    `# Tasks\n\n- [ ] 1. ${change.title}\n`,
    'utf8',
  );
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMarkdown(change), 'utf8');
  for (const capability of change.caps) {
    const dir = path.join(folderPath, 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), deltaSpec(capability), 'utf8');
  }
}

interface Project {
  readonly root: string;
  readonly repo: string;
  readonly worktrees: string;
  readonly config: OsqConfig;
  readonly vcs: VcsConfig;
}

async function makeProject(changes: readonly ChangeDef[]): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-overlap-reapproved-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, IN_SCOPE), 'seed\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  for (const change of changes) {
    await writeChange(path.join(repo, CHANGES, change.folder), change);
  }

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off', autoRetries: 0 },
  });
  return { root, repo, worktrees, config, vcs };
}

/** Approve `folder` into its worktree. */
async function approveIntoWorktree(project: Project, folder: string): Promise<void> {
  const result = await approveSpec(project.repo, folder, project.config);
  assert.ok(result.worktreePath, `expected a worktree for ${folder}`);
}

/** Move a freshly approved change into its branch's archive directory. */
async function archiveOnBranch(project: Project, folder: string): Promise<void> {
  const wtPath = worktreePath(project.vcs, project.repo, folder);
  await fs.mkdir(path.join(wtPath, ARCHIVE), { recursive: true });
  await git(['mv', path.join(CHANGES, folder), path.join(ARCHIVE, folder)], wtPath);
  await git(['commit', '-qm', `archive ${folder}`], wtPath);
}

/** Squash-merge a change's archived branch onto `main`. */
async function landOnMain(project: Project, folder: string): Promise<void> {
  await git(['merge', '--squash', worktreeBranch(folder)], project.repo);
  await git(['commit', '-qm', `land ${folder}`], project.repo);
}

/** Give an approved change a different approved hash at its branch tip. */
async function reapproveHash(project: Project, folder: string): Promise<void> {
  const wtPath = worktreePath(project.vcs, project.repo, folder);
  await fs.writeFile(
    path.join(wtPath, CHANGES, folder, '.run', 'approved'),
    'sha256:changed\n',
    'utf8',
  );
  await git(['add', '-A'], wtPath);
  await git(['commit', '-qm', `reapprove ${folder}`], wtPath);
}

/** The `osq --json` needs-you items that name an overlap approved again. */
async function jsonOverlapItems(project: Project, home: string): Promise<unknown[]> {
  const out: string[] = [];
  await inboxCommand({
    cwd: project.repo,
    config: project.config,
    home,
    json: true,
    stdout: (text) => out.push(text),
    stderr: () => {},
  });
  const parsed = JSON.parse(out.join('')) as {
    needsYou: { kind: string; overlapReapproved?: unknown }[];
  };
  return parsed.needsYou.filter((item) => item.kind === 'overlap-reapproved');
}

/** The text inbox lines from `osq`, for a home root with its own cursor. */
async function textInboxLines(project: Project, home: string): Promise<string[]> {
  const out: string[] = [];
  await inboxCommand({
    cwd: project.repo,
    config: project.config,
    home,
    stdout: (text) => out.push(text),
    stderr: () => {},
  });
  return out.join('').split('\n');
}

scenario(
  'status-inspection',
  'Overlap approved again in the inbox',
  { covers: readInbox },
  async ({ run, each }) => {
    const project = await makeProject([ONE, TWO]);
    const home = path.join(project.root, 'home');
    await approveIntoWorktree(project, ONE.folder);
    await approveSpec(project.repo, TWO.folder, project.config);

    await each('`osq --json` and the text inbox hold what the row says:', async (row) => {
      const state = cellText(row['`001-a`']);
      if (state === 'approved with another hash') await reapproveHash(project, ONE.folder);
      else if (state === 'landed') {
        await archiveOnBranch(project, ONE.folder);
        await landOnMain(project, ONE.folder);
      }

      const expected = parseItemCell(cellText(row['needs-you item for `002`']));
      const wanted = expected === null ? [] : [expected];
      const inbox = await run(project.repo, { config: project.config, home });
      assert.deepEqual(
        inbox.needsYou.filter((item) => item.kind === 'overlap-reapproved'),
        wanted,
      );

      const textRow = cellText(row['text row']);
      const rendered = formatInboxText(inbox).split('\n');
      if (textRow === 'none') {
        assert.equal(
          rendered.some((line) => line.includes('approved again since')),
          false,
        );
      } else {
        assert.ok(rendered.includes(textRow), formatInboxText(inbox));
      }

      assert.deepEqual(await jsonOverlapItems(project, home), wanted);
      const lines = await textInboxLines(project, home);
      if (textRow === 'none') {
        assert.equal(
          lines.some((line) => line.includes('approved again since')),
          false,
        );
      } else {
        assert.ok(lines.includes(textRow), lines.join('\n'));
      }
    });
  },
);
