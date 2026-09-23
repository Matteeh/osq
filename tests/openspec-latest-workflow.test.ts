import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'openspec-latest.yml');
const ciWorkflowPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml');

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, unknown>;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  steps?: WorkflowStep[];
}

interface WorkflowDoc {
  name?: string;
  on?: {
    schedule?: { cron?: string }[];
    workflow_dispatch?: unknown;
  };
  jobs?: Record<string, WorkflowJob>;
}

const text = await fs.readFile(workflowPath, 'utf8');
const workflow = parse(text) as WorkflowDoc;

const ciText = await fs.readFile(ciWorkflowPath, 'utf8');
const ciWorkflow = parse(ciText) as WorkflowDoc;

const INSTALL_DEPS = 'pnpm install --frozen-lockfile';
const INSTALL_LATEST =
  'npm install --prefix "$RUNNER_TEMP/openspec-latest" @fission-ai/openspec@latest';
const PRINT_VERSION = '"$RUNNER_TEMP/openspec-latest/node_modules/.bin/openspec" --version';
const DIFFERENTIAL_RUN = 'node --import tsx --test tests/openspec-differential.test.ts';

function steps(): WorkflowStep[] {
  return Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
}

function indexOfRun(marker: string): number {
  return steps().findIndex((step) => (step.run ?? '').includes(marker));
}

describe('OpenSpec latest workflow', () => {
  it('is named OpenSpec latest and triggers weekly and on demand', () => {
    assert.equal(workflow.name, 'OpenSpec latest');

    const schedules = workflow.on?.schedule;
    assert.ok(Array.isArray(schedules), 'workflow must define a schedule trigger');
    assert.ok(
      schedules.some((entry) => typeof entry.cron === 'string' && /\S/.test(entry.cron)),
      'workflow must define a weekly cron schedule',
    );

    assert.ok(
      workflow.on !== undefined && 'workflow_dispatch' in workflow.on,
      'workflow must be dispatchable on demand',
    );
  });

  it('defines a single job', () => {
    assert.equal(
      Object.keys(workflow.jobs ?? {}).length,
      1,
      'workflow must define exactly one job',
    );
  });

  it('repeats the checkout, pnpm, Node 24, and frozen install steps from ci.yml', () => {
    const wfSteps = steps();
    const uses = wfSteps.map((step) => step.uses ?? '');

    const ciSteps = (ciWorkflow.jobs?.verify?.steps ?? []) as WorkflowStep[];
    const ciUses = ciSteps.map((step) => step.uses ?? '');

    for (const prefix of ['actions/checkout@', 'pnpm/action-setup@', 'actions/setup-node@']) {
      assert.ok(
        ciUses.some((value) => value.startsWith(prefix)),
        `ci.yml must set up ${prefix} for this comparison to hold`,
      );
      assert.ok(
        uses.some((value) => value.startsWith(prefix)),
        `openspec-latest.yml must repeat the ${prefix} step from ci.yml`,
      );
    }

    const setupNodeIndex = wfSteps.findIndex((step) =>
      (step.uses ?? '').startsWith('actions/setup-node@'),
    );
    assert.equal(
      String(wfSteps[setupNodeIndex]?.with?.['node-version']),
      '24',
      'workflow must use Node 24',
    );

    assert.ok(
      wfSteps.some((step) => (step.run ?? '').includes(INSTALL_DEPS)),
      `workflow must run ${INSTALL_DEPS}`,
    );
  });

  it('installs the latest OpenSpec outside the lockfile', () => {
    const installLatestIndex = indexOfRun(INSTALL_LATEST);
    assert.ok(installLatestIndex >= 0, `workflow must run ${INSTALL_LATEST}`);

    const installDepsIndex = indexOfRun(INSTALL_DEPS);
    assert.ok(
      installDepsIndex >= 0 && installDepsIndex < installLatestIndex,
      'the frozen dependency install must precede the latest OpenSpec install',
    );
  });

  it('prints the latest version after installing it', () => {
    const installLatestIndex = indexOfRun(INSTALL_LATEST);
    const printIndex = indexOfRun(PRINT_VERSION);

    assert.ok(printIndex >= 0, `workflow must run ${PRINT_VERSION}`);
    assert.ok(
      printIndex > installLatestIndex,
      'the version step must run after the latest OpenSpec install',
    );
  });

  it('runs the differential test against that binary as the last step', () => {
    const wfSteps = steps();
    const last = wfSteps[wfSteps.length - 1];
    assert.ok(last, 'workflow must define steps');
    assert.ok(
      (last.run ?? '').includes(DIFFERENTIAL_RUN),
      `last step must run ${DIFFERENTIAL_RUN}`,
    );

    assert.ok(last.env, 'last step must define the differential environment');
    const bin = String(last.env.OSQ_OPENSPEC_BIN ?? '');
    assert.match(
      bin,
      /openspec-latest\/node_modules\/\.bin\/openspec/,
      'OSQ_OPENSPEC_BIN must point at the latest OpenSpec binary',
    );
    assert.equal(
      String(last.env.OPENSPEC_TELEMETRY),
      '0',
      'OPENSPEC_TELEMETRY must be 0 for the differential test',
    );
  });

  it('never writes package.json or pnpm-lock.yaml', () => {
    for (const step of steps()) {
      const run = step.run ?? '';
      assert.doesNotMatch(run, /\bpnpm add\b/, 'no step may run pnpm add');
      assert.doesNotMatch(run, /\bpnpm update\b/, 'no step may run pnpm update');

      if (/\bpnpm install\b/.test(run)) {
        assert.match(run, /--frozen-lockfile/, 'every pnpm install must use --frozen-lockfile');
      }
      if (/\bnpm install\b/.test(run)) {
        assert.match(
          run,
          /--prefix/,
          'every npm install must target a prefix outside the repository',
        );
      }
    }

    assert.doesNotMatch(text, /\bpnpm add\b/, 'workflow must not run pnpm add');
    assert.doesNotMatch(text, /\bpnpm update\b/, 'workflow must not run pnpm update');
  });
});
