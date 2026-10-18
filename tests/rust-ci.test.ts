import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'rust.yml');
const mutantsConfigPath = path.join(repoRoot, '.cargo', 'mutants.toml');

const VERIFY_RUST = 'sh scripts/verify-rust.sh';
const INSTALL_MUTANTS = 'cargo install cargo-mutants --version 27.1.0 --locked';
const MUTANTS_RUN = 'sh scripts/mutants-rust.sh';
const CHECKOUT = 'actions/checkout@';
const TOOLCHAIN = 'dtolnay/rust-toolchain@';
const CACHE = 'Swatinem/rust-cache@';

/** One step of a GitHub Actions job, the fields this test reads. */
interface WorkflowStep {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly if?: string;
  readonly env?: Record<string, unknown>;
  readonly with?: Record<string, unknown>;
}

/** One job of the Rust workflow. */
interface WorkflowJob {
  readonly steps?: readonly WorkflowStep[];
}

/** The `on` block of the Rust workflow. */
interface WorkflowTriggers {
  readonly push?: { readonly branches?: readonly string[] };
  readonly pull_request?: { readonly branches?: readonly string[] };
  readonly schedule?: readonly { readonly cron?: string }[];
}

/** The Rust workflow document, the fields this test reads. */
interface RustWorkflow {
  readonly on?: WorkflowTriggers;
  readonly jobs?: Record<string, WorkflowJob>;
}

const workflow = parse(await fs.readFile(workflowPath, 'utf8')) as RustWorkflow;

/** The steps of one job, or none when the job is missing. */
function stepsOf(job: string): readonly WorkflowStep[] {
  return workflow.jobs?.[job]?.steps ?? [];
}

/** The one step of `job` whose `run` text contains `marker`. */
function stepRunning(job: string, marker: string): WorkflowStep {
  const step = stepsOf(job).find((entry) => (entry.run ?? '').includes(marker));
  assert.ok(step, `job ${job} must have a step running ${marker}`);
  return step;
}

/** The one step of `job` that uses an action named `prefix`. */
function stepUsing(job: string, prefix: string): WorkflowStep {
  const step = stepsOf(job).find((entry) => (entry.uses ?? '').startsWith(prefix));
  assert.ok(step, `job ${job} must use ${prefix}`);
  return step;
}

/**
 * The one step of `job` whose `if` names `github.event_name` and the schedule,
 * gated on the event running (`runs` true) or not running (`runs` false).
 */
function scheduleStep(job: string, runs: boolean): WorkflowStep {
  const step = stepsOf(job).find((entry) => {
    const condition = (entry.if ?? '').replace(/\s+/g, '');
    const namesEvent = condition.includes('github.event_name');
    return runs
      ? namesEvent && condition.includes("=='schedule'")
      : namesEvent && condition.includes("!='schedule'");
  });
  assert.ok(step, `job ${job} must gate one step on ${runs ? '' : 'not '}the schedule event`);
  return step;
}

describe('rust-core: Rust CI runs the mutation check', () => {
  it('triggers on pushes and pull requests to main, and one weekly schedule', () => {
    const on = workflow.on;
    assert.ok(on, 'the workflow must define triggers');
    assert.ok(on.push?.branches?.includes('main'), 'pushes to main must trigger the workflow');
    assert.ok(
      on.pull_request?.branches?.includes('main'),
      'pull requests to main must trigger the workflow',
    );

    const schedules = on.schedule;
    assert.ok(Array.isArray(schedules) && schedules.length === 1, 'one schedule entry');
    assert.match(schedules[0]?.cron ?? '', /^\S+ \S+ \S+ \S+ \S+$/, 'the schedule needs a cron');
  });

  it('keeps the cargo job running the workspace verify script', () => {
    assert.ok(stepRunning('cargo', VERIFY_RUST), `the cargo job must run ${VERIFY_RUST}`);
  });

  it('checks the mutants job out with fetch-depth 0', () => {
    const checkout = stepUsing('mutants', CHECKOUT);
    assert.equal(
      String(checkout.with?.['fetch-depth']),
      '0',
      'the mutants checkout must fetch the full history',
    );
  });

  it('sets up the toolchain and cache and installs cargo-mutants 27.1.0', () => {
    for (const [job, prefix] of [
      ['cargo', TOOLCHAIN],
      ['mutants', TOOLCHAIN],
      ['cargo', CACHE],
      ['mutants', CACHE],
    ] as const) {
      assert.equal(
        stepUsing(job, prefix).uses,
        stepUsing('cargo', prefix).uses,
        `job ${job} must use the same ${prefix} step as the cargo job`,
      );
    }
    assert.ok(
      stepRunning('mutants', INSTALL_MUTANTS),
      `the mutants job must run ${INSTALL_MUTANTS}`,
    );
  });

  it('mutates the diff of a push or pull request outside the schedule', () => {
    const step = scheduleStep('mutants', false);
    const run = step.run ?? '';
    assert.match(run, /\bgit diff\b/, 'the step must diff the base against HEAD');
    assert.match(run, /\bHEAD\b/, 'the diff must end at HEAD');
    assert.match(run, /\$RUNNER_TEMP/, 'the diff file must live under $RUNNER_TEMP');
    assert.match(
      run,
      /sh scripts\/mutants-rust\.sh\s+"?\$RUNNER_TEMP/,
      'the step must pass that diff file to the mutation script',
    );
    assert.doesNotMatch(run, /github\.event/, 'the base must come through env, not the script');

    const values = Object.values(step.env ?? {}).map((value) => String(value));
    assert.ok(
      values.some((value) => value.includes('github.event.pull_request.base.sha')),
      'the base of a pull request must come from the pull request event',
    );
    assert.ok(
      values.some((value) => value.includes('github.event.before')),
      'the base of a push must come from the push event',
    );
  });

  it('mutates the whole workspace on the schedule', () => {
    const step = scheduleStep('mutants', true);
    assert.equal((step.run ?? '').trim(), MUTANTS_RUN, 'the schedule run takes no argument');
  });
});

describe('rust-core: Mutation settings exclude nothing', () => {
  it('sets exclude_re to the empty list', async () => {
    const text = await fs.readFile(mutantsConfigPath, 'utf8');
    const assignments = text
      .replace(/#.*$/gm, '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('exclude_re'));

    assert.ok(assignments.length > 0, 'mutants.toml must set exclude_re');
    for (const assignment of assignments) {
      const value = assignment.split('=')[1]?.trim();
      assert.equal(value, '[]', `exclude_re must hold no pattern, found ${value}`);
    }
  });
});
