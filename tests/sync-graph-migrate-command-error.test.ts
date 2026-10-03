import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import { type GraphCommandOptions, graphCommand } from '../src/cli/graph.js';
import { type MigrateCommandOptions, migrateCommand } from '../src/cli/migrate.js';
import { type SyncCommandOptions, syncCommand } from '../src/cli/sync.js';
import { DEFAULT_CONFIG, defineConfig } from '../src/core/foundation/config.js';
import { OSQ_SYNC_NEEDS_GIT } from '../src/core/vcs/sync-change.js';
import { runCliCaptured } from './cli-capture.js';

const VCS_OFF = defineConfig({ vcs: { enabled: false } });
const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function tempDir(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(root);
  return root;
}

async function write(root: string, relative: string, content: string): Promise<void> {
  const full = path.join(root, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

/** Assert a rejection and return the `CommandError` it carries. */
async function rejectCommand(promise: Promise<unknown>): Promise<CommandError> {
  let caught: unknown;
  await assert.rejects(promise, (error: unknown) => {
    caught = error;
    return true;
  });
  assert.ok(caught instanceof CommandError, `expected a CommandError, got ${String(caught)}`);
  return caught;
}

describe('sync, graph, and migrate command errors', () => {
  it('the three option types have no exit option', () => {
    // @ts-expect-error `exit` was removed from `SyncCommandOptions`.
    const sync: SyncCommandOptions = { exit: () => {} };
    // @ts-expect-error `exit` was removed from `GraphCommandOptions`.
    const graph: GraphCommandOptions = { exit: () => {} };
    // @ts-expect-error `exit` was removed from `MigrateCommandOptions`.
    const migrate: MigrateCommandOptions = { exit: () => {} };
    assert.ok(sync);
    assert.ok(graph);
    assert.ok(migrate);
  });

  it('syncCommand rejects with its refusal line, prints nothing, and leaves the exit code alone', async () => {
    const root = await tempDir('osq-sync-command-error-');
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;
    let stdout = '';
    let stderr = '';
    let error: CommandError;
    try {
      error = await rejectCommand(
        syncCommand('001', {
          cwd: root,
          config: VCS_OFF,
          stdout: (msg) => {
            stdout += msg;
          },
          stderr: (msg) => {
            stderr += msg;
          },
        }),
      );
      assert.equal(process.exitCode, undefined, 'the command must not set process.exitCode');
    } finally {
      process.exitCode = originalExitCode;
    }

    assert.equal(error.name, 'CommandError');
    assert.equal(error.message, OSQ_SYNC_NEEDS_GIT);
    assert.equal(error.exitCode, 1);
    assert.equal(stdout, '');
    assert.equal(stderr, '');
  });

  it('graphCommand rejects with its config error, prints nothing, and leaves the exit code alone', async () => {
    const root = await tempDir('osq-graph-command-error-');
    await write(root, 'osq.config.ts', "throw new Error('config exploded');\n");
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;
    let stdout = '';
    let stderr = '';
    let error: CommandError;
    try {
      error = await rejectCommand(
        graphCommand({
          cwd: root,
          json: true,
          stdout: (msg) => {
            stdout += msg;
          },
          stderr: (msg) => {
            stderr += msg;
          },
        }),
      );
      assert.equal(process.exitCode, undefined, 'the command must not set process.exitCode');
    } finally {
      process.exitCode = originalExitCode;
    }

    assert.equal(error.name, 'CommandError');
    assert.match(error.message, /config exploded/);
    assert.match(error.message, /osq\.config\.ts/);
    assert.equal(error.exitCode, 1);
    assert.equal(stdout, '');
    assert.equal(stderr, '');
  });

  it('migrateCommand logs the unsupported target then rejects with an empty CommandError', async () => {
    const root = await tempDir('osq-migrate-target-error-');
    const messages: string[] = [];
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;
    let error: CommandError;
    try {
      error = await rejectCommand(
        migrateCommand('legacy', {
          cwd: root,
          config: DEFAULT_CONFIG,
          logger: { info: () => {}, error: (message) => messages.push(message) },
        }),
      );
      assert.equal(process.exitCode, undefined, 'the command must not set process.exitCode');
    } finally {
      process.exitCode = originalExitCode;
    }

    assert.equal(error.name, 'CommandError');
    assert.equal(error.message, '');
    assert.equal(error.exitCode, 1);
    assert.ok(
      messages.some((message) => message.includes('unsupported migrate target')),
      JSON.stringify(messages),
    );
  });

  it('migrateCommand logs the failure then rejects with an empty CommandError', async () => {
    const root = await tempDir('osq-migrate-failure-error-');
    await write(root, 'openspec', 'not a directory\n');
    const messages: string[] = [];
    const error = await rejectCommand(
      migrateCommand('openspec', {
        cwd: root,
        config: DEFAULT_CONFIG,
        logger: { info: () => {}, error: (message) => messages.push(message) },
      }),
    );

    assert.equal(error.name, 'CommandError');
    assert.equal(error.message, '');
    assert.equal(error.exitCode, 1);
    assert.ok(
      messages.some((message) => message.startsWith('migration failed:')),
      JSON.stringify(messages),
    );
  });

  it('osq sync prints the refusal and exits 1 through runCli', async () => {
    const root = await tempDir('osq-sync-command-cli-');
    await write(root, 'osq.config.ts', 'export default { vcs: { enabled: false } };\n');

    const capture = await runCliCaptured(root, ['sync', '001']);

    assert.equal(capture.exitCode, 1);
    assert.deepEqual(capture.lines, [{ stream: 'stderr', text: OSQ_SYNC_NEEDS_GIT }]);
  });

  it('osq graph prints the config error and exits 1 through runCli', async () => {
    const root = await tempDir('osq-graph-command-cli-');
    await write(root, 'osq.config.ts', "throw new Error('config exploded');\n");

    const capture = await runCliCaptured(root, ['graph', '--json']);

    assert.equal(capture.exitCode, 1);
    assert.equal(
      capture.lines.some((line) => line.stream === 'stdout'),
      false,
    );
    const stderr = capture.lines
      .filter((line) => line.stream === 'stderr')
      .map((line) => line.text)
      .join('\n');
    assert.match(stderr, /config exploded/);
    assert.match(stderr, /osq\.config\.ts/);
  });

  it('osq migrate logs the refusal and exits 1 through runCli', async () => {
    const root = await tempDir('osq-migrate-command-cli-');

    const capture = await runCliCaptured(root, ['migrate', 'legacy']);

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.match(capture.stderr, /unsupported migrate target/);
  });
});
