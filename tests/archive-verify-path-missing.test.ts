import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { getArchiveDir } from '../src/core/status/layout.js';
import { AgyAdapter } from '../src/harness/agy/agy.js';
import { checkAndArchiveSpec } from '../src/watcher/archiver.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

/** Change-level verify names no repository path, so it never trips the check. */
const CHANGE_VERIFY = 'node verify-pass.cjs';

/** A task verify naming one repository-relative path that node can run. */
const TASK_VERIFY = 'node tests/present.cjs';

const NAMED_PATH = 'tests/present.cjs';

/**
 * Real on-disk harness binary executed by the actual `AgyAdapter`. It writes the
 * result file the runner expects and exits cleanly.
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
    'title: Archive verify path check',
    'depends_on: []',
    `verify: ${changeVerify}`,
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Exercise archive-time named-path checking.',
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

function taskFile(title: string, verify: string): string {
  return `${[
    '---',
    `title: ${title}`,
    `verify: ${verify}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] observed',
  ].join('\n')}\n`;
}

describe('archive-time verify named-path check', () => {
  let tmpDir: string;
  let specFolder: string;
  let archivedPath: string;
  let originalAgyPath: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-archive-path-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify-pass.cjs'), 'process.exit(0);\n', 'utf8');
    await fs.mkdir(path.join(tmpDir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, NAMED_PATH), 'process.exit(0);\n', 'utf8');
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

  async function writeDoneChange(): Promise<OsqConfig> {
    specFolder = path.join(tmpDir, 'openspec', 'changes', '001-archive-path');
    archivedPath = path.join(
      getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir),
      path.basename(specFolder),
    );
    await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(specFolder, 'proposal.md'), proposal(CHANGE_VERIFY), 'utf8');
    await fs.writeFile(path.join(specFolder, 'tasks.md'), '# Tasks\n\n- [ ] 1. task 1\n', 'utf8');
    await fs.writeFile(
      path.join(specFolder, 'tasks', '1.md'),
      taskFile('When task 1 verifies', TASK_VERIFY),
      'utf8',
    );
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, new AgyAdapter());
    assert.equal(result.success, true);
    return DEFAULT_CONFIG;
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

  function verifyRanEvents(events: ParsedEvent[]): ParsedEvent[] {
    return events.filter(
      (event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn',
    );
  }

  async function exists(target: string): Promise<boolean> {
    return fs
      .stat(target)
      .then(() => true)
      .catch(() => false);
  }

  it('regresses without running when a named path was deleted', async () => {
    const config = await writeDoneChange();
    const before = verifyRanEvents(await readEvents(specFolder, '1')).length;

    await fs.rm(path.join(tmpDir, NAMED_PATH));

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, config), false);

    // The change stays active and no archive event is recorded.
    assert.equal(await exists(specFolder), true);
    assert.equal(await exists(archivedPath), false);
    assert.equal(
      (await readEvents(specFolder, 'change')).some((event) => event.type === 'archived'),
      false,
    );

    // The regressed marker carries the reason, the command, and each missing path.
    const marker = await fs.readFile(path.join(specFolder, '.run', 'regressed', '1.md'), 'utf8');
    assert.match(marker, /reason: verify_path_missing/);
    assert.match(marker, /tests\/present\.cjs/);
    assert.match(marker, /node tests\/present\.cjs/);

    // The regressed event carries the same reason and the path.
    const regressed = (await readEvents(specFolder, '1')).filter(
      (event) => event.type === 'regressed',
    );
    assert.equal(regressed.length, 1);
    assert.equal(regressed[0].data?.reason, 'verify_path_missing');
    assert.deepEqual(regressed[0].data?.differingPaths, [NAMED_PATH]);

    // The archive step never ran the command.
    assert.equal(verifyRanEvents(await readEvents(specFolder, '1')).length, before);
  });

  it('archives as before when every named path is present', async () => {
    const config = await writeDoneChange();
    const before = verifyRanEvents(await readEvents(specFolder, '1')).length;

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, config), true);

    assert.equal(await exists(specFolder), false);
    assert.equal(await exists(archivedPath), true);
    assert.equal(await exists(path.join(archivedPath, '.run', 'done', '1')), true);
    assert.equal(await exists(path.join(archivedPath, '.run', 'regressed')), false);
    assert.equal(verifyRanEvents(await readEvents(archivedPath, '1')).length, before + 1);
  });
});
