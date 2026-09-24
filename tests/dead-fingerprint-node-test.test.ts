import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';
import { markerFingerprint } from '../src/watcher/fingerprint.js';
import { writeDeadMarker } from '../src/watcher/outcome.js';

const execFileAsync = promisify(execFile);
const FINGERPRINT = /^fingerprint: (sha256:[0-9a-f]{64})$/m;

/** A failing `node:test` file that prints a fresh mkdtemp directory. */
function failingTestSource(message: string): string {
  return [
    "import assert from 'node:assert/strict';",
    "import fs from 'node:fs';",
    "import os from 'node:os';",
    "import path from 'node:path';",
    "import { test } from 'node:test';",
    '',
    "test('repeated node test failure', () => {",
    "  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paas-'));",
    "  console.log('created ' + dir);",
    `  assert.equal('alpha', 'beta', '${message} at ' + path.join(dir, 'state.db'));`,
    '});',
    '',
  ].join('\n');
}

function marker(reason: string, body: string): string {
  return `---\nreason: ${reason}\n---\n${body}`;
}

/** Run a failing test file with `node --test` and return its combined output. */
async function runFailingTest(file: string): Promise<string> {
  // Drop the outer test runner's marker so the child runs as an ordinary test.
  const env = { ...process.env, NODE_TEST_CONTEXT: undefined };
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, ['--test', file], { env });
    return stdout + stderr;
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
  }
}

async function fingerprintOf(output: string, runDir: string, task: string): Promise<string> {
  await writeDeadMarker(runDir, task, marker('verify_red', output));
  const written = await fs.readFile(path.join(runDir, 'dead', `${task}.md`), 'utf8');
  const match = written.match(FINGERPRINT);
  assert.ok(match, `no fingerprint in ${written}`);
  return match[1];
}

describe('node:test failure fingerprints', () => {
  it('gives two runs of the same failure the same fingerprint', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-node-test-fp-'));
    try {
      const file = path.join(dir, 'fail.mjs');
      await fs.writeFile(file, failingTestSource('alpha mismatch'), 'utf8');
      const first = await runFailingTest(file);
      const second = await runFailingTest(file);
      const runDir = path.join(dir, 'run');

      const firstFingerprint = await fingerprintOf(first, runDir, '1');
      const secondFingerprint = await fingerprintOf(second, runDir, '2');

      assert.notEqual(first, second, 'the two runs must print different temp directories');
      assert.equal(firstFingerprint, secondFingerprint);
      assert.equal(firstFingerprint, markerFingerprint(marker('verify_red', first)));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('gives a different assertion message a different fingerprint', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-node-test-fp-'));
    try {
      const file = path.join(dir, 'fail.mjs');
      const runDir = path.join(dir, 'run');

      await fs.writeFile(file, failingTestSource('alpha mismatch'), 'utf8');
      const alpha = await fingerprintOf(await runFailingTest(file), runDir, '1');

      await fs.writeFile(file, failingTestSource('beta mismatch'), 'utf8');
      const beta = await fingerprintOf(await runFailingTest(file), runDir, '2');

      assert.notEqual(alpha, beta);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
