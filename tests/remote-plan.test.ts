import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import { lintCommand } from '../src/cli/lint.js';
import { createForwardedRunner } from '../src/cli/remote-commands.js';
import {
  type RemotePlanOutputs,
  lintOnServer,
  planOnServer,
  remoteWorkRoot,
} from '../src/cli/remote-plan.js';
import type { RemoteServer } from '../src/cli/remote-transport.js';
import { loadConfig } from '../src/core/foundation/config.js';
import { type WebServerHandle, startWebServer } from '../src/core/web/web-server.js';
import { installFakeValidator } from './helpers.js';

const PROPOSAL = [
  '---',
  'title: Demo Change',
  'depends_on: []',
  'verify: node verify.cjs',
  'features:',
  '  reads: []',
  '---',
  '## Goal',
  'Demo goal.',
  '',
  '## Surface',
  'None.',
  '',
  '## Human steps',
  'None',
  '',
].join('\n');

const TASK = [
  '---',
  'title: Task one',
  'verify: node verify.cjs',
  'scope: []',
  'entry: []',
  'skills: []',
  '---',
  '## Acceptance',
  '- [ ] done',
  '',
].join('\n');

const NEW_PROPOSAL = PROPOSAL.replace('Demo goal.', 'New demo goal.');
const FOLDER = '001-demo';
const MANIFEST = '{"state":"planned"}\n';

let root: string;
let home: string;
let uiDir: string;
let handle: WebServerHandle;
let server: RemoteServer;

/** A command's outputs plus the exact string chunks each writer received. */
interface Captured {
  readonly stdout: string[];
  readonly stderr: string[];
  readonly outputs: RemotePlanOutputs;
}

/** Collect the writers a command receives, rooted at the test's home. */
function capture(): Captured {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    outputs: {
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
      home,
    },
  };
}

async function write(rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** Every text file under `dir` except those under `.run/`, keyed `/`-separated. */
async function readFiles(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const walk = async (current: string, prefix: string): Promise<void> => {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (prefix === '' && entry.name === '.run') continue;
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full, rel);
      else if (entry.isFile()) files[rel] = await fs.readFile(full, 'utf8');
    }
  };
  await walk(dir, '');
  return files;
}

/** Run one command and resolve the value it threw. */
async function captureError(run: () => Promise<void>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('the command resolved unexpectedly');
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-remote-plan-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-remote-plan-home-'));
  uiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-remote-plan-ui-'));
  await fs.writeFile(path.join(uiDir, 'index.html'), '<!doctype html><div id="root"></div>');
  await installFakeValidator(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await write(`openspec/changes/${FOLDER}/brief.md`, 'Brief body for demo.\n');
  await write(`openspec/changes/${FOLDER}/proposal.md`, PROPOSAL);
  await write(`openspec/changes/${FOLDER}/tasks/1.md`, TASK);
  await write(`openspec/changes/${FOLDER}/.run/manifest.json`, MANIFEST);
  handle = await startWebServer({
    projectRoot: root,
    config: await loadConfig(root),
    port: 0,
    uiDir,
    site: { name: 'box', project: 'osq' },
    runCommand: createForwardedRunner(root, { home }),
  });
  server = {
    base: `http://127.0.0.1:${handle.port}/p/osq/`,
    host: `127.0.0.1:${handle.port}`,
    project: 'osq',
  };
});

afterEach(async () => {
  await handle.close();
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
  await fs.rm(uiDir, { recursive: true, force: true });
});

describe('planOnServer', () => {
  it('downloads the working copy and rewrites the handoff line', async () => {
    const cap = capture();
    await planOnServer(server, { command: 'plan', args: ['001'], options: {} }, cap.outputs);

    const folderPath = path.join(remoteWorkRoot(server, home), FOLDER);
    assert.deepEqual(Object.keys(await readFiles(folderPath)).sort(), [
      'brief.md',
      'plan-prompt.md',
      'proposal.md',
      'tasks/1.md',
    ]);
    assert.equal(await fs.stat(path.join(folderPath, '.run')).catch(() => null), null);
    assert.equal(cap.stderr.join(''), '');

    const output = cap.stdout.join('');
    const prefix = `${folderPath}: ask your planning tool to plan change ${FOLDER} \u2014 next: `;
    assert.ok(output.startsWith(prefix), output);
    assert.ok(output.endsWith('\n'), output);
    assert.ok(output.length > prefix.length, output);
  });

  it('passes the server output through unchanged with --print and downloads nothing', async () => {
    const cap = capture();
    await planOnServer(
      server,
      { command: 'plan', args: ['001'], options: { print: true } },
      cap.outputs,
    );

    assert.ok(cap.stdout.join('').includes("## This repository's record"), cap.stdout.join(''));
    assert.equal(await fs.stat(remoteWorkRoot(server, home)).catch(() => null), null);
  });

  it('throws the failure of a plan without a brief as a CommandError', async () => {
    const cap = capture();
    const error = await captureError(() =>
      planOnServer(server, { command: 'plan', args: ['demo'], options: {} }, cap.outputs),
    );

    assert.ok(error instanceof CommandError);
    assert.equal(error.exitCode, 1);
    assert.equal(
      error.message,
      'osq plan demo on a server needs an unapproved change with a brief; queue the brief and run osq plan --next',
    );
    assert.equal(error.next, undefined);
  });
});

describe('lintOnServer', () => {
  it('uploads the working copy before linting and matches the local output', async () => {
    await planOnServer(server, { command: 'plan', args: ['001'], options: {} }, capture().outputs);
    const folderPath = path.join(remoteWorkRoot(server, home), FOLDER);
    await fs.writeFile(path.join(folderPath, 'proposal.md'), NEW_PROPOSAL);
    await fs.rm(path.join(folderPath, 'tasks', '1.md'));
    await fs.writeFile(path.join(folderPath, 'tasks', '2.md'), TASK);

    const forwarded = capture();
    await lintOnServer(server, { command: 'lint', args: ['001'], options: {} }, forwarded.outputs);

    const serverFolder = path.join(root, 'openspec', 'changes', FOLDER);
    assert.deepEqual(await readFiles(serverFolder), await readFiles(folderPath));
    assert.equal(await fs.readFile(path.join(serverFolder, 'proposal.md'), 'utf8'), NEW_PROPOSAL);
    assert.equal(await fs.stat(path.join(serverFolder, 'tasks', '1.md')).catch(() => null), null);
    assert.equal(
      await fs.readFile(path.join(serverFolder, '.run', 'manifest.json'), 'utf8'),
      MANIFEST,
    );

    const local = capture();
    await lintCommand(['001'], {
      cwd: root,
      stdout: local.outputs.stdout,
      stderr: local.outputs.stderr,
    });
    assert.equal(forwarded.stdout.join(''), local.stdout.join(''));
    assert.equal(forwarded.stderr.join(''), local.stderr.join(''));
  });

  it('uploads nothing for lint with no ids', async () => {
    await planOnServer(server, { command: 'plan', args: ['001'], options: {} }, capture().outputs);
    const forwarded = capture();
    await lintOnServer(server, { command: 'lint', args: [], options: {} }, forwarded.outputs);

    const local = capture();
    await lintCommand([], {
      cwd: root,
      stdout: local.outputs.stdout,
      stderr: local.outputs.stderr,
    });
    assert.equal(forwarded.stdout.join(''), local.stdout.join(''));
    assert.equal(forwarded.stderr.join(''), local.stderr.join(''));
  });

  it('fails with the transport error and lints nothing when the upload is refused', async () => {
    await planOnServer(server, { command: 'plan', args: ['001'], options: {} }, capture().outputs);
    const serverFolder = path.join(root, 'openspec', 'changes', FOLDER);
    await fs.writeFile(path.join(serverFolder, '.run', 'approved'), 'sha256:x\n');

    const forwarded = capture();
    const error = await captureError(() =>
      lintOnServer(server, { command: 'lint', args: ['001'], options: {} }, forwarded.outputs),
    );

    assert.ok(error instanceof CommandError);
    assert.equal(error.exitCode, 1);
    assert.equal(
      error.message,
      `osq server at ${server.base} refused the request (409): change ${FOLDER} is approved; only an unapproved change's files move`,
    );
    assert.equal(forwarded.stdout.join(''), '');
    assert.equal(
      await fs.stat(path.join(serverFolder, '.run', 'plan-ready')).catch(() => null),
      null,
    );
  });
});
