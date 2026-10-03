import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CommandError } from '../src/cli/command-error.js';
import { prepareQueueSelection } from '../src/cli/plan-queue.js';
import { planCommand } from '../src/cli/plan.js';
import { DEFAULT_CONFIG, loadConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { readPlanRecords } from '../src/core/report/planning.js';
import { getChangesDir } from '../src/core/status/layout.js';
import { runCliCaptured } from './cli-capture.js';
import { installFakeValidator } from './helpers.js';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FAKE_PLANNER = path.join(TESTS_DIR, 'fixtures', 'planning', 'fake-planner.mjs');

const OPENCODE_CONFIG = `export default {
  harness: 'opencode',
  planner: { harness: 'opencode', model: 'oc-planner', agent: 'osq-planner' },
};
`;

const QUEUE = ['## [alpha] Alpha', 'Depends on: nothing', '', 'Alpha brief body.', ''].join('\n');

const ENV_KEYS = [
  'CODEX_HOME',
  'OSQ_CLAUDE_PROJECTS_DIR',
  'CLAUDE_CONFIG_DIR',
  'OPENCODE_PATH',
  'OSQ_FAKE_EXIT_CODE',
  'OSQ_FAKE_DELAY_MS',
] as const;
const ORIGINAL_ENV = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

function resetEnv(): void {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV.get(key);
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
}

async function writeAt(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

const projects: string[] = [];

async function createProject(config = OPENCODE_CONFIG): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-command-error-'));
  projects.push(project);
  await installFakeValidator(project);
  await scaffoldProject(project);
  await fs.writeFile(path.join(project, 'osq.config.ts'), config, 'utf8');
  await fs.writeFile(
    path.join(project, 'brief-source.md'),
    '# Command error brief\n\nPlan the change.\n',
    'utf8',
  );
  return project;
}

beforeEach(() => {
  resetEnv();
  process.exitCode = undefined;
});

afterEach(async () => {
  resetEnv();
  process.exitCode = undefined;
  for (const project of projects.splice(0)) {
    await fs.rm(project, { recursive: true, force: true });
  }
});

describe('prepareQueueSelection', () => {
  it('throws the refusal message as a CommandError and leaves the exit code alone', async () => {
    const project = await createProject();
    await writeAt(project, 'openspec/queue.md', '');

    await assert.rejects(
      () => prepareQueueSelection(project, DEFAULT_CONFIG, {}),
      (error: unknown) =>
        error instanceof CommandError &&
        error.name === 'CommandError' &&
        error.exitCode === 1 &&
        /No queue item is eligible to plan/.test(error.message),
    );
    assert.equal(process.exitCode, undefined);
  });

  it('still prints the incomplete-coverage notice and returns the selection', async () => {
    const project = await createProject(
      "export default { harness: 'mock', queue: { maxPlanningSessions: 10, maxPlanningCost: 100 } };\n",
    );
    await writeAt(project, 'openspec/queue.md', QUEUE);
    await writeAt(
      project,
      'openspec/changes/rejected/090-retired/brief.md',
      '---\nqueue_item: retired\n---\nbody\n',
    );
    await writeAt(
      project,
      'openspec/changes/rejected/090-retired/.run/plan.jsonl',
      `${JSON.stringify({
        type: 'plan_started',
        sessionId: 's1',
        timestamp: '2026-01-01T00:00:00.000Z',
        data: { harness: 'mock', model: 'm', osqVersion: '0.0.0', briefHash: 'sha256:x' },
      })}\n`,
    );

    const stderr: string[] = [];
    const selection = await prepareQueueSelection(project, await loadConfig(project), {}, (text) =>
      stderr.push(text),
    );

    assert.ok(selection, 'a ready selection is returned');
    assert.equal(selection.item.slug, 'alpha');
    assert.match(stderr.join(''), /coverage is incomplete/);
    assert.ok(stderr.join('').endsWith('\n'), 'the notice ends with a newline');
  });
});

describe('planCommand', () => {
  it('throws an empty CommandError with the planner exit code after recording plan_exited', async () => {
    const project = await createProject();
    process.env.OPENCODE_PATH = FAKE_PLANNER;
    process.env.OSQ_FAKE_EXIT_CODE = '3';
    process.env.OSQ_FAKE_DELAY_MS = '10';

    await assert.rejects(
      () =>
        planCommand('planner-exit', {
          brief: path.join(project, 'brief-source.md'),
          session: true,
          cwd: project,
        }),
      (error: unknown) =>
        error instanceof CommandError && error.exitCode === 3 && error.message === '',
    );
    assert.equal(process.exitCode, undefined);

    const changesDir = getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, project);
    const folder = (await fs.readdir(changesDir)).find((entry) => entry.includes('planner-exit'));
    assert.ok(folder, 'the change folder exists');
    const records = await readPlanRecords(path.join(changesDir, folder));
    const exited = records.find((record) => record.type === 'plan_exited');
    assert.ok(exited && exited.type === 'plan_exited', 'plan_exited was recorded');
    assert.equal(exited.data.exitCode, 3);
  });
});

describe('plan and serve through runCli', () => {
  it('prints the queue refusal on stderr and exits 1', async () => {
    const project = await createProject();
    await writeAt(project, 'openspec/queue.md', '');

    const capture = await runCliCaptured(project, ['plan', '--next']);

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.lines.filter((line) => line.stream === 'stdout').length, 0);
    const stderr = capture.lines.filter((line) => line.stream === 'stderr');
    assert.equal(stderr.length, 1, JSON.stringify(capture.lines));
    assert.match(stderr[0]?.text ?? '', /No queue item is eligible to plan/);
  });

  it('exits with the planner exit code and prints no error line', async () => {
    const project = await createProject();
    const brief = path.join(project, 'brief-source.md');
    process.env.OPENCODE_PATH = FAKE_PLANNER;
    process.env.OSQ_FAKE_EXIT_CODE = '3';
    process.env.OSQ_FAKE_DELAY_MS = '10';
    process.env.CODEX_HOME = path.join(project, 'missing-codex');
    process.env.OSQ_CLAUDE_PROJECTS_DIR = path.join(project, 'missing-claude');
    process.env.CLAUDE_CONFIG_DIR = path.join(project, 'missing-claude-config');

    const capture = await runCliCaptured(project, [
      'plan',
      'planner-exit',
      '--session',
      '--brief',
      brief,
    ]);

    assert.equal(capture.exitCode, 3);
    assert.equal(capture.lines.filter((line) => line.stream === 'stderr').length, 0);
    assert.ok(
      capture.lines.some((line) => line.text.startsWith('Created spec')),
      JSON.stringify(capture.lines),
    );
  });

  it('turns another plan error into the Error: line and exits 1', async () => {
    const project = await createProject();

    const capture = await runCliCaptured(project, ['plan']);

    assert.equal(capture.exitCode, 1);
    assert.deepEqual(capture.lines, [
      { stream: 'stderr', text: 'Error: Provide a change name or use `plan --next`' },
    ]);
  });

  it('turns a failing serve into the Error: line and exits 1', async () => {
    const project = await createProject();
    const blocker = http.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', () => resolve()));
    const address = blocker.address() as { port: number };
    try {
      const capture = await runCliCaptured(project, ['serve', '--port', String(address.port)]);

      assert.equal(capture.exitCode, 1);
      assert.equal(capture.lines.filter((line) => line.stream === 'stdout').length, 0);
      const stderr = capture.lines.filter((line) => line.stream === 'stderr');
      assert.equal(stderr.length, 1, JSON.stringify(capture.lines));
      assert.match(stderr[0]?.text ?? '', /^Error: .*EADDRINUSE/);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
