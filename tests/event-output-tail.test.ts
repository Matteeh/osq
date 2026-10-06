import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { retrySpec } from '../src/core/lifecycle/retry.js';
import { buildScopeRegressionMarker } from '../src/core/run/scope-hash.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { type LocatedChange, listChanges } from '../src/core/status/change-locations.js';
import { haltWorktreeChange } from '../src/watcher/worktree-run.js';
import { installFakeValidator } from './helpers.js';

const LIMITS = { markerOutputLines: 40, markerLineChars: 400 };

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

function numbered(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n');
}

/** A project with a located active change, for `haltWorktreeChange`. */
async function locateActiveChange(): Promise<LocatedChange> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-event-tail-halt-'));
  roots.push(root);
  const folderPath = path.join(root, 'openspec', 'changes', '001-halt');
  await fs.mkdir(folderPath, { recursive: true });
  const [change] = await listChanges(root, DEFAULT_CONFIG, ['active']);
  assert.ok(change, 'the active change should be located');
  return change;
}

async function readEvents(
  folderPath: string,
  target: string,
): Promise<Array<{ type: string; data?: Record<string, unknown> }>> {
  const raw = await fs
    .readFile(path.join(folderPath, '.run', 'events', `${target}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; data?: Record<string, unknown> });
}

async function readRegressed(folderPath: string): Promise<Record<string, unknown>> {
  const event = (await readEvents(folderPath, 'change')).find(
    (entry) => entry.type === 'regressed',
  );
  assert.ok(event, 'a regressed event should be recorded');
  return event.data ?? {};
}

async function readMarkerBody(folderPath: string): Promise<string> {
  const content = await fs.readFile(
    path.join(folderPath, '.run', 'regressed', 'change.md'),
    'utf8',
  );
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  return (match?.[1] ?? content).trim();
}

interface Fixture {
  readonly tmpDir: string;
  readonly specFolder: string;
  readonly runDir: string;
}

const TASK = [
  '---',
  'title: Event tail recertification',
  'verify: node recert.cjs',
  'scope:',
  '  - src/a.ts',
  'entry: []',
  'skills: []',
  '---',
  '## Acceptance',
  '- [ ] the recertification tail is recorded',
  '',
].join('\n');

/** A project with an approved, scope-regressed task whose verify is `script`. */
async function setupRecertification(script: string): Promise<Fixture> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-event-tail-recert-'));
  roots.push(tmpDir);
  await installFakeValidator(tmpDir);
  await scaffoldProject(tmpDir);
  await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), 'export const value = 1;\n', 'utf8');
  await fs.writeFile(path.join(tmpDir, 'recert.cjs'), script, 'utf8');

  const spec = await createNewSpec(tmpDir, 'Event Tail Recertification');
  const specFolder = spec.folderPath;
  await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), TASK, 'utf8');
  const proposalPath = path.join(specFolder, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(
    proposalPath,
    proposal.replace(/^verify:.*$/m, 'verify: node recert.cjs'),
    'utf8',
  );
  await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

  const runDir = path.join(specFolder, '.run');
  await fs.mkdir(path.join(runDir, 'done'), { recursive: true });
  await fs.writeFile(
    path.join(runDir, 'done', '1'),
    [
      '---',
      'scope_hash: "sha256:old"',
      'build_stamp: "stamp-abc"',
      'exit_code: 0',
      `scope_files: ${JSON.stringify({ 'src/a.ts': 'sha256:oldfile' })}`,
      '---',
      'DONE-BODY\n',
    ].join('\n'),
    'utf8',
  );
  const marker = buildScopeRegressionMarker({
    taskNumber: '1',
    differingPaths: ['src/a.ts (modified)'],
    attribution: [{ path: 'src/a.ts (modified)', attribution: 'unknown' }],
    recordedHash: 'sha256:old',
    currentHash: 'sha256:current',
    verifyCommand: 'node recert.cjs',
    exitCode: 0,
    duration: 0.01,
    output: 'detection output',
    timedOut: false,
    verificationPassed: true,
  });
  await fs.mkdir(path.join(runDir, 'regressed'), { recursive: true });
  await fs.writeFile(path.join(runDir, 'regressed', '1.md'), marker, 'utf8');
  return { tmpDir, specFolder, runDir };
}

describe('halt detail tails', () => {
  it('covers "Halt detail cut": the marker body and event keep the last 40 lines', async () => {
    const change = await locateActiveChange();
    const detail = numbered(1000);

    await haltWorktreeChange(
      change,
      '001',
      { reason: 'worktree_dirty', detail },
      undefined,
      LIMITS,
    );

    const expected = numbered(1000).split('\n').slice(-40).join('\n');
    assert.equal(await readMarkerBody(change.folderPath), expected);
    assert.equal((await readRegressed(change.folderPath)).output, expected);
  });

  it('covers "Configured tail length": the halt tail uses limits.markerOutputLines', async () => {
    const change = await locateActiveChange();

    await haltWorktreeChange(
      change,
      '001',
      { reason: 'worktree_dirty', detail: numbered(1000) },
      undefined,
      { markerOutputLines: 5, markerLineChars: 400 },
    );

    const expected = numbered(1000).split('\n').slice(-5).join('\n');
    assert.equal((await readRegressed(change.folderPath)).output, expected);
  });

  it('keeps a one-line halt detail exactly, trailing newline included', async () => {
    const change = await locateActiveChange();
    const detail = 'worktree is dirty on main\n';

    await haltWorktreeChange(
      change,
      '001',
      { reason: 'worktree_dirty', detail },
      undefined,
      LIMITS,
    );

    assert.equal((await readRegressed(change.folderPath)).output, detail);
  });
});

describe('human recertification tails', () => {
  const FAILING_100 =
    "for (let i = 1; i <= 100; i += 1) console.log('line ' + i);\nprocess.exit(4);\n";
  const PASSING_SHORT = "console.log('recert-passed-output');\n";

  it('covers "Human recertification tail": a failing recertification keeps the last 40 lines', async () => {
    const fixture = await setupRecertification(FAILING_100);

    const result = await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.recertification, 'requeued');
    const event = (await readEvents(fixture.specFolder, '1'))[0];
    assert.equal(event.type, 'recertification');
    assert.equal(event.data?.outcome, 'requeued');
    assert.equal(event.data?.output, numbered(100).split('\n').slice(60).join('\n'));
  });

  it('keeps a short passing recertification output exactly', async () => {
    const fixture = await setupRecertification(PASSING_SHORT);

    const result = await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.recertification, 'passed');
    const event = (await readEvents(fixture.specFolder, '1'))[0];
    assert.equal(event.type, 'recertification');
    assert.equal(event.data?.outcome, 'passed');
    assert.equal(event.data?.output, 'recert-passed-output\n');
  });
});
