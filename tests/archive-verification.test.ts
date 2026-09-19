import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { getArchiveDir } from '../src/core/layout.js';
import { parseSpecMd } from '../src/core/parser.js';
import { AgyAdapter } from '../src/harness/agy.js';
import { checkAndArchiveSpec } from '../src/watcher/archiver.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

const PASSING = 'node -e "process.exit(0)"';
const FAILING = 'node -e "process.exit(1)"';

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

    const changeEvents = verifyRanEvents(await readEvents(archivedPath, 'change'));
    assert.equal(changeEvents.length, 1);
    assert.equal(changeEvents[0].data?.command, PASSING);
    assert.equal(changeEvents[0].data?.exitCode, 0);
    assert.equal(typeof changeEvents[0].data?.duration, 'number');
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
    assert.equal((await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter)).success, true);
    assert.equal((await runTask(tmpDir, specFolder, '2', DEFAULT_CONFIG, adapter)).success, true);

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG), false);

    assert.equal(await exists(specFolder), true);
    assert.equal(await exists(archivedPath), false);

    const marker = await fs.readFile(
      path.join(specFolder, '.run', 'regressed', 'change.md'),
      'utf8',
    );
    assert.match(marker, /command: .*process\.exit\(1\)/);
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
});
