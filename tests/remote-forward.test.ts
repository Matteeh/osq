import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveCommand } from '../src/cli/approve.js';
import { CommandError } from '../src/cli/command-error.js';
import type { Writer } from '../src/cli/command-inputs.js';
import type { LandCommandOptions, landCommand } from '../src/cli/land.js';
import { lintCommand } from '../src/cli/lint.js';
import { queryCommand } from '../src/cli/query.js';
import {
  type ForwardedCommands,
  createForwardedCommands,
  createForwardedRunner,
} from '../src/cli/remote-commands.js';
import { type RemoteServer, runOnServer } from '../src/cli/remote-transport.js';
import { reportCommand } from '../src/cli/report.js';
import { showCommand } from '../src/cli/show.js';
import { specCommand } from '../src/cli/spec.js';
import { statusCommand } from '../src/cli/status.js';
import { type OsqConfig, defineConfig, loadConfig } from '../src/core/foundation/config.js';
import type { WebServerHandle } from '../src/core/web/web-server.js';
import { startWebServer } from '../src/core/web/web-server.js';

const PROPOSAL = [
  '---',
  'title: Demo Change',
  'depends_on: []',
  'verify: node -e "process.exit(0)"',
  '---',
  '## Goal',
  'Demo goal.',
  '',
].join('\n');

const TASK = [
  '---',
  'title: Task one',
  'verify: node -e "process.exit(0)"',
  'scope: []',
  'entry: []',
  'skills: []',
  '---',
  '## Acceptance',
  '- [ ] done',
  '',
].join('\n');

/** A command's writers, appending each exact chunk to a string. */
interface Writers {
  readonly stdout: Writer;
  readonly stderr: Writer;
}

let project: string;
let home: string;
let config: OsqConfig;
let uiDir: string;
const handles: WebServerHandle[] = [];

async function write(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-remote-forward-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-remote-forward-home-'));
  uiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-remote-forward-ui-'));
  await write(
    project,
    'openspec/queue.md',
    '## [demo] Demo\nDepends on: nothing\n\nBrief body for demo.\n',
  );
  await write(project, 'openspec/changes/001-demo/proposal.md', PROPOSAL);
  await write(project, 'openspec/changes/001-demo/tasks/1.md', TASK);
  await write(
    project,
    'openspec/changes/001-demo/brief.md',
    '---\nqueue_item: demo\n---\nBrief body for demo.\n',
  );
  await fs.writeFile(path.join(uiDir, 'index.html'), '<!doctype html><div id="root"></div>');
  config = await loadConfig(project);
});

afterEach(async () => {
  while (handles.length > 0) await handles.pop()?.close();
  await fs.rm(project, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
  await fs.rm(uiDir, { recursive: true, force: true });
});

/** Start the real server over the fixture with the forwarded runner. */
async function start(): Promise<RemoteServer> {
  const handle = await startWebServer({
    projectRoot: project,
    config: defineConfig({ serve: { port: 0 } }),
    port: 0,
    uiDir,
    site: { name: 'box', project: 'osq' },
    runCommand: createForwardedRunner(project, { home }),
  });
  handles.push(handle);
  return {
    base: `http://127.0.0.1:${handle.port}/p/osq/`,
    host: `127.0.0.1:${handle.port}`,
    project: 'osq',
  };
}

/** One row of the "Same output as local" table. */
interface Row {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: Readonly<Record<string, unknown>>;
  run(writers: Writers): Promise<unknown>;
}

function rows(): Row[] {
  const base = { cwd: project, config };
  return [
    {
      command: 'status',
      args: [],
      options: {},
      run: ({ stdout, stderr }) => statusCommand({ ...base, stdout, stderr, home }),
    },
    {
      command: 'show',
      args: ['001'],
      options: {},
      run: ({ stdout, stderr }) => showCommand('001', { ...base, stdout, stderr }),
    },
    {
      command: 'spec',
      args: [],
      options: {},
      run: ({ stdout, stderr }) => specCommand(undefined, undefined, { ...base, stdout, stderr }),
    },
    {
      command: 'query',
      args: [],
      options: {},
      run: ({ stdout, stderr }) => queryCommand({ ...base, stdout, stderr }),
    },
    {
      command: 'report',
      args: [],
      options: { json: true },
      run: ({ stdout, stderr }) => reportCommand({ ...base, json: true, stdout, stderr, home }),
    },
    {
      command: 'lint',
      args: ['001'],
      options: {},
      run: ({ stdout, stderr }) => lintCommand(['001'], { ...base, stdout, stderr }),
    },
    {
      command: 'approve',
      args: ['999'],
      options: {},
      run: ({ stdout, stderr }) =>
        approveCommand(['999'], { ...base, stdout, stderr, isTerminal: () => false }),
    },
  ];
}

describe('forwarded commands', () => {
  it('gives the same streams and exit code as the local call for every row', async () => {
    const server = await start();
    for (const row of rows()) {
      const directStdout: string[] = [];
      const directStderr: string[] = [];
      let localError: CommandError | undefined;
      try {
        await row.run({
          stdout: (text) => directStdout.push(text),
          stderr: (text) => directStderr.push(text),
        });
      } catch (error) {
        assert.ok(error instanceof CommandError, `${row.command} threw a non-CommandError`);
        localError = error;
      }

      const forwardedStdout: string[] = [];
      const forwardedStderr: string[] = [];
      const end = await runOnServer(
        server,
        { command: row.command, args: row.args, options: row.options },
        (text) => forwardedStdout.push(text),
        (text) => forwardedStderr.push(text),
      );

      assert.equal(forwardedStdout.join(''), directStdout.join(''), `${row.command} stdout`);
      assert.equal(forwardedStderr.join(''), directStderr.join(''), `${row.command} stderr`);
      if (localError === undefined) {
        assert.deepEqual(end, { exitCode: 0, error: null, next: null }, `${row.command} end`);
      } else {
        assert.equal(end.exitCode, localError.exitCode, `${row.command} exit code`);
        assert.equal(
          end.error,
          localError.message === '' ? null : localError.message,
          `${row.command} message`,
        );
        assert.equal(end.next, localError.next ?? null, `${row.command} next`);
      }
    }
  });

  it('keeps a failure exit code and next step and wraps any other error', async () => {
    const commands: ForwardedCommands = {
      boom: async () => {
        throw new CommandError('Error approving 001:', { exitCode: 1, next: 'osq lint 001' });
      },
      oops: async () => {
        throw new Error('boom');
      },
    };
    const runner = createForwardedRunner(project, { commands });
    assert.deepEqual(await runner({ command: 'boom', args: [], options: {} }, () => {}), {
      exitCode: 1,
      error: 'Error approving 001:',
      next: 'osq lint 001',
    });
    assert.deepEqual(await runner({ command: 'oops', args: [], options: {} }, () => {}), {
      exitCode: 1,
      error: 'Error: boom',
      next: null,
    });
    assert.deepEqual(await runner({ command: 'nope', args: [], options: {} }, () => {}), {
      exitCode: 1,
      error: 'osq nope does not run on a server',
      next: null,
    });
  });

  it('calls an injected land with publish true and the runner cwd', async () => {
    const calls: Array<{ readonly id: string; readonly options: LandCommandOptions }> = [];
    const recording: typeof landCommand = async (id, options = {}) => {
      calls.push({ id, options });
    };
    const runner = createForwardedRunner(project, {
      commands: createForwardedCommands(recording),
    });
    await runner({ command: 'land', args: ['001'], options: {} }, () => {});
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.id, '001');
    assert.equal(calls[0]?.options.publish, true);
    assert.equal(calls[0]?.options.cwd, project);
  });

  it('starts a read at once and a write only after the write before it ends', async () => {
    const started: string[] = [];
    const releases: Record<string, () => void> = {};
    const gate = (name: string): Promise<void> =>
      new Promise((resolve) => {
        started.push(name);
        releases[name] = resolve;
      });
    const commands: ForwardedCommands = {
      approve: () => gate('approve'),
      retry: () => gate('retry'),
      status: async () => {
        started.push('status');
      },
    };
    const runner = createForwardedRunner(project, { commands });
    const approve = runner({ command: 'approve', args: [], options: {} }, () => {});
    const retry = runner({ command: 'retry', args: [], options: {} }, () => {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    const status = runner({ command: 'status', args: [], options: {} }, () => {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(started, ['approve', 'status']);
    releases.approve?.();
    await approve;
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(started, ['approve', 'status', 'retry']);
    releases.retry?.();
    await retry;
    await status;
  });

  it('refuses a forwarded plan that names no briefed change', async () => {
    const runner = createForwardedRunner(project, { home });
    const end = await runner({ command: 'plan', args: ['demo'], options: {} }, () => {});
    assert.deepEqual(end, {
      exitCode: 1,
      error:
        'osq plan demo on a server needs an unapproved change with a brief; queue the brief and run osq plan --next',
      next: null,
    });
    assert.deepEqual(await fs.readdir(path.join(project, 'openspec', 'changes')), ['001-demo']);
  });
});
