import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { planCommand } from '../../src/cli/plan.js';
import { resolvePlannerSelection } from '../../src/core/config-codex.js';
import { defineConfig } from '../../src/core/config.js';
import { parseFrontmatter } from '../../src/core/parser.js';
import { buildCodexInteractiveArgs } from '../../src/harness/codex-prompt.js';
import { CodexAdapter } from '../../src/harness/codex.js';
import { FAKE_CODEX, createScaffoldedProject } from './support.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

interface SubprocessResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runPlanInSubprocess(options: {
  root: string;
  name: string;
  brief: string;
  env: Record<string, string | undefined>;
}): Promise<SubprocessResult> {
  const runnerPath = path.join(options.root, `plan-runner-${Date.now()}.mts`);
  const runner = [
    `import { planCommand } from ${JSON.stringify(path.join(PROJECT_ROOT, 'src/cli/plan.js'))};`,
    `await planCommand(${JSON.stringify(options.name)}, { brief: ${JSON.stringify(options.brief)}, session: true, cwd: ${JSON.stringify(options.root)} });`,
    '',
  ].join('\n');

  return fs.writeFile(runnerPath, runner, 'utf8').then(
    () =>
      new Promise<SubprocessResult>((resolve, reject) => {
        const env: NodeJS.ProcessEnv = { ...process.env, ...options.env };
        for (const [key, value] of Object.entries(options.env)) {
          if (value === undefined) delete env[key];
        }
        const child = spawn(process.execPath, ['--import', 'tsx', runnerPath], {
          cwd: PROJECT_ROOT,
          env,
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (status) => resolve({ status, stdout, stderr }));
      }),
  );
}

async function writeCodexPlanProject(
  prefix: string,
  configBody: string,
): Promise<{ root: string; brief: string }> {
  const root = await createScaffoldedProject(prefix);
  await fs.writeFile(path.join(root, 'osq.config.ts'), configBody, 'utf8');
  const brief = path.join(root, 'plan-brief.md');
  await fs.writeFile(brief, '# Plan Brief\n\nDesign the Codex slice.\n', 'utf8');
  return { root, brief };
}

const CODEX_PLAN_CONFIG = "export default { harness: 'codex' };\n";
const CODEX_PLANNER_CONFIG =
  "export default { harness: 'codex', planner: { harness: 'codex', model: 'planner-model-x' } };\n";

describe('Codex planner selection', () => {
  it('uses the explicit planner model and never inherits the executor model', () => {
    const mixed = defineConfig({
      harness: 'codex',
      codex: { model: 'executor-model' },
      planner: { harness: 'codex', model: 'planner-model' },
    });
    assert.deepEqual(resolvePlannerSelection(mixed), {
      harness: 'codex',
      model: 'planner-model',
      briefModel: 'planner-model',
    });

    const opencodePlanner = defineConfig({
      harness: 'codex',
      codex: { model: 'executor-model' },
      planner: { harness: 'opencode', model: 'plain-model' },
    });
    assert.deepEqual(resolvePlannerSelection(opencodePlanner), {
      harness: 'opencode',
      model: 'plain-model',
      briefModel: 'plain-model',
      agent: 'osq-planner',
    });
  });

  it('falls back to the Codex executor and uses the default sentinel with no flag', () => {
    Reflect.deleteProperty(process.env, 'OSQ_MODEL');
    const native = defineConfig({ harness: 'codex' });
    assert.deepEqual(resolvePlannerSelection(native), {
      harness: 'codex',
      briefModel: 'default',
    });

    const selected = defineConfig({ harness: 'codex', codex: { model: 'codex-exec-model' } });
    assert.deepEqual(resolvePlannerSelection(selected), {
      harness: 'codex',
      model: 'codex-exec-model',
      briefModel: 'codex-exec-model',
    });
  });
});

describe('Codex interactive adapter', () => {
  it('builds interactive argv with on-request approvals and no exec/JSON/effort flags', () => {
    const args = buildCodexInteractiveArgs({ prompt: 'plan this', model: 'planner-model' });
    assert.deepEqual(args.slice(0, 2), ['--ask-for-approval', 'on-request']);
    assert.deepEqual(args.slice(2, 4), ['--sandbox', 'workspace-write']);
    assert.ok(args.includes('--model'));
    assert.equal(args.at(-1), 'plan this');
    assert.ok(!args.includes('exec'));
    assert.ok(!args.includes('--json'));
    assert.ok(!args.some((arg) => arg.startsWith('model_reasoning_effort')));

    const native = buildCodexInteractiveArgs({ prompt: 'plan this' });
    assert.ok(!native.includes('--model'));
  });

  it('rejects an unsupported agent and propagates spawn failures', async () => {
    const root = await createScaffoldedProject('codex-interactive-errors');
    const savedPath = process.env.CODEX_PATH;
    try {
      await assert.rejects(
        () =>
          new CodexAdapter().spawnInteractive({
            prompt: 'x',
            cwd: root,
            agent: 'osq-planner',
          }),
        /does not support planner\.agent/,
      );

      process.env.CODEX_PATH = path.join(root, 'missing-codex');
      const code = await new CodexAdapter().spawnInteractive({ prompt: 'x', cwd: root });
      assert.equal(code, 1, 'spawn failure propagates as a nonzero outcome');
    } finally {
      if (savedPath === undefined) Reflect.deleteProperty(process.env, 'CODEX_PATH');
      else process.env.CODEX_PATH = savedPath;
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('planCommand with the Codex harness', () => {
  it('launches the fake interactive executable with inherited stdio and native model defaults', async () => {
    const { root, brief } = await writeCodexPlanProject('codex-plan-native', CODEX_PLAN_CONFIG);
    const record = path.join(root, 'interactive-record.json');
    try {
      const result = await runPlanInSubprocess({
        root,
        name: 'codex-native-plan',
        brief,
        env: {
          CODEX_PATH: FAKE_CODEX,
          OSQ_FAKE_RECORD: record,
          OSQ_FAKE_STDOUT: 'OSQ_CODEX_INTERACTIVE_TOKEN',
          OSQ_FAKE_INTERACTIVE_EXIT: '0',
          OSQ_MODEL: undefined,
        },
      });

      assert.equal(result.status, 0);
      assert.ok(
        result.stdout.includes('OSQ_CODEX_INTERACTIVE_TOKEN'),
        `inherited stdio should surface fake output; got: ${result.stdout}`,
      );

      const recorded = JSON.parse(await fs.readFile(record, 'utf8')) as {
        argv: string[];
        cwd: string;
      };
      assert.equal(recorded.cwd, root);
      assert.deepEqual(recorded.argv.slice(0, 4), [
        '--ask-for-approval',
        'on-request',
        '--sandbox',
        'workspace-write',
      ]);
      assert.ok(!recorded.argv.includes('--model'));
      const plannerContent = await fs.readFile(path.join(root, 'PLANNER.md'), 'utf8');
      const prompt = recorded.argv.at(-1) ?? '';
      assert.ok(
        prompt.startsWith(plannerContent.trim()),
        'prompt preserves PLANNER.md-first order',
      );
      assert.ok(prompt.includes('## Brief'));

      const changeDir = (await fs.readdir(path.join(root, 'openspec', 'changes'))).find((entry) =>
        entry.includes('codex-native-plan'),
      );
      assert.ok(changeDir);
      const briefContent = await fs.readFile(
        path.join(root, 'openspec', 'changes', changeDir, 'brief.md'),
        'utf8',
      );
      assert.equal(parseFrontmatter(briefContent).data.planner, 'default');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('uses the explicit planner model consistently in brief metadata and argv', async () => {
    const { root, brief } = await writeCodexPlanProject(
      'codex-plan-explicit',
      CODEX_PLANNER_CONFIG,
    );
    const record = path.join(root, 'interactive-record.json');
    try {
      const result = await runPlanInSubprocess({
        root,
        name: 'codex-explicit-plan',
        brief,
        env: {
          CODEX_PATH: FAKE_CODEX,
          OSQ_FAKE_RECORD: record,
          OSQ_FAKE_INTERACTIVE_EXIT: '0',
        },
      });
      assert.equal(result.status, 0);

      const recorded = JSON.parse(await fs.readFile(record, 'utf8')) as { argv: string[] };
      assert.deepEqual(
        recorded.argv.slice(recorded.argv.indexOf('--model'), recorded.argv.indexOf('--model') + 2),
        ['--model', 'planner-model-x'],
      );

      const changeDir = (await fs.readdir(path.join(root, 'openspec', 'changes'))).find((entry) =>
        entry.includes('codex-explicit-plan'),
      );
      assert.ok(changeDir);
      const briefContent = await fs.readFile(
        path.join(root, 'openspec', 'changes', changeDir, 'brief.md'),
        'utf8',
      );
      assert.equal(parseFrontmatter(briefContent).data.planner, 'planner-model-x');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('uses an explicit Codex planner without leaking the executor harness model', async () => {
    const { root, brief } = await writeCodexPlanProject(
      'codex-plan-mixed',
      "export default { harness: 'agy', planner: { harness: 'codex', model: 'codex-planner-model' } };\n",
    );
    const record = path.join(root, 'interactive-record.json');
    try {
      const result = await runPlanInSubprocess({
        root,
        name: 'mixed-plan',
        brief,
        env: {
          CODEX_PATH: FAKE_CODEX,
          OSQ_FAKE_RECORD: record,
          OSQ_FAKE_INTERACTIVE_EXIT: '0',
        },
      });
      assert.equal(result.status, 0);

      const recorded = JSON.parse(await fs.readFile(record, 'utf8')) as { argv: string[] };
      const modelIndex = recorded.argv.indexOf('--model');
      assert.equal(recorded.argv[modelIndex + 1], 'codex-planner-model');
      assert.ok(!recorded.argv.includes('gemini-3.8-flash-high'));

      const changeDir = (await fs.readdir(path.join(root, 'openspec', 'changes'))).find((entry) =>
        entry.includes('mixed-plan'),
      );
      assert.ok(changeDir);
      const briefContent = await fs.readFile(
        path.join(root, 'openspec', 'changes', changeDir, 'brief.md'),
        'utf8',
      );
      assert.equal(parseFrontmatter(briefContent).data.planner, 'codex-planner-model');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('propagates nonzero and signal exits from the interactive process', async () => {
    const { root, brief } = await writeCodexPlanProject('codex-plan-exit', CODEX_PLAN_CONFIG);
    try {
      const nonzero = await runPlanInSubprocess({
        root,
        name: 'codex-exit-7',
        brief,
        env: {
          CODEX_PATH: FAKE_CODEX,
          OSQ_FAKE_INTERACTIVE_EXIT: '7',
        },
      });
      assert.equal(nonzero.status, 7);

      const signaled = await runPlanInSubprocess({
        root,
        name: 'codex-signal',
        brief,
        env: {
          CODEX_PATH: FAKE_CODEX,
          OSQ_FAKE_INTERACTIVE_SIGNAL: 'SIGKILL',
        },
      });
      assert.equal(signaled.status, 1, 'a signaled interactive process is a nonzero outcome');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('reuses an existing change and emits the print prompt without launching Codex', async () => {
    const { root, brief } = await writeCodexPlanProject('codex-plan-print', CODEX_PLAN_CONFIG);
    try {
      const first = await runPlanInSubprocess({
        root,
        name: 'codex-reuse',
        brief,
        env: { CODEX_PATH: FAKE_CODEX, OSQ_FAKE_INTERACTIVE_EXIT: '0' },
      });
      assert.equal(first.status, 0);
      const changesDir = path.join(root, 'openspec', 'changes');
      const foldersBefore = (await fs.readdir(changesDir))
        .filter((entry) => entry !== 'archive')
        .sort();

      const second = await runPlanInSubprocess({
        root,
        name: '001',
        brief,
        env: { CODEX_PATH: path.join(root, 'missing-codex') },
      });
      assert.equal(second.status, 1, 'the resumed session still propagates the spawn failure');
      // Reopening the existing change does not recreate it even if the binary is absent.
      const foldersAfter = (await fs.readdir(changesDir))
        .filter((entry) => entry !== 'archive')
        .sort();
      assert.deepEqual(foldersAfter, foldersBefore);

      let stdout = '';
      const originalWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = ((chunk: string | Buffer) => {
        stdout += chunk.toString();
        return true;
      }) as typeof process.stdout.write;
      try {
        await planCommand('codex-print', { brief, print: true, cwd: root });
      } finally {
        process.stdout.write = originalWrite;
      }
      assert.ok(stdout.includes('# Change: 002 - codex-print'));
      assert.ok(stdout.includes('## Brief'));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
