import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { installFakeValidator } from './helpers.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN_PATH = path.join(PROJECT_ROOT, 'src', 'cli', 'bin.ts');
const TSX_LOADER = createRequire(path.join(PROJECT_ROOT, 'package.json')).resolve('tsx');

const FOLDER = '001-demo';
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

const tmpDirs: string[] = [];
const children = new Set<ChildProcess>();

after(async () => {
  for (const child of children) {
    try {
      child.kill('SIGKILL');
    } catch {
      // Already gone.
    }
  }
  children.clear();
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

async function write(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** A temporary project with a mock harness, a fake validator and change `001-demo`. */
async function makeProject(): Promise<string> {
  const project = await tempDir('osq-mcp-cli-');
  await fs.writeFile(
    path.join(project, 'osq.config.ts'),
    "export default { harness: 'mock' }\n",
    'utf8',
  );
  await installFakeValidator(project);
  await write(project, `openspec/changes/${FOLDER}/proposal.md`, PROPOSAL);
  await write(project, `openspec/changes/${FOLDER}/tasks/1.md`, TASK);
  await write(
    project,
    `openspec/changes/${FOLDER}/brief.md`,
    '---\nqueue_item: demo\n---\nBrief body for demo.\n',
  );
  return project;
}

/** The env every spawned `osq mcp` gets, with no inherited `OSQ_SERVER`. */
function baseEnv(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, NO_COLOR: '1' };
  env.OSQ_SERVER = undefined;
  return env;
}

interface McpSession {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
}

/** Spawn `osq mcp --cwd <cwd>`, write every line, close stdin, and collect stdout. */
function runMcp(cwd: string, home: string, lines: readonly string[]): Promise<McpSession> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', TSX_LOADER, BIN_PATH, 'mcp', '--cwd', cwd], {
      cwd,
      env: baseEnv(home),
    });
    children.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      children.delete(child);
      resolve({ stdout, stderr, code });
    });
    for (const line of lines) child.stdin.write(`${line}\n`);
    child.stdin.end();
  });
}

/** Every non-empty stdout line as parsed JSON. */
function answerLines(stdout: string): Array<Record<string, unknown>> {
  return stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** The answer whose `id` is `id`. */
function answerFor(
  answers: readonly Record<string, unknown>[],
  id: number,
): Record<string, unknown> {
  const found = answers.find((answer) => answer.id === id);
  assert.ok(found, `no answer for id ${id}`);
  return found;
}

/** The first text content of a `tools/call` answer. */
function textOf(answer: Record<string, unknown>): string {
  const result = answer.result as { content?: Array<{ text?: string }> } | undefined;
  const content = result?.content?.[0];
  assert.ok(content, `answer has no content: ${JSON.stringify(answer)}`);
  return content.text ?? '';
}

describe('osq mcp over stdio', () => {
  it('A planning session over stdio', async () => {
    const project = await makeProject();
    const home = await tempDir('osq-mcp-cli-home-');
    const folder = path.join(project, 'openspec', 'changes', FOLDER);
    const requests = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'plan', arguments: { change: '001' } },
      },
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'write_file',
          arguments: { change: '001', path: 'tasks/1.md', text: 'hello mcp\n' },
        },
      },
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'read_file', arguments: { change: '001', path: 'tasks/1.md' } },
      },
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'write_file',
          arguments: { change: '001', path: '../x.md', text: 'nope' },
        },
      },
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'lint', arguments: { change: '001' } },
      },
    ];

    const session = await runMcp(
      project,
      home,
      requests.map((request) => JSON.stringify(request)),
    );
    assert.equal(session.code, 0, session.stderr);

    const answers = answerLines(session.stdout);
    assert.deepEqual(
      answers.map((answer) => answer.id).sort((a, b) => Number(a) - Number(b)),
      [1, 2, 3, 4, 5, 6, 7],
      session.stdout,
    );
    const wrote = answerFor(answers, 4);
    assert.equal(wrote.result !== undefined, true);
    assert.equal(textOf(wrote), 'wrote tasks/1.md (10 bytes)');

    assert.equal(textOf(answerFor(answers, 5)), 'hello mcp\n');

    const refused = answerFor(answers, 6);
    assert.equal((refused.result as { isError?: boolean }).isError, true);
    assert.equal(textOf(refused), 'path outside the change folder: ../x.md\n');

    assert.ok(await fs.stat(path.join(folder, 'plan-prompt.md')));
  });

  it('Not JSON', async () => {
    const project = await tempDir('osq-mcp-cli-invalid-');
    const home = await tempDir('osq-mcp-cli-invalid-home-');

    const session = await runMcp(project, home, ['not json']);

    assert.equal(session.code, 0, session.stderr);
    assert.deepEqual(answerLines(session.stdout), [
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
    ]);
  });
});
