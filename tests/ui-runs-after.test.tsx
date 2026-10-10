import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChangeView } from '../packages/ui/src/change/ChangeView.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import type { WebChange, WebReview } from '../src/core/web/web-data-types.js';
import { getWebChange } from '../src/core/web/web-data.js';

const execFileAsync = promisify(execFile);

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const ASOF = '2026-06-01T00:00:42.000Z';
const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

/** The test's own git calls ignore redirecting variables, like osq's reads. */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
    Reflect.deleteProperty(env, key);
  }
  return env;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
  return stdout.trim();
}

async function installFakeValidator(projectRoot: string): Promise<void> {
  const binDir = path.join(projectRoot, 'node_modules', '.bin');
  await fs.mkdir(binDir, { recursive: true });
  await fs.writeFile(
    path.join(binDir, 'openspec'),
    "#!/usr/bin/env node\nprocess.stdout.write('{}');\n",
    { mode: 0o755 },
  );
  const manifestDir = path.join(projectRoot, 'node_modules', '@fission-ai', 'openspec');
  await fs.mkdir(manifestDir, { recursive: true });
  await fs.writeFile(
    path.join(manifestDir, 'package.json'),
    JSON.stringify({ name: '@fission-ai/openspec', version: '1.13.1' }),
    'utf8',
  );
}

/** Replace the seeded planning sentinel with a real local verifier. */
async function installLocalVerifier(root: string, folderPath: string): Promise<void> {
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  for (const rel of ['proposal.md', path.join('tasks', '1.md')]) {
    const target = path.join(folderPath, rel);
    const content = await fs.readFile(target, 'utf8').catch(() => null);
    if (content === null) continue;
    await fs.writeFile(
      target,
      content.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
      'utf8',
    );
  }
}

interface Change {
  folderName: string;
  folderPath: string;
}

interface Project {
  root: string;
  repo: string;
  config: OsqConfig;
  vcs: VcsConfig;
}

/** A committed temp repository with no change folders yet. */
async function newRepo(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-ui-runs-after-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });

  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  return { root, repo, config: defineConfig({ vcs }), vcs };
}

/** The delta spec that gives `capability` one added requirement. */
function deltaSpec(capability: string): string {
  return `# Spec Delta: ${capability}

## Purpose

The ${capability} capability for the test.

## ADDED Requirements

### Requirement: ${capability} works

The ${capability} capability SHALL work.

#### Scenario: ${capability} runs
- **WHEN** it runs
- **THEN** it works
`;
}

/** Create a change with the given capability deltas. */
async function addChange(
  p: Project,
  title: string,
  capabilities: readonly string[],
): Promise<Change> {
  const change = await createNewSpec(p.repo, title);
  await installLocalVerifier(p.repo, change.folderPath);
  for (const capability of capabilities) {
    const dir = path.join(change.folderPath, 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), deltaSpec(capability), 'utf8');
  }
  return { folderName: change.folderName, folderPath: change.folderPath };
}

/** Approve a change into its worktree. */
async function approve(p: Project, change: Change): Promise<void> {
  const result = await approveSpec(p.repo, change.folderName, p.config);
  assert.ok(result.worktreePath, `expected a worktree for ${change.folderName}`);
}

function webChange(
  overrides: Partial<WebChange> & Pick<WebChange, 'folderKey' | 'title'>,
): WebChange {
  return {
    id: null,
    slug: overrides.folderKey,
    state: 'active',
    location: 'active',
    planner: null,
    brief: null,
    goal: '',
    rejection: null,
    dependsOn: [],
    reads: [],
    writes: [],
    asOf: ASOF,
    tasks: [],
    ...overrides,
  };
}

/** An empty, structurally valid review so the review layout renders. */
function reviewStub(): WebReview {
  return {
    goal: '',
    nonGoals: '',
    surface: '',
    decisions: '',
    humanSteps: '',
    contract: '',
    deltas: [],
    digest: {
      change: '',
      goal: '',
      tasks: [],
      capabilities: [],
      decisions: [],
      humanSteps: '',
      beforeApproval: '',
      flags: [],
    },
    digestText: '',
  };
}

function renderChange(change: WebChange): string {
  return renderToStaticMarkup(createElement(ChangeView, { change }));
}

const WAIT = [
  { folder: '001-a', capabilities: ['orders'] },
  { folder: '000-z', capabilities: null },
];

describe('Change view names what it runs after', () => {
  it('shows a Runs after row after State with osq show wording', () => {
    const html = renderChange(webChange({ folderKey: '002-b', title: 'B', runsAfter: [...WAIT] }));
    assert.match(
      html,
      /<dt>Runs after<\/dt><dd>001-a \(also writes orders\), 000-z \(depends_on\)<\/dd>/,
    );
    assert.ok(html.indexOf('<dt>Runs after</dt>') > html.indexOf('<dt>State</dt>'));
  });

  it('shows the row in the review layout too', () => {
    const html = renderChange(
      webChange({
        folderKey: '002-b',
        title: 'B',
        runsAfter: [...WAIT],
        review: reviewStub(),
      }),
    );
    assert.match(
      html,
      /<dt>Runs after<\/dt><dd>001-a \(also writes orders\), 000-z \(depends_on\)<\/dd>/,
    );
  });
});

describe('No row without a wait', () => {
  it('shows no Runs after row when the change has none', () => {
    const html = renderChange(webChange({ folderKey: '002-b', title: 'B' }));
    assert.equal(html.includes('Runs after'), false);
  });

  it('shows no Runs after row for an empty list', () => {
    const html = renderChange(webChange({ folderKey: '002-b', title: 'B', runsAfter: [] }));
    assert.equal(html.includes('Runs after'), false);
  });
});

describe('Web document carries the wait', () => {
  it('carries runsAfter for the draft and leaves the approved change without one', async () => {
    const p = await newRepo();
    const one = await addChange(p, 'A', ['orders']);
    await addChange(p, 'B', ['orders']);
    await approve(p, one);

    const draft = await getWebChange(p.repo, '002-b', p.config, new Date(ASOF));
    assert.deepEqual(draft.runsAfter, [{ folder: '001-a', capabilities: ['orders'] }]);

    const approved = await getWebChange(p.repo, '001-a', p.config, new Date(ASOF));
    assert.equal('runsAfter' in approved, false);
  });
});
