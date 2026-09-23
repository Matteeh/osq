import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { parseSpecMd } from '../src/core/spec/parser.js';
import { getArchiveDir } from '../src/core/status/layout.js';
import { AgyAdapter } from '../src/harness/agy/agy.js';
import { appendHarnessEvent } from '../src/harness/types.js';
import { checkAndArchiveSpec } from '../src/watcher/archiver.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

const PASSING = 'node verify-pass.cjs';
const FAILING = 'node verify-fail.cjs';

/**
 * Deterministic local verification scripts written into the execution root.
 * They replace the planning sentinel with real, re-runnable fixture commands
 * that approve-time lint accepts and the archive verifier executes.
 */
const PASS_SCRIPT = 'process.exit(0);\n';
const FAIL_SCRIPT = 'process.exit(1);\n';

/**
 * Local opt-out for scenarios whose subject is strictly archive-time failure or
 * scope-audit ordering. Deriving it from `DEFAULT_CONFIG` keeps every unrelated
 * default (including the default-on task gate) intact.
 */
const ARCHIVE_ONLY_CONFIG: OsqConfig = Object.freeze({
  ...DEFAULT_CONFIG,
  gates: { changeVerifyAfterTask: false },
});

/**
 * Real on-disk harness binary executed by the actual `AgyAdapter`. It writes the
 * result file the runner expects, so no mock adapter participates.
 */
const FAKE_HARNESS_SCRIPT = `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const specFolder = process.env.OSQ_SPEC_FOLDER;
const taskNumber = process.env.OSQ_TASK_NUMBER;
if (specFolder && taskNumber) {
  const resultsDir = path.join(specFolder, '.run', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, taskNumber + '.md'), '# Result\\n', 'utf8');
}
process.exit(0);
`;

function proposal(changeVerify: string): string {
  return [
    '---',
    'title: Archive verification',
    'depends_on: []',
    `verify: ${changeVerify}`,
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Exercise archive-time verification.',
    '## Contract',
    '| Input | Expected Output |',
    '|---|---|',
    '| a | b |',
    '## Non-goals',
    'None.',
    '## Surface',
    'None.',
    '## Delta',
    'None.',
  ].join('\n');
}

function taskFile(title: string, verify: string, scope: string[]): string {
  return `${[
    '---',
    `title: ${title}`,
    `verify: ${verify}`,
    'scope:',
    ...scope.map((entry) => `  - ${entry}`),
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] observed',
  ].join('\n')}\n`;
}

describe('archive-time verification', () => {
  let tmpDir: string;
  let specFolder: string;
  let archivedPath: string;
  let originalAgyPath: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-archive-verify-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify-pass.cjs'), PASS_SCRIPT, 'utf8');
    await fs.writeFile(path.join(tmpDir, 'verify-fail.cjs'), FAIL_SCRIPT, 'utf8');
    const fakeAgy = path.join(tmpDir, 'fake-agy.mjs');
    await fs.writeFile(fakeAgy, FAKE_HARNESS_SCRIPT, { mode: 0o755 });
    originalAgyPath = process.env.AGY_PATH;
    process.env.AGY_PATH = fakeAgy;
  });

  afterEach(async () => {
    if (originalAgyPath === undefined) {
      Reflect.deleteProperty(process.env, 'AGY_PATH');
    } else {
      process.env.AGY_PATH = originalAgyPath;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeChange(
    changeVerify: string,
    tasks: Array<{ verify: string; scope?: string[] }>,
  ): Promise<void> {
    specFolder = path.join(tmpDir, 'openspec', 'changes', '001-archive-verify');
    archivedPath = path.join(
      getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir),
      path.basename(specFolder),
    );
    await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(specFolder, 'proposal.md'), proposal(changeVerify), 'utf8');
    const checklist = tasks.map((_, index) => `- [ ] ${index + 1}. task ${index + 1}`).join('\n');
    await fs.writeFile(path.join(specFolder, 'tasks.md'), `# Tasks\n\n${checklist}\n`, 'utf8');
    for (const [index, entry] of tasks.entries()) {
      const number = String(index + 1);
      await fs.writeFile(
        path.join(specFolder, 'tasks', `${number}.md`),
        taskFile(`When task ${number} verifies`, entry.verify, entry.scope ?? []),
        'utf8',
      );
    }
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
  }

  async function readEvents(root: string, target: string): Promise<ParsedEvent[]> {
    const raw = await fs
      .readFile(path.join(root, '.run', 'events', `${target}.jsonl`), 'utf8')
      .catch(() => '');
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ParsedEvent);
  }

  async function exists(target: string): Promise<boolean> {
    return fs
      .stat(target)
      .then(() => true)
      .catch(() => false);
  }

  function verifyRanEvents(events: ParsedEvent[]): ParsedEvent[] {
    return events.filter((event) => event.type === 'verify_ran');
  }

  async function writeScopedSources(files: string[]): Promise<void> {
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    for (const file of files) {
      await fs.writeFile(path.join(tmpDir, file), 'export const value = 1;\n', 'utf8');
    }
  }

  it('extracts a proposal verify command into SpecData', () => {
    const parsed = parseSpecMd(proposal(PASSING));
    assert.equal(parsed.verify, PASSING);
    assert.equal(parseSpecMd('---\ntitle: x\n---\n## Goal\ny\n').verify, '');
  });

  it('archives a clean change after re-running every task and change verify', async () => {
    await writeChange(PASSING, [{ verify: PASSING }, { verify: PASSING }]);
    const adapter = new AgyAdapter();

    assert.equal((await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter)).success, true);
    assert.equal((await runTask(tmpDir, specFolder, '2', DEFAULT_CONFIG, adapter)).success, true);
    assert.equal(verifyRanEvents(await readEvents(specFolder, '1')).length, 1);

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG), true);

    assert.equal(await exists(specFolder), false);
    assert.equal(await exists(archivedPath), true);
    assert.equal(await exists(path.join(archivedPath, '.run', 'done', '1')), true);
    assert.equal(await exists(path.join(archivedPath, '.run', 'done', '2')), true);
    assert.equal(await exists(path.join(archivedPath, '.run', 'regressed')), false);

    // Each task verify ran once at execution and once again at archive time.
    assert.equal(verifyRanEvents(await readEvents(archivedPath, '1')).length, 2);
    assert.equal(verifyRanEvents(await readEvents(archivedPath, '2')).length, 2);

    // The default-on task gate appends one change-target verify after each of
    // the two tasks; archive verification appends the established third.
    const changeEvents = verifyRanEvents(await readEvents(archivedPath, 'change'));
    assert.equal(changeEvents.length, 3);
    for (const event of changeEvents) {
      assert.equal(event.data?.command, PASSING);
      assert.equal(event.data?.exitCode, 0);
      assert.equal(typeof event.data?.duration, 'number');
    }
  });

  it('refuses task 2 before spawning when an earlier done scope was modified', async () => {
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'src', 'b.ts'), 'export const b = 1;\n', 'utf8');
    await writeChange(PASSING, [
      { verify: PASSING, scope: ['src/a.ts'] },
      { verify: PASSING, scope: ['src/b.ts'] },
    ]);

    const adapter = new AgyAdapter();
    assert.equal((await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter)).success, true);

    await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), 'export const a = 2;\n', 'utf8');

    const result = await runTask(tmpDir, specFolder, '2', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'regressed');

    // The agent must not have spawned for task 2.
    assert.equal(await exists(path.join(specFolder, '.run', 'events', '2.jsonl')), false);
    assert.equal(await exists(path.join(specFolder, '.run', 'results', '2.md')), false);

    const marker = await fs.readFile(path.join(specFolder, '.run', 'regressed', '1.md'), 'utf8');
    assert.match(marker, /src\/a\.ts \(modified\)/);

    const regressed = (await readEvents(specFolder, '1')).filter((e) => e.type === 'regressed');
    assert.equal(regressed.length, 1);
    assert.deepEqual(regressed[0].data?.differingPaths, ['src/a.ts (modified)']);

    // The halted change cannot archive.
    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG), false);
    assert.equal(await exists(archivedPath), false);
  });

  it('blocks archiving when the change-level verify fails', async () => {
    await writeChange(FAILING, [{ verify: PASSING }, { verify: PASSING }]);
    const adapter = new AgyAdapter();
    assert.equal(
      (await runTask(tmpDir, specFolder, '1', ARCHIVE_ONLY_CONFIG, adapter)).success,
      true,
    );
    assert.equal(
      (await runTask(tmpDir, specFolder, '2', ARCHIVE_ONLY_CONFIG, adapter)).success,
      true,
    );

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, ARCHIVE_ONLY_CONFIG), false);

    assert.equal(await exists(specFolder), true);
    assert.equal(await exists(archivedPath), false);

    const marker = await fs.readFile(
      path.join(specFolder, '.run', 'regressed', 'change.md'),
      'utf8',
    );
    assert.match(marker, /command: .*verify-fail\.cjs/);
    assert.match(marker, /exit_code: 1/);
    assert.match(marker, /Archive-time change-level verification failed/);

    const regressed = (await readEvents(specFolder, 'change')).filter(
      (e) => e.type === 'regressed',
    );
    assert.equal(regressed.length, 1);
    assert.equal(regressed[0].data?.exitCode, 1);
    assert.equal(regressed[0].data?.command, FAILING);

    // Every task verify was re-run and passed before the change-level gate.
    assert.equal(verifyRanEvents(await readEvents(specFolder, '1')).length, 2);
    assert.equal(verifyRanEvents(await readEvents(specFolder, '2')).length, 2);
  });

  it('halts archival and records final-task drift before the archive verifier runs', async () => {
    await writeScopedSources(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    await writeChange(PASSING, [
      { verify: PASSING, scope: ['src/a.ts'] },
      { verify: PASSING, scope: ['src/b.ts'] },
      { verify: PASSING, scope: ['src/c.ts'] },
    ]);
    const adapter = new AgyAdapter();
    assert.equal(
      (await runTask(tmpDir, specFolder, '1', ARCHIVE_ONLY_CONFIG, adapter)).success,
      true,
    );
    assert.equal(
      (await runTask(tmpDir, specFolder, '2', ARCHIVE_ONLY_CONFIG, adapter)).success,
      true,
    );
    assert.equal(
      (await runTask(tmpDir, specFolder, '3', ARCHIVE_ONLY_CONFIG, adapter)).success,
      true,
    );

    // The final task records and changes task 1's file.
    await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), 'export const value = 2;\n', 'utf8');
    await appendHarnessEvent(specFolder, '3', {
      type: 'file_changed',
      timestamp: new Date().toISOString(),
      data: { path: 'src/a.ts' },
    });

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, ARCHIVE_ONLY_CONFIG), false);

    // Archival halted: the folder stays active and emits no archived event.
    assert.equal(await exists(specFolder), true);
    assert.equal(await exists(archivedPath), false);

    const marker = await fs.readFile(path.join(specFolder, '.run', 'regressed', '1.md'), 'utf8');
    assert.match(marker, /reason: scope_regression/);
    assert.match(marker, /exit_code: 0/);
    assert.match(marker, /verification_passed: true/);
    assert.match(marker, /src\/a\.ts \(modified\)/);

    const task1 = await readEvents(specFolder, '1');
    const regressed = task1.filter((event) => event.type === 'regressed');
    assert.equal(regressed.length, 1);
    assert.equal(regressed[0].data?.reason, 'scope_regression');
    assert.deepEqual(regressed[0].data?.differingPaths, ['src/a.ts (modified)']);
    assert.deepEqual(regressed[0].data?.attribution, [
      { path: 'src/a.ts (modified)', attribution: '3' },
    ]);

    // The audit's detection verify is task 1's only extra verify_ran and lands
    // after the task completed. No ordinary archive verify runs afterward.
    assert.equal(verifyRanEvents(task1).length, 2);
    const doneIndex = task1.findIndex((event) => event.type === 'done');
    const detectionIndex = task1.findIndex(
      (event, index) => index > doneIndex && event.type === 'verify_ran',
    );
    assert.ok(detectionIndex > doneIndex, 'detection verify runs after the completed task');
    assert.equal(verifyRanEvents(await readEvents(specFolder, '2')).length, 1);
    assert.equal(verifyRanEvents(await readEvents(specFolder, '3')).length, 1);
    const changeEvents = await readEvents(specFolder, 'change');
    assert.equal(verifyRanEvents(changeEvents).length, 0);
    assert.equal(
      changeEvents.some((event) => event.type === 'archived'),
      false,
    );
  });

  it('records every stale done task in one archive audit without stopping at the first', async () => {
    await writeScopedSources(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    await writeChange(PASSING, [
      { verify: PASSING, scope: ['src/a.ts'] },
      { verify: PASSING, scope: ['src/b.ts'] },
      { verify: PASSING, scope: ['src/c.ts'] },
    ]);
    const adapter = new AgyAdapter();
    assert.equal((await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter)).success, true);
    assert.equal((await runTask(tmpDir, specFolder, '2', DEFAULT_CONFIG, adapter)).success, true);
    assert.equal((await runTask(tmpDir, specFolder, '3', DEFAULT_CONFIG, adapter)).success, true);

    // Two earlier completions drift before the archive attempt.
    await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), 'export const value = 2;\n', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'src', 'b.ts'), 'export const value = 2;\n', 'utf8');

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG), false);

    for (const number of ['1', '2']) {
      const marker = await fs.readFile(
        path.join(specFolder, '.run', 'regressed', `${number}.md`),
        'utf8',
      );
      assert.match(marker, /reason: scope_regression/);
      const events = await readEvents(specFolder, number);
      assert.equal(events.filter((event) => event.type === 'regressed').length, 1);
      assert.equal(verifyRanEvents(events).length, 2);
    }
    assert.equal(await exists(path.join(specFolder, '.run', 'regressed', '3.md')), false);
    assert.equal(await exists(archivedPath), false);
    assert.equal(
      (await readEvents(specFolder, 'change')).some((event) => event.type === 'archived'),
      false,
    );
  });

  it('repeatedly halts without adding verification, marker, or event duplicates', async () => {
    await writeScopedSources(['src/a.ts', 'src/b.ts']);
    await writeChange(PASSING, [
      { verify: PASSING, scope: ['src/a.ts'] },
      { verify: PASSING, scope: ['src/b.ts'] },
    ]);
    const adapter = new AgyAdapter();
    assert.equal((await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter)).success, true);
    assert.equal((await runTask(tmpDir, specFolder, '2', DEFAULT_CONFIG, adapter)).success, true);
    await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), 'export const value = 2;\n', 'utf8');

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG), false);
    const markerPath = path.join(specFolder, '.run', 'regressed', '1.md');
    const markerBefore = await fs.readFile(markerPath, 'utf8');
    const eventsBefore = await readEvents(specFolder, '1');

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG), false);

    assert.equal(await fs.readFile(markerPath, 'utf8'), markerBefore);
    assert.equal((await readEvents(specFolder, '1')).length, eventsBefore.length);
    assert.equal(await exists(archivedPath), false);
  });

  it('removes the transient plan-prompt.md from a successful archive', async () => {
    await writeChange(PASSING, [{ verify: PASSING }]);
    const adapter = new AgyAdapter();
    assert.equal((await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter)).success, true);
    await fs.writeFile(path.join(specFolder, 'plan-prompt.md'), 'transient prompt\n', 'utf8');

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG), true);

    assert.equal(await exists(path.join(archivedPath, 'plan-prompt.md')), false);
    assert.equal(await exists(path.join(archivedPath, 'proposal.md')), true);
    assert.equal(await exists(path.join(archivedPath, 'tasks', '1.md')), true);
    assert.equal(await exists(path.join(archivedPath, '.run', 'done', '1')), true);
  });

  it('leaves the transient plan-prompt.md in place when archive verification fails', async () => {
    await writeChange(FAILING, [{ verify: PASSING }]);
    const adapter = new AgyAdapter();
    assert.equal(
      (await runTask(tmpDir, specFolder, '1', ARCHIVE_ONLY_CONFIG, adapter)).success,
      true,
    );
    await fs.writeFile(path.join(specFolder, 'plan-prompt.md'), 'transient prompt\n', 'utf8');

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, ARCHIVE_ONLY_CONFIG), false);

    assert.equal(await exists(specFolder), true);
    assert.equal(await exists(archivedPath), false);
    assert.equal(
      await fs.readFile(path.join(specFolder, 'plan-prompt.md'), 'utf8'),
      'transient prompt\n',
    );
  });
});
