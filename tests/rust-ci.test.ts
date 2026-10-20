import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'rust.yml');
const toolchainPath = path.join(repoRoot, 'rust-toolchain.toml');
const mutantsConfigPath = path.join(repoRoot, '.cargo', 'mutants.toml');

const VERIFY_RUST = 'sh scripts/verify-rust.sh';
const INSTALL_MUTANTS = 'cargo install cargo-mutants --version 27.1.0 --locked';
const MUTANTS_RUN = 'sh scripts/mutants-rust.sh';
const CHECKOUT = 'actions/checkout@';
const TOOLCHAIN = 'rustup toolchain install';
const TOOLCHAIN_STEP = 'Install the pinned toolchain';
const CACHE = 'Swatinem/rust-cache@';
const PARITY_CLIPPY =
  'cargo clippy -p osq-kernel-specs --features parity --all-targets -- -D warnings';
const PARITY_TEST =
  'cargo test -p osq-kernel-specs --features parity --test openspec_validate_parity_corpus --test openspec_archive_parity_corpus -- --include-ignored';
const INSTALL_LATEST =
  'npm install --prefix "$RUNNER_TEMP/openspec-latest" @fission-ai/openspec@latest';
const SETUP_NODE = 'actions/setup-node@';
const PNPM_SETUP = 'pnpm/action-setup@';

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
    for (const job of ['cargo', 'mutants'] as const) {
      assert.equal(
        stepRunning(job, TOOLCHAIN).run,
        stepRunning('cargo', TOOLCHAIN).run,
        `job ${job} must run the same toolchain step as the cargo job`,
      );
      assert.equal(
        stepUsing(job, CACHE).uses,
        stepUsing('cargo', CACHE).uses,
        `job ${job} must use the same ${CACHE} step as the cargo job`,
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

describe('rust-core: Rust CI runs the parity tests', () => {
  it('uses the checkout, pnpm, Node 24 and cache actions and installs the pinned toolchain', () => {
    for (const prefix of [CHECKOUT, PNPM_SETUP, SETUP_NODE, CACHE]) {
      assert.ok(stepUsing('parity', prefix), `the parity job must use ${prefix}`);
    }
    assert.ok(stepRunning('parity', TOOLCHAIN), `the parity job must run ${TOOLCHAIN}`);
    assert.equal(
      String(stepUsing('parity', SETUP_NODE).with?.['node-version']),
      '24',
      'the parity job must set up Node 24',
    );
  });

  it('runs pnpm install --frozen-lockfile', () => {
    const step = stepRunning('parity', 'pnpm install --frozen-lockfile');
    assert.equal((step.run ?? '').trim(), 'pnpm install --frozen-lockfile');
  });

  it('checks the specs kernel with clippy and the parity feature', () => {
    const step = stepRunning('parity', PARITY_CLIPPY);
    assert.equal((step.run ?? '').trim(), PARITY_CLIPPY);
  });

  it('runs the parity tests without OSQ_OPENSPEC_BIN outside the schedule', () => {
    const step = scheduleStep('parity', false);
    assert.equal((step.run ?? '').trim(), PARITY_TEST);
    assert.equal(
      Object.hasOwn(step.env ?? {}, 'OSQ_OPENSPEC_BIN'),
      false,
      'the pinned run must not set OSQ_OPENSPEC_BIN',
    );
  });

  it('installs the latest OpenSpec and runs the parity tests against it on the schedule', () => {
    const install = scheduleStep('parity', true);
    assert.equal((install.run ?? '').trim(), INSTALL_LATEST);

    const scheduled = stepsOf('parity').filter(
      (entry) =>
        (entry.if ?? '').replace(/\s+/g, '') === "github.event_name=='schedule'" &&
        (entry.run ?? '').includes('cargo test -p osq-kernel-specs'),
    );
    assert.equal(scheduled.length, 1, 'the schedule must run one cargo test step');
    const step = scheduled[0];
    assert.ok(step);
    assert.equal((step.run ?? '').trim(), PARITY_TEST);

    const env = step.env ?? {};
    assert.match(
      String(env.OSQ_OPENSPEC_BIN ?? ''),
      /openspec-latest\/node_modules\/\.bin\/openspec/,
      'the latest binary must come through the step env',
    );
    assert.equal(String(env.OPENSPEC_TELEMETRY), '0');
  });

  it('never runs pnpm add or pnpm update', () => {
    for (const step of stepsOf('parity')) {
      assert.doesNotMatch(
        step.run ?? '',
        /\bpnpm\s+(?:add|update)\b/,
        'the parity job must not change the lockfile',
      );
    }
  });
});

describe('rust-core: Rust toolchain is pinned once', () => {
  it('sets channel 1.99.1 and holds nothing else', async () => {
    const text = await fs.readFile(toolchainPath, 'utf8');
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));

    assert.deepEqual(rows, [
      '[toolchain]',
      'channel = "1.99.1"',
      'components = ["clippy", "rustfmt"]',
    ]);
  });

  it('lists the clippy and rustfmt components', async () => {
    const text = await fs.readFile(toolchainPath, 'utf8');
    const components = text.match(/^components\s*=\s*\[([^\]]*)\]\s*$/m)?.[1] ?? '';

    assert.match(components, /["']clippy["']/, 'components must hold clippy');
    assert.match(components, /["']rustfmt["']/, 'components must hold rustfmt');
  });

  it('installs the pinned toolchain with one rustup step in each job', () => {
    for (const job of ['cargo', 'mutants', 'parity']) {
      const installs = stepsOf(job).filter((step) => (step.run ?? '').trim() === TOOLCHAIN);

      assert.equal(installs.length, 1, `job ${job} must have one ${TOOLCHAIN} step`);
      assert.equal(installs[0]?.name, TOOLCHAIN_STEP, `job ${job} must name its toolchain step`);
    }
  });

  it('installs the toolchain before the cache and every cargo step', () => {
    for (const job of ['cargo', 'mutants', 'parity']) {
      const steps = stepsOf(job);
      const installIndex = steps.findIndex((step) => (step.run ?? '').trim() === TOOLCHAIN);
      const cacheIndex = steps.findIndex((step) => (step.uses ?? '').startsWith(CACHE));
      const checkoutIndex = steps.findIndex((step) => (step.uses ?? '').startsWith(CHECKOUT));

      assert.ok(installIndex >= 0, `job ${job} must install the toolchain`);
      assert.ok(checkoutIndex < installIndex, `job ${job} must check out before installing`);
      assert.ok(cacheIndex > installIndex, `job ${job} must install before caching`);
      if (job === 'parity') {
        for (const prefix of [PNPM_SETUP, SETUP_NODE]) {
          const index = steps.findIndex((step) => (step.uses ?? '').startsWith(prefix));
          assert.ok(index < installIndex, `the parity job must use ${prefix} before installing`);
        }
      }

      steps.forEach((step, index) => {
        const run = step.run ?? '';
        if (index === installIndex) {
          return;
        }
        if (run.includes('cargo') || run.includes('sh scripts/')) {
          assert.ok(
            index > installIndex,
            `job ${job} must install the toolchain before running ${run.trim()}`,
          );
        }
      });
    }
  });

  it('names no Rust version or toolchain action itself', () => {
    for (const job of Object.keys(workflow.jobs ?? {})) {
      for (const step of stepsOf(job)) {
        assert.equal(
          (step.uses ?? '').startsWith('dtolnay/rust-toolchain@'),
          false,
          `job ${job} must not use dtolnay/rust-toolchain@`,
        );
        assert.equal(
          Object.hasOwn(step.with ?? {}, 'toolchain'),
          false,
          `job ${job} must not name a toolchain under with`,
        );
      }
    }
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
