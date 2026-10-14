import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createForwardedRunner } from '../src/cli/remote-commands.js';
import { type RemotePlanOutputs, planOnServer, remoteWorkRoot } from '../src/cli/remote-plan.js';
import type { RemoteServer } from '../src/cli/remote-transport.js';
import { type OsqConfig, loadConfig } from '../src/core/foundation/config.js';
import { formatNextStep, readNextStep } from '../src/core/status/next-step.js';
import type { ForwardedCommand, ForwardedCommandRunner } from '../src/core/web/web-remote.js';
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

const FOLDER = '001-demo';
const MANIFEST = '{"state":"planned"}\n';
const CHANGE_PATH = path.join('openspec', 'changes', FOLDER);

let root: string;
let home: string;
let uiDir: string;
let config: OsqConfig;
let handles: WebServerHandle[];

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

/** Start a server over the fixture project with the given forwarded runner. */
async function startServer(runCommand: ForwardedCommandRunner): Promise<RemoteServer> {
  const handle = await startWebServer({
    projectRoot: root,
    config,
    port: 0,
    uiDir,
    site: { name: 'box', project: 'osq' },
    runCommand,
  });
  handles.push(handle);
  return {
    base: `http://127.0.0.1:${handle.port}/p/osq/`,
    host: `127.0.0.1:${handle.port}`,
    project: 'osq',
  };
}

/** The server's own stdout for one forwarded command. */
async function serverStdout(
  runCommand: ForwardedCommandRunner,
  request: ForwardedCommand,
): Promise<string> {
  const chunks: string[] = [];
  await runCommand(request, (output) => {
    if (output.stream === 'stdout') chunks.push(output.text);
  });
  return chunks.join('');
}

/** The next step the server records for the change. */
async function nextStep(): Promise<string> {
  return formatNextStep(await readNextStep(root, path.join(root, CHANGE_PATH), config));
}

/** The handoff "Plan paste block" defines for a working copy, with no Claude command. */
function expectedHandoff(folderPath: string, next: string): string {
  const promptPath = path.join(folderPath, 'plan-prompt.md');
  return `${folderPath}: ask your planning tool to plan change ${FOLDER} \u2014 next: ${next}\n\nPaste this into a new agent session to plan it:\n\nYou are the planner for osq change ${FOLDER}.\nRead ${promptPath} and follow it exactly; it is your complete prompt.\n`;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-remote-plan-handoff-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-remote-plan-handoff-home-'));
  uiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-remote-plan-handoff-ui-'));
  handles = [];
  await fs.writeFile(path.join(uiDir, 'index.html'), '<!doctype html><div id="root"></div>');
  await installFakeValidator(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await write(path.join(CHANGE_PATH, 'brief.md'), 'Brief body for demo.\n');
  await write(path.join(CHANGE_PATH, 'proposal.md'), PROPOSAL);
  await write(path.join(CHANGE_PATH, 'tasks', '1.md'), TASK);
  await write(path.join(CHANGE_PATH, '.run', 'manifest.json'), MANIFEST);
  await write(path.join('.claude', 'commands', 'osq-plan.md'), '# osq plan\n');
  config = await loadConfig(root);
});

afterEach(async () => {
  for (const handle of handles) await handle.close();
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
  await fs.rm(uiDir, { recursive: true, force: true });
});

describe('planOnServer handoff', () => {
  it('downloads the working copy and prints the handoff table for it', async () => {
    const server = await startServer(createForwardedRunner(root, { home }));
    const serverText = await serverStdout(createForwardedRunner(root, { home }), {
      command: 'plan',
      args: ['001'],
      options: {},
    });
    assert.ok(serverText.includes('/osq-plan 001'), serverText);

    const cap = capture();
    await planOnServer(server, { command: 'plan', args: ['001'], options: {} }, cap.outputs);

    const folderPath = path.join(remoteWorkRoot(server, home), FOLDER);
    assert.deepEqual(
      await readFiles(folderPath),
      await readFiles(path.join(root, CHANGE_PATH)),
      'the working copy holds exactly the server folder files, `.run/` left out',
    );
    assert.ok(await fs.stat(path.join(folderPath, 'plan-prompt.md')));
    assert.equal(await fs.stat(path.join(folderPath, '.run')).catch(() => null), null);
    assert.equal(cap.stderr.join(''), '');

    const output = cap.stdout.join('');
    assert.equal(output, expectedHandoff(folderPath, await nextStep()));
    for (const line of output.split('\n')) {
      assert.ok(!line.includes('/osq-plan'), `no line holds /osq-plan: ${line}`);
    }
  });

  it('prints every line before the handoff line unchanged', async () => {
    const base = createForwardedRunner(root, { home });
    const runCommand: ForwardedCommandRunner = async (request, emit) => {
      if (request.command === 'plan') emit({ stream: 'stdout', text: 'server preamble\n' });
      return base(request, emit);
    };
    const server = await startServer(runCommand);
    const cap = capture();
    await planOnServer(server, { command: 'plan', args: ['001'], options: {} }, cap.outputs);

    const folderPath = path.join(remoteWorkRoot(server, home), FOLDER);
    const output = cap.stdout.join('');
    assert.equal(output, `server preamble\n${expectedHandoff(folderPath, await nextStep())}`);
  });
});
