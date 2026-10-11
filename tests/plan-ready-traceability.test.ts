import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { lintCommand } from '../src/cli/lint.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { readPlanReady } from '../src/core/spec/plan-ready.js';
import { installFakeValidator } from './helpers.js';

const VERIFY = 'node verify.cjs';

/** A project-local config whose traceability opt-in and mode the test controls. */
function lintConfig(
  capabilities: 'all' | readonly string[] = [],
  mode: 'warn' | 'require' = 'warn',
): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    limits: { ...DEFAULT_CONFIG.limits },
    traceability: { capabilities, mode },
  };
}

async function setupProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-ready-trace-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  return root;
}

interface ChangeHandle {
  readonly folderPath: string;
  readonly folderName: string;
}

/** Create a change whose proposal verifies with the local verifier. */
async function createChange(
  root: string,
  title: string,
  deltas: Readonly<Record<string, string>> = {},
): Promise<ChangeHandle> {
  const spec = await createNewSpec(root, title);
  const proposalPath = path.join(spec.folderPath, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(proposalPath, proposal.replace(/^verify:.*$/m, `verify: ${VERIFY}`), 'utf8');

  for (const [capability, content] of Object.entries(deltas)) {
    const dir = path.join(spec.folderPath, 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), content, 'utf8');
  }

  return { folderPath: spec.folderPath, folderName: spec.folderName };
}

/** Write task 1 with the given scope and the local verify command. */
async function writeTask(change: ChangeHandle, scope: readonly string[]): Promise<void> {
  const frontmatter = `title: Task 1\nverify: ${VERIFY}\nscope: [${scope.join(', ')}]\nentry: []\nskills: []`;
  await fs.writeFile(
    path.join(change.folderPath, 'tasks', '1.md'),
    `---\n${frontmatter}\n---\n## Acceptance\n- [ ] passes cleanly\n`,
    'utf8',
  );
}

const WIDGETS_DELTA = `# Spec Delta: widgets

## Purpose

The widgets capability exists for this test with plenty of words to pass.

## ADDED Requirements

### Requirement: Widget count
The system SHALL count widgets.

#### Scenario: Count
- **WHEN** widgets are counted
- **THEN** the count is returned
`;

describe('plan ready traceability in lint', () => {
  let root: string;

  beforeEach(async () => {
    root = await setupProject();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('records the change traceability link findings on the plan_ready data', async () => {
    const change = await createChange(root, 'Count', { widgets: WIDGETS_DELTA });
    assert.equal(change.folderName, '001-count');
    await writeTask(change, ['src/widgets/quote.ts']);

    const stderr: string[] = [];
    await lintCommand([change.folderName.slice(0, 3)], {
      cwd: root,
      config: lintConfig(['widgets']),
      stderr: (text) => stderr.push(text),
    });

    const records = await readPlanReady(change.folderPath);
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].data.traceability, [
      {
        severity: 'warning',
        file: 'openspec/changes/001-count/specs/widgets/spec.md',
        message: 'widgets: no test names scenario "Count"',
      },
    ]);

    const stdout: string[] = [];
    await lintCommand([change.folderName.slice(0, 3)], {
      cwd: root,
      config: lintConfig(['widgets']),
      json: true,
      stdout: (text) => stdout.push(text),
      stderr: () => {},
    });
    const document = JSON.parse(stdout.join('')) as {
      valid: boolean;
      changes: Array<{ change: string; valid: boolean; findings: unknown[] }>;
      traceability?: unknown;
    };
    assert.equal(document.valid, true);
    assert.equal(document.changes[0].change, '001-count');
    assert.equal('traceability' in document, false);
    assert.equal('traceability' in document.changes[0], false);
    assert.ok(
      JSON.stringify(document.changes[0].findings).includes(
        'widgets: no test names scenario \\"Count\\"',
      ),
      stdout.join(''),
    );
  });

  it('adds no traceability key when no capability is opted in', async () => {
    const change = await createChange(root, 'Plain');
    await writeTask(change, []);

    await lintCommand([change.folderName.slice(0, 3)], {
      cwd: root,
      config: lintConfig([]),
      stderr: () => {},
    });

    const records = await readPlanReady(change.folderPath);
    assert.equal(records.length, 1);
    assert.deepEqual(Object.keys(records[0].data).sort(), ['hash', 'notices']);
  });

  it('reads traceability entries and leaves out malformed ones', async () => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-ready-read-'));
    await fs.mkdir(path.join(folder, '.run'), { recursive: true });
    const lines = [
      {
        type: 'plan_ready',
        timestamp: '2026-01-01T00:00:00.000Z',
        data: {
          hash: 'h1',
          notices: [],
          traceability: [
            { severity: 'warning', file: 'a.md', message: 'one' },
            { severity: 'warning', file: 'b.md' },
          ],
        },
      },
      {
        type: 'plan_ready',
        timestamp: '2026-01-02T00:00:00.000Z',
        data: { hash: 'h2', notices: [] },
      },
    ];
    await fs.writeFile(
      path.join(folder, '.run', 'plan.jsonl'),
      `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`,
      'utf8',
    );

    const records = await readPlanReady(folder);
    assert.equal(records.length, 2);
    assert.deepEqual(records[0].data, {
      hash: 'h1',
      notices: [],
      traceability: [{ severity: 'warning', file: 'a.md', message: 'one' }],
    });
    assert.deepEqual(records[1].data, { hash: 'h2', notices: [] });

    await fs.rm(folder, { recursive: true, force: true });
  });
});
