import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { getArchiveDir } from '../src/core/layout.js';
import { createNewSpec } from '../src/core/new.js';
import { MockAdapter } from '../src/harness/mock.js';
import { OpencodeAdapter, preflightOpencode } from '../src/harness/opencode.js';
import { startWatcher } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

/** Replace the seeded planning sentinel in the proposal and task 1. */
async function installLocalVerifier(root: string, folderPath: string): Promise<void> {
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  for (const rel of ['proposal.md', path.join('tasks', '1.md')]) {
    const target = path.join(folderPath, rel);
    const content = await fs.readFile(target, 'utf8').catch(() => null);
    if (content === null) {
      continue;
    }
    await fs.writeFile(
      target,
      content.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
      'utf8',
    );
  }
}

describe('Watcher Preflight Verification', () => {
  let tmpDir: string;
  let originalExit: typeof process.exit;
  let originalExitCode: typeof process.exitCode;
  let originalError: typeof console.error;
  let originalLog: typeof console.log;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-preflight-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');

    originalExit = process.exit;
    originalExitCode = process.exitCode;
    originalError = console.error;
    originalLog = console.log;
  });

  afterEach(async () => {
    process.exit = originalExit;
    process.exitCode = originalExitCode;
    console.error = originalError;
    console.log = originalLog;
    // biome-ignore lint/performance/noDelete: environment variable deletion
    delete process.env.OPENCODE_PATH;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('Watcher start runs preflight check when harness is opencode', async () => {
    let preflightCalled = false;

    const opencodeAdapter = new OpencodeAdapter();
    // Spy on preflight method
    const originalPreflight = opencodeAdapter.preflight.bind(opencodeAdapter);
    opencodeAdapter.preflight = async (projectRoot: string, config: OsqConfig) => {
      preflightCalled = true;
      return originalPreflight(projectRoot, config);
    };

    const fakeBin = path.join(tmpDir, 'fake-opencode.mjs');
    await fs.writeFile(
      fakeBin,
      `#!${process.execPath}
if (process.argv.includes('--version')) {
  console.log('opencode 1.0.0');
  process.exit(0);
}
process.exit(0);
`,
      { mode: 0o755 },
    );

    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      harness: 'opencode',
      opencode: {
        bin: fakeBin,
      },
    };

    const logLines: string[] = [];
    console.log = (...args: unknown[]) => {
      logLines.push(args.map(String).join(' '));
    };

    await startWatcher(tmpDir, config, opencodeAdapter, { once: true });
    assert.equal(preflightCalled, true, 'Preflight check must run when harness is opencode');
    assert.ok(logLines.includes('opencode 1.0.0'));

    // When harness is mock, preflight must NOT run
    let mockPreflightCalled = false;
    const mockAdapter = new MockAdapter();
    (mockAdapter as unknown as { preflight?: () => Promise<void> }).preflight = async () => {
      mockPreflightCalled = true;
    };
    const mockConfig: OsqConfig = {
      ...DEFAULT_CONFIG,
      harness: 'mock',
    };

    await startWatcher(tmpDir, mockConfig, mockAdapter, { once: true });
    assert.equal(mockPreflightCalled, false, 'Preflight check must not run when harness is mock');
  });

  it('Preflight executes <bin> --version before any task is picked or spawned', async () => {
    const eventsLogFile = path.join(tmpDir, 'invocations.log');

    const fakeBin = path.join(tmpDir, 'fake-sequenced-opencode.mjs');
    await fs.writeFile(
      fakeBin,
      `#!${process.execPath}
import fs from 'node:fs';
const args = process.argv.slice(2);
const line = JSON.stringify({ args, timestamp: Date.now() }) + '\\n';
fs.appendFileSync(${JSON.stringify(eventsLogFile)}, line, 'utf8');

if (args.includes('--version')) {
  console.log('opencode 2.0.0');
  process.exit(0);
}

// Simulated opencode run
process.exit(0);
`,
      { mode: 0o755 },
    );

    // Create an approved spec with a pending task
    const spec = await createNewSpec(tmpDir, 'Sequenced Spec');
    await installLocalVerifier(tmpDir, spec.folderPath);
    const taskPath = path.join(spec.folderPath, 'tasks', '1.md');
    await fs.writeFile(
      taskPath,
      [
        '---',
        'title: When task runs after preflight',
        `verify: ${PASSING_VERIFY}`,
        'scope: []',
        'entry: []',
        'skills: []',
        '---',
        '## Acceptance',
        '- [ ] passes',
      ].join('\n'),
      'utf8',
    );
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      harness: 'opencode',
      opencode: {
        bin: fakeBin,
      },
    };

    const logLines: string[] = [];
    console.log = (...args: unknown[]) => {
      logLines.push(args.map(String).join(' '));
    };

    const opencodeAdapter = new OpencodeAdapter();
    await startWatcher(tmpDir, config, opencodeAdapter, { once: true });

    // Read invocations
    const rawInvocations = await fs.readFile(eventsLogFile, 'utf8');
    const invocations = rawInvocations
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));

    assert.ok(invocations.length >= 1, 'At least one invocation must have occurred');
    assert.deepEqual(invocations[0].args, ['--version'], 'First invocation must be --version');
    assert.ok(logLines.includes('opencode 2.0.0'));
  });

  it('Missing binary prints single clear line naming bin path and exits non-zero without dispatching tasks', async () => {
    const missingBinPath = path.join(tmpDir, 'nonexistent-opencode-bin');
    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      harness: 'opencode',
      opencode: {
        bin: missingBinPath,
      },
    };

    // Create an approved spec that should never be dispatched
    const spec = await createNewSpec(tmpDir, 'Undispatched Spec');
    await installLocalVerifier(tmpDir, spec.folderPath);
    const taskPath = path.join(spec.folderPath, 'tasks', '1.md');
    await fs.writeFile(
      taskPath,
      [
        '---',
        'title: Task should not run',
        `verify: ${PASSING_VERIFY}`,
        'scope: []',
        'entry: []',
        'skills: []',
        '---',
        '## Acceptance',
        '- [ ] passes',
      ].join('\n'),
      'utf8',
    );
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    let exitCode: number | undefined;
    const errorLines: string[] = [];

    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`PROCESS_EXIT_${exitCode}`);
    }) as unknown as typeof process.exit;

    console.error = (...args: unknown[]) => {
      errorLines.push(args.map(String).join(' '));
    };

    const opencodeAdapter = new OpencodeAdapter();

    await assert.rejects(
      async () => {
        await startWatcher(tmpDir, config, opencodeAdapter, { once: true });
      },
      /PROCESS_EXIT_1/,
      'Watcher must exit with non-zero code on missing binary',
    );

    assert.equal(exitCode, 1, 'Process exit code must be 1');
    assert.equal(errorLines.length, 1, 'Must print exactly a single clear line');
    assert.ok(
      errorLines[0].includes(missingBinPath),
      `Error line must name the binary path: ${errorLines[0]}`,
    );

    // Ensure no task lock was created or task dispatched
    const runningDir = path.join(spec.folderPath, '.run', 'running');
    const lockExists = await fs
      .stat(path.join(runningDir, '1.pid'))
      .then(() => true)
      .catch(() => false);
    assert.equal(lockExists, false, 'No task should be picked or spawned when preflight fails');
  });

  it('Failing binary prints single clear line naming bin path and exits non-zero without dispatching tasks', async () => {
    const failingBinPath = path.join(tmpDir, 'fake-failing-opencode.mjs');
    await fs.writeFile(
      failingBinPath,
      `#!${process.execPath}
console.error('Binary crash details');
process.exit(2);
`,
      { mode: 0o755 },
    );

    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      harness: 'opencode',
      opencode: {
        bin: failingBinPath,
      },
    };

    let exitCode: number | undefined;
    const errorLines: string[] = [];

    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`PROCESS_EXIT_${exitCode}`);
    }) as unknown as typeof process.exit;

    console.error = (...args: unknown[]) => {
      errorLines.push(args.map(String).join(' '));
    };

    const opencodeAdapter = new OpencodeAdapter();

    await assert.rejects(
      async () => {
        await startWatcher(tmpDir, config, opencodeAdapter, { once: true });
      },
      /PROCESS_EXIT_1/,
      'Watcher must exit with non-zero code on failing binary',
    );

    assert.equal(exitCode, 1, 'Process exit code must be 1');
    assert.equal(errorLines.length, 1, 'Must print exactly a single clear line');
    assert.ok(
      errorLines[0].includes(failingBinPath),
      `Error line must name the binary path: ${errorLines[0]}`,
    );
  });

  it('Missing binary in standalone child process exits non-zero and prints single line to stderr', async () => {
    const missingBinPath = path.join(tmpDir, 'missing-bin-child');
    const script = `
import { startWatcher } from './src/watcher/loop.js';
import { OpencodeAdapter } from './src/harness/opencode.js';
import { DEFAULT_CONFIG } from './src/core/config.js';

const config = {
  ...DEFAULT_CONFIG,
  harness: 'opencode',
  opencode: { bin: ${JSON.stringify(missingBinPath)} },
};

await startWatcher(${JSON.stringify(tmpDir)}, config, new OpencodeAdapter(), { once: true });
`;

    try {
      await execFileAsync(process.execPath, ['--import', 'tsx', '-e', script], {
        cwd: process.cwd(),
      });
      assert.fail('Child process should have exited non-zero');
    } catch (err: unknown) {
      const execErr = err as { code?: number; stderr?: string };
      assert.equal(execErr.code, 1, 'Process should exit with code 1');
      const stderr = (execErr.stderr || '').trim();
      const lines = stderr.split('\n');
      assert.equal(lines.length, 1, 'Stderr should contain exactly a single line');
      assert.ok(lines[0].includes(missingBinPath), `Stderr should name the bin path: ${lines[0]}`);
    }
  });

  it('Successful execution logs resolved version string and proceeds to task cycle', async () => {
    const fakeBin = path.join(tmpDir, 'fake-success-opencode.mjs');
    const expectedVersion = 'opencode 3.4.5-beta.1';

    await fs.writeFile(
      fakeBin,
      `#!${process.execPath}
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('${expectedVersion}');
  process.exit(0);
}

// When task is spawned, write simulated result
const taskNumIndex = process.env.OSQ_TASK_NUMBER;
const specDir = process.env.OSQ_SPEC_FOLDER;
if (taskNumIndex && specDir) {
  const resultPath = path.join(specDir, '.run', 'results', \`\${taskNumIndex}.md\`);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, '# Results\\n## Changed\\n- Done\\n', 'utf8');
}
process.exit(0);
`,
      { mode: 0o755 },
    );

    // Create an approved spec with a task
    const spec = await createNewSpec(tmpDir, 'Success Spec');
    await installLocalVerifier(tmpDir, spec.folderPath);
    const taskPath = path.join(spec.folderPath, 'tasks', '1.md');
    await fs.writeFile(
      taskPath,
      [
        '---',
        'title: When preflight succeeds and runs task',
        `verify: ${PASSING_VERIFY}`,
        'scope: []',
        'entry: []',
        'skills: []',
        '---',
        '## Acceptance',
        '- [ ] passes',
      ].join('\n'),
      'utf8',
    );
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      harness: 'opencode',
      opencode: {
        bin: fakeBin,
      },
    };

    const logLines: string[] = [];
    console.log = (...args: unknown[]) => {
      logLines.push(args.map(String).join(' '));
    };

    const opencodeAdapter = new OpencodeAdapter();
    await startWatcher(tmpDir, config, opencodeAdapter, { once: true });

    // Assert that the resolved version string was logged
    assert.ok(
      logLines.some((line) => line.includes(expectedVersion)),
      `Expected logs to contain resolved version string "${expectedVersion}", got: ${JSON.stringify(logLines)}`,
    );

    // Assert that task cycle proceeded and completed the task
    const folderName = path.basename(spec.folderPath);
    const archivedPath = path.join(
      getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir),
      folderName,
    );
    const doneMarker = path.join(archivedPath, '.run', 'done', '1');
    const doneStat = await fs.stat(doneMarker).catch(() => null);
    assert.ok(doneStat, 'Task should have completed and done marker created');
  });

  it('preflightOpencode helper resolves binary from config or environment and returns version info', async () => {
    const fakeBin = path.join(tmpDir, 'fake-standalone-opencode.mjs');
    await fs.writeFile(
      fakeBin,
      `#!${process.execPath}
console.log('opencode 4.0.0');
process.exit(0);
`,
      { mode: 0o755 },
    );

    // Via config
    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      opencode: { bin: fakeBin },
    };

    const logLines: string[] = [];
    console.log = (...args: unknown[]) => {
      logLines.push(args.map(String).join(' '));
    };

    const res1 = await preflightOpencode(tmpDir, config);
    assert.equal(res1.version, 'opencode 4.0.0');
    assert.equal(res1.bin, fakeBin);
    assert.ok(logLines.includes('opencode 4.0.0'));

    // Via OPENCODE_PATH env
    process.env.OPENCODE_PATH = fakeBin;
    const res2 = await preflightOpencode(tmpDir);
    assert.equal(res2.version, 'opencode 4.0.0');
    assert.equal(res2.bin, fakeBin);
  });
});
