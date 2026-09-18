import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'release.yml');

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  permissions?: Record<string, string>;
  steps?: WorkflowStep[];
}

interface WorkflowDoc {
  on?: { push?: { tags?: string[] } };
  permissions?: Record<string, string>;
  jobs?: Record<string, WorkflowJob>;
}

const workflowText = await fs.readFile(workflowPath, 'utf8');
const workflow = parse(workflowText) as WorkflowDoc;

function releaseJob(): WorkflowJob {
  const job = workflow.jobs?.release;
  assert.ok(job, 'release.yml must define a release job');
  return job;
}

function releaseSteps(): WorkflowStep[] {
  return releaseJob().steps ?? [];
}

function stepRun(step: WorkflowStep): string {
  return step.run ?? '';
}

function findPublishIndex(steps: WorkflowStep[]): number {
  return steps.findIndex((step) => /npm publish/.test(stepRun(step)));
}

describe('release workflow', () => {
  it('triggers on v* tag push events', () => {
    const tags = workflow.on?.push?.tags;
    assert.ok(Array.isArray(tags), 'workflow must trigger on push.tags');
    assert.ok(tags.includes('v*'), "push.tags must include 'v*'");
  });

  it('installs with a frozen lockfile and runs the verification gate', () => {
    const runs = releaseSteps().map(stepRun);
    assert.ok(
      runs.some((run) => /pnpm install --frozen-lockfile/.test(run)),
      'workflow must install dependencies with pnpm install --frozen-lockfile',
    );
    assert.ok(
      runs.some((run) => /pnpm verify/.test(run)),
      'workflow must execute pnpm verify',
    );
  });

  it('runs the consumer pack smoke test suite through pnpm test', () => {
    const runs = releaseSteps().map(stepRun);
    assert.ok(
      runs.some((run) => /\bpnpm (run )?test\b/.test(run)),
      'workflow must execute the test suite (including the consumer pack smoke test)',
    );
    assert.doesNotMatch(workflowText, /OSQ_SKIP_PACK_TEST/, 'release must not skip the pack test');
  });

  it('verifies tag version parity with package.json before publishing', () => {
    const steps = releaseSteps();
    const publishIndex = findPublishIndex(steps);
    assert.ok(publishIndex >= 0, 'workflow must contain an npm publish step');

    const tagCheckIndex = steps.findIndex((step) => {
      const run = stepRun(step);
      return (
        (/GITHUB_REF/.test(run) || /package\.json/.test(run) || /tag/i.test(step.name ?? '')) &&
        !/npm publish/.test(run)
      );
    });
    assert.ok(tagCheckIndex >= 0, 'workflow must verify the tag against the package version');
    assert.ok(
      tagCheckIndex < publishIndex,
      'tag/package.json version check must run before npm publish',
    );

    const tagCheck = stepRun(steps[tagCheckIndex] as WorkflowStep);
    assert.match(tagCheck, /TAG_VERSION/, 'tag check must derive the git tag version');
    assert.match(
      tagCheck,
      /require\(['"]\.\/package\.json['"]\)\.version|package\.json/,
      'tag check must read the package.json version',
    );
    assert.match(tagCheck, /!=/, 'tag check must compare the two versions and fail on mismatch');
  });

  it('publishes with provenance and public access using OIDC permissions', () => {
    const steps = releaseSteps();
    const publishIndex = findPublishIndex(steps);
    assert.ok(publishIndex >= 0, 'workflow must contain an npm publish step');

    const publish = stepRun(steps[publishIndex] as WorkflowStep);
    assert.match(publish, /--provenance/, 'publish must use --provenance');
    assert.match(publish, /--access public/, 'publish must use --access public');

    const permissions = {
      ...(workflow.permissions ?? {}),
      ...(releaseJob().permissions ?? {}),
    };
    assert.equal(permissions['id-token'], 'write', 'publish requires id-token: write');
    assert.equal(permissions.contents, 'read', 'publish requires contents: read');
  });

  it('contains no static npm token secrets or npmrc authentication', () => {
    assert.doesNotMatch(workflowText, /secrets\./, 'workflow must not reference any secrets');
    assert.doesNotMatch(workflowText, /NPM_TOKEN/, 'workflow must not reference NPM_TOKEN');
    assert.doesNotMatch(
      workflowText,
      /NODE_AUTH_TOKEN/,
      'workflow must not rely on NODE_AUTH_TOKEN authentication',
    );
    assert.doesNotMatch(workflowText, /\.npmrc/, 'workflow must not create .npmrc auth files');
  });

  it('sets up the runner with checkout, pnpm, and Node 22', () => {
    const steps = releaseSteps();
    const uses = steps.map((step) => step.uses ?? '');

    assert.ok(
      uses.some((value) => value.startsWith('actions/checkout@')),
      'workflow must check out the repository',
    );
    assert.ok(
      uses.some((value) => value.startsWith('pnpm/action-setup@')),
      'workflow must set up pnpm',
    );
    const setupNodeIndex = steps.findIndex((step) =>
      (step.uses ?? '').startsWith('actions/setup-node@'),
    );
    assert.ok(setupNodeIndex >= 0, 'workflow must set up Node.js');
    assert.equal(
      String((steps[setupNodeIndex] as WorkflowStep).with?.['node-version']),
      '22',
      'workflow must use Node 22',
    );

    const pnpmSetup = steps.find((step) => (step.uses ?? '').startsWith('pnpm/action-setup@'));
    assert.ok(pnpmSetup?.with?.version, 'pnpm/action-setup must pin a pnpm version');
  });
});
