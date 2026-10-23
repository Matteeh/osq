import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scenario } from '@matteeh/osq/testing';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { findOwnFolderLines } from '../src/watcher/own-folder-gate.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const FOLDER = '042-alpha';
const SCOPE_FILE = 'tests/slug.test.ts';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENARIO_HEADER = '#### Scenario: Own folder lines';
const OWN_FOLDER_MARKER = `---\nreason: own_folder_path\n---\nThese files name this change's folder, ${FOLDER}, whose path changes when the change archives:\n- ${SCOPE_FILE}:1\nReach the change folder through the OSQ_CHANGE environment variable.\n`;
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;
const TASKS_MD = `# Tasks

- [ ] 1. When a task names its own folder, the watcher kills it
`;

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

/** The active change folder whose watcher delta defines this test's scenarios. */
async function deltaFolder(): Promise<string | undefined> {
  const changesDir = path.join(REPO_ROOT, 'openspec', 'changes');
  const entries = await fs.readdir(changesDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'archive') continue;
    const deltaPath = path.join(changesDir, entry.name, 'specs', 'watcher-and-harness', 'spec.md');
    const content = await fs.readFile(deltaPath, 'utf8').catch(() => '');
    if (content.includes(SCENARIO_HEADER)) return entry.name;
  }
  return undefined;
}

/**
 * Point scenario lookup at a copy of the living spec whose repeated scenario
 * names are made unique, merged with this change's real delta while it exists.
 * The living spec itself is never touched.
 */
async function makeLookupRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-own-folder-lookup-'));
  const openspec = path.join(root, 'openspec');
  const specDir = path.join(openspec, 'specs', 'watcher-and-harness');
  await fs.mkdir(specDir, { recursive: true });
  const living = await fs.readFile(
    path.join(REPO_ROOT, 'openspec', 'specs', 'watcher-and-harness', 'spec.md'),
    'utf8',
  );
  await fs.writeFile(path.join(specDir, 'spec.md'), dedupeScenarioNames(living), 'utf8');

  const active = await deltaFolder();
  if (active === undefined) return path.join(openspec, 'changes', 'lookup');
  const deltaDir = path.join(openspec, 'changes', active, 'specs', 'watcher-and-harness');
  await fs.mkdir(deltaDir, { recursive: true });
  await fs.copyFile(
    path.join(REPO_ROOT, 'openspec', 'changes', active, 'specs', 'watcher-and-harness', 'spec.md'),
    path.join(deltaDir, 'spec.md'),
  );
  return path.join(openspec, 'changes', active);
}

before(async () => {
  previousChange = process.env.OSQ_CHANGE;
  lookupRoot = await makeLookupRoot();
  process.env.OSQ_CHANGE = lookupRoot;
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

/** A scenario-table cell without its surrounding markdown code ticks. */
function cellText(cell: string): string {
  return cell.startsWith('`') && cell.endsWith('`') ? cell.slice(1, -1) : cell;
}

/** The spec writes newlines in table cells as `\n` escapes. */
function unescapeCell(cell: string): string {
  return cellText(cell).replace(/\\n/g, '\n');
}

/** The marker bytes left after the inserted fingerprint line is removed. */
function withoutFingerprint(content: string): string {
  return content.replace(/^fingerprint: .*\n/m, '');
}

async function exists(target: string): Promise<boolean> {
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

interface ParsedEvent {
  readonly type: string;
  readonly data?: Record<string, unknown>;
}

async function readEvents(specFolder: string): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(specFolder, '.run', 'events', '1.jsonl'), 'utf8')
    .catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

function proposalFor(): string {
  return `---
title: Own folder gate
depends_on: []
verify: node verify.cjs
features:
  reads: []
---
## Goal

Kill a task whose files name its own change folder.

## Surface

None.
`;
}

function taskFor(): string {
  return `---
title: When a task names its own folder, the watcher kills it
verify: node verify.cjs
scope: [${SCOPE_FILE}]
entry: []
skills: []
---
## Acceptance

- [ ] the gate kills the task
`;
}

/** An approved fixture project whose change folder is `042-alpha`. */
async function makeProject(): Promise<{ root: string; specFolder: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-own-folder-gate-'));
  tmpDirs.push(root);
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');

  const specFolder = path.join(root, 'openspec', 'changes', FOLDER);
  await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(specFolder, 'proposal.md'), proposalFor(), 'utf8');
  await fs.writeFile(path.join(specFolder, 'tasks.md'), TASKS_MD, 'utf8');
  await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), taskFor(), 'utf8');
  await approveSpec(root, '042', DEFAULT_CONFIG);
  return { root, specFolder };
}

/** Fake adapter that writes the row's content into the task's one scope file. */
class SlugAdapter implements HarnessAdapter {
  readonly name = 'slug';

  constructor(private readonly content: string) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await fs.mkdir(path.join(options.projectRoot, 'tests'), { recursive: true });
    await fs.writeFile(path.join(options.projectRoot, SCOPE_FILE), this.content, 'utf8');
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

scenario(
  'watcher-and-harness',
  'Own folder lines',
  { covers: findOwnFolderLines },
  ({ run, each }) => {
    each("it gives the row's line numbers:", (row) => {
      const text = unescapeCell(row.Text ?? '');
      const expected =
        row.Lines === 'none'
          ? []
          : (row.Lines ?? '')
              .split(',')
              .map((part) => Number.parseInt(part.trim(), 10))
              .sort((a, b) => a - b);
      assert.deepEqual(run(text, FOLDER), expected);
    });
  },
);

scenario(
  'watcher-and-harness',
  'Task naming its own folder dies',
  { covers: runTask },
  async ({ run, each }) => {
    await each(
      "the task ends as the row says; a dead task has `.run/dead/1.md` equal to `---\\nreason: own_folder_path\\n---\\nThese files name this change's folder, 042-alpha, whose path changes when the change archives:\\n- tests/slug.test.ts:1\\nReach the change folder through the OSQ_CHANGE environment variable.\\n`, a `dead` event with reason `own_folder_path`, and no `.run/done/1`",
      async (row) => {
        const { root, specFolder } = await makeProject();
        const content = unescapeCell(row.Content ?? '');
        const result = await run(root, specFolder, '1', DEFAULT_CONFIG, new SlugAdapter(content));

        if (row.Outcome === 'dead') {
          assert.equal(result.success, false);
          assert.equal(result.reason, 'own_folder_path');

          const marker = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
          assert.equal(withoutFingerprint(marker), OWN_FOLDER_MARKER);

          const deadEvents = (await readEvents(specFolder)).filter(
            (event) => event.type === 'dead',
          );
          assert.deepEqual(
            deadEvents.map((event) => event.data),
            [{ task: '1', reason: 'own_folder_path' }],
          );
          assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), false);
          return;
        }

        assert.equal(result.success, true, String(result.error));
        assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), false);
        assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), true);
        assert.equal(
          (await readEvents(specFolder)).some((event) => event.type === 'dead'),
          false,
        );
      },
    );
  },
);
