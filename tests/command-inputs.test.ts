import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  type CommandInputs,
  commandLogger,
  processStderr,
  processStdout,
  resolveInputs,
} from '../src/cli/command-inputs.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { runCliCaptured } from './cli-capture.js';

const SHOW_NOT_FOUND = 'Show error: Spec "999" not found in specs or archive';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function tempDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-command-inputs-'));
  tmpDirs.push(root);
  return root;
}

/** Run `write` with `process.stderr.write` captured, returning the chunks. */
function captureStderr(write: () => void): string[] {
  const chunks: string[] = [];
  const original = process.stderr.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stderr.write;
  try {
    write();
  } finally {
    process.stderr.write = original;
  }
  return chunks;
}

describe('command inputs', () => {
  it('exports the process writers and resolver', () => {
    assert.equal(typeof processStdout, 'function');
    assert.equal(typeof processStderr, 'function');
    assert.equal(typeof resolveInputs, 'function');
    assert.equal(typeof commandLogger, 'function');
    assert.equal(typeof resolveInputs({}).config, 'function');
  });

  it('resolveInputs fills cwd, writers and config from the process', async () => {
    const inputs = resolveInputs({});

    assert.equal(inputs.cwd, process.cwd());
    assert.equal(inputs.stdout, processStdout);
    assert.equal(inputs.stderr, processStderr);

    const config = await inputs.config();
    assert.equal(typeof config.harness, 'string');
  });

  it('a passed cwd, config and writers are used as given, so config() never loads', async () => {
    const root = await tempDir();
    // A config file that throws proves config() does not reach loadConfig.
    await fs.writeFile(path.join(root, 'osq.config.ts'), "throw new Error('must not load');\n");
    const stdout = () => {};
    const stderr = () => {};
    const inputs = resolveInputs({ cwd: root, config: DEFAULT_CONFIG, stdout, stderr });

    assert.equal(inputs.cwd, root);
    assert.equal(inputs.stdout, stdout);
    assert.equal(inputs.stderr, stderr);
    assert.equal(await inputs.config(), DEFAULT_CONFIG);
  });

  it('resolveInputs config() loads the config of cwd when none is passed', async () => {
    const root = await tempDir();
    await fs.writeFile(path.join(root, 'osq.config.ts'), "export default { harness: 'pi' };\n");

    const config = await resolveInputs({ cwd: root }).config();

    assert.equal(config.harness, 'pi');
  });

  it('commandLogger without stderr is the osq logger on process stderr', () => {
    const chunks = captureStderr(() => {
      commandLogger({}).info('hello');
    });

    assert.deepEqual(chunks, ['[osq] hello\n']);
  });

  it('commandLogger with stderr sends every line to it, newline included', () => {
    const chunks: string[] = [];
    const inputs: CommandInputs = { stderr: (text) => chunks.push(text) };

    const logger = commandLogger(inputs);
    logger.info('hello');
    logger.error('bad');

    assert.deepEqual(chunks, ['[osq] hello\n', '[osq] bad\n']);
    assert.equal(logger.interactive, false);
  });
});

describe('runCliCaptured process writes', () => {
  it('records the exact text written to each stream', async () => {
    const root = await tempDir();
    await scaffoldProject(root);

    const capture = await runCliCaptured(root, ['show', '999']);

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.equal(capture.stderr, `${SHOW_NOT_FOUND}\n`);
    assert.deepEqual(capture.lines, [{ stream: 'stderr', text: SHOW_NOT_FOUND }]);
  });

  it('records multi-line stdout text with its trailing newline', async () => {
    const root = await tempDir();

    const capture = await runCliCaptured(root, ['init']);

    assert.equal(capture.exitCode, undefined);
    assert.equal(capture.stderr, '');
    assert.ok(capture.stdout.endsWith('\nosq initialized successfully.\n'));
    assert.equal(
      capture.stdout,
      capture.lines
        .filter((line) => line.stream === 'stdout')
        .map((line) => `${line.text}\n`)
        .join(''),
    );
  });
});
