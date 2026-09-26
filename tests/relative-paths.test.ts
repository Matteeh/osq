import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { getArchiveDir } from '../src/core/status/layout.js';
import { MockAdapter } from '../src/harness/mock.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const roots: string[] = [];

const TASKS_MD = '# Tasks\n\n- [ ] 1. When a path is recorded, it is relative\n';

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

/** Watcher config with no pre-spawn verify and no automatic retries. */
function relativeConfig(): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off', autoRetries: 0 },
  };
}

async function makeProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-relative-paths-'));
  roots.push(root);
  await installFakeValidator(root);
  await scaffoldProject(root);
  return root;
}

function proposal(verify: string): string {
  return `---
title: Relative paths
depends_on: []
verify: ${verify}
features:
  reads: []
---
## Goal

Record paths relative to the project root.

## Surface

None.

## Human steps

None
`;
}

function taskMarkdown(verify: string): string {
  return [
    '---',
    'title: When a path is recorded, it is relative',
    `verify: ${verify}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] paths are relative',
    '',
  ].join('\n');
}

/** A change with one task whose verify is `verify`. */
async function prepareChange(root: string, folderName: string, verify: string): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', folderName);
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposal(verify), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks.md'), TASKS_MD, 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), taskMarkdown(verify), 'utf8');
  await approveSpec(root, '001', relativeConfig());
  return folder;
}

interface ParsedEvent {
  type: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

async function readEvents(eventsPath: string): Promise<ParsedEvent[]> {
  const raw = await fs.readFile(eventsPath, 'utf8').catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ParsedEvent);
}

describe('Relative verify output', () => {
  it('records a failing verify and its dead marker with project-relative paths', async () => {
    const root = await makeProject();
    await fs.writeFile(
      path.join(root, 'fail.cjs'),
      "console.log(process.cwd() + '/src/a.ts');\nprocess.exit(1);\n",
      'utf8',
    );
    const folder = await prepareChange(root, '001-relative', 'node fail.cjs');

    const summary = await runWatcherOnce(root, relativeConfig(), new MockAdapter());

    assert.equal(summary.tasksRun, 1);

    const events = await readEvents(path.join(folder, '.run', 'events', '1.jsonl'));
    const verifyRan = events.filter((event) => event.type === 'verify_ran');
    assert.equal(verifyRan.length, 1);
    const output = String(verifyRan[0]?.data?.output ?? '');
    assert.ok(output.includes('src/a.ts'), `expected a relative path, got: ${output}`);
    assert.ok(!output.includes(root), `expected no project root, got: ${output}`);

    const dead = await fs.readFile(path.join(folder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(dead.includes('src/a.ts'), dead);
    assert.ok(!dead.includes(root), dead);
  });
});

describe('Relative archive path', () => {
  it('records the archived event archivePath relative to the project root', async () => {
    const root = await makeProject();
    await fs.writeFile(path.join(root, 'pass.cjs'), 'process.exit(0);\n', 'utf8');
    await prepareChange(root, '001-relative-archive', 'node pass.cjs');

    const summary = await runWatcherOnce(root, relativeConfig(), new MockAdapter());

    assert.equal(summary.specsArchived, 1);
    const archivedFolder = path.join(
      getArchiveDir(relativeConfig().paths.openspecRoot, root),
      '001-relative-archive',
    );
    const events = await readEvents(path.join(archivedFolder, '.run', 'events', 'change.jsonl'));
    const archived = events.find((event) => event.type === 'archived');
    assert.ok(archived, 'the archived event is recorded');
    assert.equal(archived.data?.archivePath, 'openspec/changes/archive/001-relative-archive');
  });
});
