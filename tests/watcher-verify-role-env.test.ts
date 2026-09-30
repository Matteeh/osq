import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { getArchiveDir } from '../src/core/status/layout.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

/**
 * Exits 0 only when `VERIFY_PROBE` is set and `SECRET_PROBE` is not, and
 * prints `OSQ_CHANGE` so a task verify records the change folder it ran for.
 */
const PROBE_SCRIPT =
  'process.exit((process.stdout.write((process.env.OSQ_CHANGE ?? "") + String.fromCharCode(10)),' +
  ' 1 - Boolean(process.env.VERIFY_PROBE) * !process.env.SECRET_PROBE))';
const PROBE = `node -e '${PROBE_SCRIPT}'`;

interface ParsedEvent {
  type: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

/** Adapter that writes a result file so the runner proceeds to verification. */
class FileWritingAdapter implements HarnessAdapter {
  readonly name = 'file-writer';

  async setup(_projectRoot: string, _config: OsqConfig): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
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

async function readEvents(folderPath: string, target: string): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(folderPath, '.run', 'events', `${target}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ParsedEvent);
}

function taskMarkdown(verify: string): string {
  return [
    '---',
    'title: When the watcher runs a verify, it gets the verify role environment',
    `verify: ${verify}`,
    'verify_starts: any',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] the verify sees only the verify role environment',
    '',
  ].join('\n');
}

describe('Watcher verifies use the verify role environment', () => {
  let root: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-verify-role-env-'));
    await installFakeValidator(root);
    await scaffoldProject(root);
    for (const name of ['VERIFY_PROBE', 'SECRET_PROBE']) {
      saved[name] = process.env[name];
    }
    process.env.VERIFY_PROBE = '1';
    process.env.SECRET_PROBE = 'leak';
  });

  afterEach(async () => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else process.env[name] = value;
    }
    await fs.rm(root, { recursive: true, force: true });
  });

  it('passes the baseline, task, and change verifies with only the verify role', async () => {
    const spec = await createNewSpec(root, 'Verify Role Environment');
    const folder = spec.folderPath;
    await fs.writeFile(path.join(folder, 'tasks', '1.md'), taskMarkdown(PROBE), 'utf8');
    const proposalPath = path.join(folder, 'proposal.md');
    const proposal = await fs.readFile(proposalPath, 'utf8');
    await fs.writeFile(proposalPath, proposal.replace(/^verify:.*$/m, `verify: ${PROBE}`), 'utf8');

    const config = defineConfig({
      gates: { baselineVerify: PROBE, changeVerifyAfterTask: true },
      confinement: { roles: { verify: { env: ['VERIFY_PROBE'] } } },
    });
    await approveSpec(root, '001', config);

    const summary = await runWatcherOnce(root, config, new FileWritingAdapter());
    assert.equal(summary.specsArchived, 1, 'the task completes and the change archives');

    const archiveDir = getArchiveDir(config.paths.openspecRoot, root);
    const entries = await fs.readdir(archiveDir);
    assert.equal(entries.length, 1);
    const archived = path.join(archiveDir, entries[0] as string);

    const doneStat = await fs.stat(path.join(archived, '.run', 'done', '1')).catch(() => null);
    assert.ok(doneStat, 'task 1 is done');

    const changeEvents = await readEvents(archived, 'change');
    const baseline = changeEvents.find((event) => event.type === 'baseline_ran');
    assert.ok(baseline, 'the baseline ran');
    assert.equal(baseline?.data?.outcome, 'passed', 'the baseline verify passed');
    const changeVerifies = changeEvents.filter((event) => event.type === 'verify_ran');
    assert.ok(changeVerifies.length > 0, 'the change verify ran');
    for (const event of changeVerifies) {
      assert.equal(event.data?.exitCode, 0, 'every change verify passed');
    }

    const taskEvents = await readEvents(archived, '1');
    const taskVerifies = taskEvents.filter((event) => event.type === 'verify_ran');
    assert.ok(taskVerifies.length >= 1, 'the task verify ran');
    for (const event of taskVerifies) {
      assert.equal(event.data?.exitCode, 0, 'every task verify passed');
    }

    const postSpawn = taskVerifies.filter((event) => event.data?.phase !== 'pre_spawn');
    assert.ok(postSpawn.length >= 1, 'the post-spawn task verify ran');
    for (const event of postSpawn) {
      assert.equal(
        String(event.data?.output).trim(),
        path.relative(root, folder).split(path.sep).join('/'),
        'the task verify saw its change folder',
      );
    }
  });
});
