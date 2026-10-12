import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { type DoctorReport, runDoctorChecks } from '../src/core/foundation/doctor.js';
import { OPENSPEC_EXPECTED_VERSION } from '../src/core/spec/linter.js';
import { FAKE_CLAUDE, createClaudeProject, envScope } from './claude/exec-support.js';

const env = envScope(['OSQ_FAKE_CLAUDE_VERSION']);

const VALIDATOR = { harness: 'claude', model: 'claude-opus-5-5' } as const;

const FAILING =
  '[claude-code:unrecognized_model] {"model":"claude-opus-5-5"}\n\nClaude Code result: success';
const FAILING_LINE = '[claude-code:unrecognized_model] {"model":"claude-opus-5-5"}';

/** Executor `mock`, validator `claude` on the fake binary, as the harness test does. */
function validatorConfig(bin: string): OsqConfig {
  return defineConfig({ harness: 'mock', claude: { bin }, validator: VALIDATOR });
}

/** One `validator_ran` event to write into an archived change's stream. */
interface ValidatorRunEvent {
  readonly outcome: string;
  readonly output?: string;
  readonly reason?: string;
}

function proposalMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    `${title} goal.`,
    '',
  ].join('\n');
}

async function writeArchivedRun(
  root: string,
  folder: string,
  title: string,
  run: ValidatorRunEvent | undefined,
  timestamp: string,
): Promise<void> {
  const folderPath = path.join(root, 'openspec', 'changes', 'archive', folder);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMd(title), 'utf8');
  if (run === undefined) return;
  const data: Record<string, unknown> = { outcome: run.outcome };
  if (run.output !== undefined) data.output = run.output;
  if (run.reason !== undefined) data.reason = run.reason;
  const eventsDir = path.join(folderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  await fs.writeFile(
    path.join(eventsDir, 'change.jsonl'),
    `${JSON.stringify({ type: 'validator_ran', timestamp, data })}\n`,
    'utf8',
  );
}

/** A scaffolded project whose archived changes 001-a and 002-b hold the runs. */
async function setupRuns(runs: {
  readonly a?: ValidatorRunEvent;
  readonly b?: ValidatorRunEvent;
}): Promise<string> {
  const { root } = await createClaudeProject('validator-runs');
  await writeArchivedRun(root, '001-a', 'A', runs.a, '2026-01-01T00:00:00.000Z');
  await writeArchivedRun(root, '002-b', 'B', runs.b, '2026-01-02T00:00:00.000Z');
  return root;
}

function findCheck(report: DoctorReport, name: string) {
  return report.checks.find((check) => check.name === name);
}

function runDoctor(root: string, config: OsqConfig): Promise<DoctorReport> {
  return runDoctorChecks(root, {
    loadConfig: async () => config,
    probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
  });
}

describe('validator runs doctor check', () => {
  afterEach(() => env.restore());

  it('fails with the count, the error, and the fix when the newest runs failed', async () => {
    env.save();
    env.set({ OSQ_FAKE_CLAUDE_VERSION: '2.1.278 (Claude Code)' });
    const root = await setupRuns({
      a: { outcome: 'failed', output: FAILING },
      b: { outcome: 'failed', output: FAILING },
    });
    try {
      const report = await runDoctor(root, validatorConfig(FAKE_CLAUDE));

      assert.deepEqual(findCheck(report, 'validator-runs'), {
        name: 'validator-runs',
        ok: false,
        message: `validator failed 2× in a row, last on 002: ${FAILING_LINE} — update the claude harness or change validator.model`,
      });
      assert.equal(report.ok, false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('fails with the outcome when a timed_out run printed no output', async () => {
    env.save();
    env.set({ OSQ_FAKE_CLAUDE_VERSION: '2.1.278 (Claude Code)' });
    const root = await setupRuns({ a: { outcome: 'validated' }, b: { outcome: 'timed_out' } });
    try {
      const report = await runDoctor(root, validatorConfig(FAKE_CLAUDE));

      assert.deepEqual(findCheck(report, 'validator-runs'), {
        name: 'validator-runs',
        ok: false,
        message:
          'validator timed_out 1× in a row, last on 002: timed_out — update the claude harness or change validator.model',
      });
      assert.equal(report.ok, false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('adds no check when the newest run validated', async () => {
    env.save();
    env.set({ OSQ_FAKE_CLAUDE_VERSION: '2.1.278 (Claude Code)' });
    const root = await setupRuns({
      a: { outcome: 'failed', output: 'boom' },
      b: { outcome: 'validated' },
    });
    try {
      const report = await runDoctor(root, validatorConfig(FAKE_CLAUDE));

      assert.equal(findCheck(report, 'validator-runs'), undefined);
      assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('adds no check when no run is recorded', async () => {
    env.save();
    env.set({ OSQ_FAKE_CLAUDE_VERSION: '2.1.278 (Claude Code)' });
    const root = await setupRuns({});
    try {
      const report = await runDoctor(root, validatorConfig(FAKE_CLAUDE));

      assert.equal(findCheck(report, 'validator-runs'), undefined);
      assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('places validator-runs right before validator-harness and validator-model last', async () => {
    env.save();
    env.set({ OSQ_FAKE_CLAUDE_VERSION: '2.1.278 (Claude Code)' });
    const root = await setupRuns({
      a: { outcome: 'failed', output: FAILING },
      b: { outcome: 'failed', output: FAILING },
    });
    try {
      const report = await runDoctor(root, validatorConfig(FAKE_CLAUDE));
      const names = report.checks.map((check) => check.name);

      const runsIndex = names.indexOf('validator-runs');
      assert.notEqual(runsIndex, -1);
      assert.equal(names[runsIndex + 1], 'validator-harness');
      assert.equal(names.at(-1), 'validator-model');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('adds no validator-runs check without a validator block or with it disabled', async () => {
    env.save();
    env.set({ OSQ_FAKE_CLAUDE_VERSION: '2.1.278 (Claude Code)' });
    const root = await setupRuns({
      a: { outcome: 'failed', output: 'boom' },
      b: { outcome: 'failed', output: 'boom' },
    });
    try {
      const configs: OsqConfig[] = [
        defineConfig({ harness: 'mock' }),
        defineConfig({ harness: 'mock', validator: { enabled: false } }),
      ];
      for (const config of configs) {
        const report = await runDoctor(root, config);
        assert.equal(findCheck(report, 'validator-runs'), undefined);
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
