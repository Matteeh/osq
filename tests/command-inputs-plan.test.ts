import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { planCommand } from '../src/cli/plan.js';
import { loadConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { runCliCaptured } from './cli-capture.js';
import { installFakeValidator } from './helpers.js';

const CONFIG_SOURCE = `export default {
  harness: 'mock',
  queue: { maxPlanningSessions: 10, maxPlanningCost: 100 },
};
`;

const QUEUE = ['## [alpha] Alpha', 'Depends on: nothing', '', 'Alpha brief body.', ''].join('\n');

const ENV_KEYS = [
  'CODEX_HOME',
  'OSQ_CLAUDE_PROJECTS_DIR',
  'CLAUDE_CONFIG_DIR',
  'OPENCODE_PATH',
] as const;
const ORIGINAL_ENV = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

function resetEnv(): void {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV.get(key);
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
}

async function write(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** A command's writers, appending each exact chunk to a string. */
interface Writers {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

interface Captured {
  readonly stdout: string;
  readonly stderr: string;
}

/** Run the command directly, proving no byte reaches the process streams. */
async function captureDirect(run: (writers: Writers) => Promise<unknown>): Promise<Captured> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const leaked: string[] = [];
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  const record = (chunk: string | Uint8Array): boolean => {
    leaked.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
  process.stdout.write = record as typeof process.stdout.write;
  process.stderr.write = record as typeof process.stderr.write;
  try {
    await run({ stdout: (text) => stdout.push(text), stderr: (text) => stderr.push(text) });
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }
  assert.deepEqual(leaked, [], 'the direct call wrote to a process stream');
  return { stdout: stdout.join(''), stderr: stderr.join('') };
}

let root: string;

beforeEach(() => {
  resetEnv();
  process.exitCode = undefined;
});

afterEach(async () => {
  resetEnv();
  process.exitCode = undefined;
  await fs.rm(root, { recursive: true, force: true });
});

/**
 * Reset one fixed project path to the same queue-with-incomplete-cost state and
 * return it, so the CLI and the direct call name the same absolute paths.
 */
async function freshProject(): Promise<string> {
  root ??= await fs.mkdtemp(path.join(os.tmpdir(), 'osq-command-inputs-plan-'));
  const project = path.join(root, 'project');
  await fs.rm(project, { recursive: true, force: true });
  await fs.mkdir(project, { recursive: true });
  await installFakeValidator(project);
  await scaffoldProject(project);
  await write(project, 'osq.config.ts', CONFIG_SOURCE);
  await write(project, 'openspec/queue.md', QUEUE);
  await write(
    project,
    'openspec/changes/rejected/090-retired/brief.md',
    '---\nqueue_item: retired\n---\nbody\n',
  );
  await write(
    project,
    'openspec/changes/rejected/090-retired/.run/plan.jsonl',
    `${JSON.stringify({
      type: 'plan_started',
      sessionId: 's1',
      timestamp: '2026-01-01T00:00:00.000Z',
      data: { harness: 'mock', model: 'm', osqVersion: '0.0.0', briefHash: 'sha256:x' },
    })}\n`,
  );
  await write(project, 'brief-source.md', '# Brief\n\nPlan the change.\n');
  process.env.CODEX_HOME = path.join(project, 'missing-codex');
  process.env.OSQ_CLAUDE_PROJECTS_DIR = path.join(project, 'missing-claude');
  process.env.CLAUDE_CONFIG_DIR = path.join(project, 'missing-claude-config');
  return project;
}

describe('command inputs for plan', () => {
  it('osq plan --next --print prints the same bytes directly and through runCli', async () => {
    const cliProject = await freshProject();
    const cli = await runCliCaptured(cliProject, ['plan', '--next', '--print']);
    assert.equal(cli.exitCode, undefined, JSON.stringify(cli.lines));

    const directProject = await freshProject();
    const config = await loadConfig(directProject);
    const direct = await captureDirect((writers) =>
      planCommand(undefined, {
        next: true,
        print: true,
        cwd: directProject,
        config,
        ...writers,
      }),
    );

    assert.equal(direct.stdout, cli.stdout, 'stdout differs for osq plan --next --print');
    assert.equal(direct.stderr, cli.stderr, 'stderr differs for osq plan --next --print');
    assert.match(direct.stdout, /# Change: \d+ - Alpha/);
  });

  it('writes the handoff line to the passed stdout', async () => {
    const project = await freshProject();
    const config = await loadConfig(project);
    const direct = await captureDirect((writers) =>
      planCommand('handoff-direct', {
        brief: path.join(project, 'brief-source.md'),
        cwd: project,
        config,
        ...writers,
      }),
    );

    assert.match(direct.stdout, /ask your planning tool to plan change \d+-handoff-direct/);
    assert.ok(direct.stdout.endsWith('\n'), 'the handoff line ends with a newline');
    assert.equal(direct.stderr, '');
  });
});
