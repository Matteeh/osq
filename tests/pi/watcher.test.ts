import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { OsqConfig } from '../../src/core/foundation/config.js';
import { approveSpec } from '../../src/core/spec/approve.js';
import { PiAdapter } from '../../src/harness/pi/pi.js';
import { runTask } from '../../src/watcher/runner.js';
import {
  GOLDEN_RUN,
  NO_TEXT_RUN,
  createPiProject,
  envScope,
  piConfig,
  writePiTask,
} from './support.js';

const env = envScope([
  'OSQ_FAKE_PI_JSONL',
  'OSQ_FAKE_PI_MODE',
  'OSQ_FAKE_PI_EXIT',
  'OSQ_FAKE_PI_STDERR',
  'OSQ_FAKE_PI_RESULT_TEXT',
  'OSQ_PI_PATH',
  'OSQ_MODEL',
]);

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

async function approveTask(
  root: string,
  specFolder: string,
  config: OsqConfig,
  verify?: string,
): Promise<void> {
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  const proposalPath = path.join(specFolder, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8').catch(() => null);
  if (proposal !== null) {
    await fs.writeFile(
      proposalPath,
      proposal.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
      'utf8',
    );
  }
  await writePiTask(specFolder, { verify: verify ?? PASSING_VERIFY });
  await approveSpec(root, '001', config);
}

async function markerText(markerPath: string): Promise<string> {
  return await fs.readFile(markerPath, 'utf8').catch(() => '');
}

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, taskNumber: string): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

describe('Pi runner outcomes through the watcher', () => {
  beforeEach(() => env.save());
  afterEach(() => env.restore());

  it('writes a crashed dead letter with Pi stderr on a non-zero exit', async () => {
    const { root, specFolder } = await createPiProject('pi-run-crash');
    try {
      const config = piConfig();
      await approveTask(root, specFolder, config);
      env.set({
        OSQ_FAKE_PI_MODE: 'fail',
        OSQ_FAKE_PI_EXIT: '17',
        OSQ_FAKE_PI_STDERR: 'pi exploded',
      });

      const result = await runTask(root, specFolder, '1', config, new PiAdapter());
      assert.equal(result.success, false);
      assert.equal(result.reason, 'crashed');
      const dead = await markerText(path.join(specFolder, '.run', 'dead', '1.md'));
      assert.match(dead, /reason: crashed/);
      assert.match(dead, /pi exploded/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('names pi auth check when an exit reports a missing API key', async () => {
    const { root, specFolder } = await createPiProject('pi-run-missing-key');
    try {
      const config = piConfig({ provider: 'deepseek' });
      await approveTask(root, specFolder, config);
      env.set({ OSQ_FAKE_PI_MODE: 'missing-credentials' });

      const result = await runTask(root, specFolder, '1', config, new PiAdapter());
      assert.equal(result.success, false);
      assert.equal(result.reason, 'crashed');
      const dead = await markerText(path.join(specFolder, '.run', 'dead', '1.md'));
      assert.match(dead, /No API key found/);
      assert.match(dead, /pi auth check --provider deepseek/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('synthesizes a missing result from the last text event and still verifies', async () => {
    const { root, specFolder } = await createPiProject('pi-run-synth');
    try {
      const config = piConfig();
      await approveTask(root, specFolder, config);
      env.set({ OSQ_FAKE_PI_JSONL: GOLDEN_RUN });

      const result = await runTask(root, specFolder, '1', config, new PiAdapter());
      assert.equal(result.success, true);

      const synthesized = await fs.readFile(
        path.join(specFolder, '.run', 'results', '1.md'),
        'utf8',
      );
      assert.match(synthesized, /^---\nsynthesized: true\n---\n/);
      assert.match(synthesized, /Done\. Created `hello\.txt`/);

      const events = await readEvents(specFolder, '1');
      const started = events.find((event) => event.type === 'started');
      assert.equal(started?.data?.harness, 'pi');
      assert.equal(started?.data?.model, 'default');
      assert.equal(started?.data?.harnessVersion, '0.87.0');
      assert.ok(events.some((event) => event.type === 'tokens'));
      assert.ok(events.some((event) => event.type === 'done'));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('falls to no_result without a result file or final text', async () => {
    const { root, specFolder } = await createPiProject('pi-run-no-result');
    try {
      const config = piConfig();
      await approveTask(root, specFolder, config);
      env.set({ OSQ_FAKE_PI_JSONL: NO_TEXT_RUN });

      const result = await runTask(root, specFolder, '1', config, new PiAdapter());
      assert.equal(result.success, false);
      assert.equal(result.reason, 'no_result');
      assert.match(
        await markerText(path.join(specFolder, '.run', 'dead', '1.md')),
        /reason: no_result/,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('does not reach done when independent verification fails', async () => {
    const { root, specFolder } = await createPiProject('pi-run-verify-red');
    try {
      const config = piConfig();
      await approveTask(root, specFolder, config, 'node -e "process.exit(1)"');
      env.set({ OSQ_FAKE_PI_RESULT_TEXT: '# Authored by fake pi\n' });

      const result = await runTask(root, specFolder, '1', config, new PiAdapter());
      assert.equal(result.success, false);
      assert.equal(result.reason, 'verify_red');
      assert.match(
        await markerText(path.join(specFolder, '.run', 'dead', '1.md')),
        /reason: verify_red/,
      );
      assert.equal(
        await fs
          .stat(path.join(specFolder, '.run', 'done', '1'))
          .then(() => true)
          .catch(() => false),
        false,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
