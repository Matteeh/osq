import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Builds the read-only dashboard fixture under `root`. It covers active,
 * archived, and rejected locations, a duplicate numeric id, two capability
 * writes, partial execution and planning evidence, malformed optional lines,
 * a result, and a typed human recertification. The running lock is injected by
 * the test because it must reference a live process id.
 */

async function write(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function proposal(title: string, dependsOn: string[], reads: string[]): string {
  return [
    '---',
    `title: ${title}`,
    `depends_on: [${dependsOn.map((d) => `"${d}"`).join(', ')}]`,
    'verify: node verify.cjs',
    'features:',
    '  reads:',
    ...(reads.length > 0 ? reads.map((r) => `    - ${r}`) : ['    []']),
    '---',
    '## Goal',
    '',
    `${title} goal text.`,
    '',
  ].join('\n');
}

function task(title: string, scopeFile: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node verify.cjs',
    'scope:',
    `  - ${scopeFile}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '',
    `- [ ] ${title} criterion`,
    '',
  ].join('\n');
}

function jsonl(events: Record<string, unknown>[]): string {
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
}

const CAPABILITY_SPEC = (id: string): string =>
  [
    `# ${id} Specification`,
    '',
    '## Purpose',
    '',
    `${id} capability purpose text.`,
    '',
    '### Requirement: Example behavior',
    'The system SHALL behave.',
    '',
  ].join('\n');

async function buildActive(root: string): Promise<void> {
  const dir = 'openspec/changes/010-active-change';
  await write(root, `${dir}/proposal.md`, proposal('Active Change', ['003', '003'], ['alpha']));
  await write(
    root,
    `${dir}/brief.md`,
    [
      '---',
      'date: 2026-01-01T00:00:00.000Z',
      'planner: opencode/big-pickle',
      '---',
      '',
      'Brief body for active change.',
      '',
    ].join('\n'),
  );
  await write(root, `${dir}/tasks/1.md`, task('First task', 'src/a.ts'));
  await write(root, `${dir}/tasks/2.md`, task('Running task', 'src/b.ts'));
  await write(root, `${dir}/tasks/3.md`, task('Regressed task', 'src/c.ts'));
  await write(root, `${dir}/specs/alpha/spec.md`, CAPABILITY_SPEC('alpha'));
  await write(root, `${dir}/specs/beta/spec.md`, CAPABILITY_SPEC('beta'));
  await write(root, `${dir}/.run/approved`, 'sha256:active\n');
  await write(
    root,
    `${dir}/.run/manifest.json`,
    `${JSON.stringify(
      {
        hashes: {},
        osqVersion: '0.0.0',
        harness: 'opencode',
        model: 'default',
        planner: 'opencode/big-pickle',
        effort: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        approvedAt: '2026-01-02T00:00:00.000Z',
        planningSessions: 2,
      },
      null,
      2,
    )}\n`,
  );
  await write(root, `${dir}/.run/done/1`, '2026-01-03T00:00:00.000Z\n');
  await write(root, `${dir}/.run/results/1.md`, 'Task one result text.\n');
  await write(
    root,
    `${dir}/.run/regressed/3.md`,
    '---\nreason: scope_regression\n---\nregressed detail\n',
  );

  await write(
    root,
    `${dir}/.run/events/1.jsonl`,
    jsonl([
      {
        type: 'measures',
        timestamp: '2026-01-03T00:00:00.000Z',
        data: { phase: 'start', scopeResolver: 2, scopeFiles: 2 },
      },
      {
        type: 'started',
        timestamp: '2026-01-03T00:00:05.000Z',
        data: { harness: 'opencode', model: 'big-pickle', attempt: 1 },
      },
      {
        type: 'tokens',
        timestamp: '2026-01-03T00:00:07.000Z',
        data: { input: 100, cachedTokens: 40, output: 20, total: 160 },
      },
      { type: 'done', timestamp: '2026-01-03T00:00:10.000Z', data: { cost: 0.5 } },
      {
        type: 'measures',
        timestamp: '2026-01-03T00:00:10.000Z',
        data: { phase: 'end', scopeResolver: 2, scopeFiles: 2 },
      },
      {
        type: 'recertification',
        timestamp: '2026-01-04T00:00:00.000Z',
        data: {
          task: '1',
          outcome: 'passed',
          differingPaths: ['src/a.ts (modified)'],
          attribution: [{ path: 'src/a.ts (modified)', attribution: 'ambiguous' }],
          command: 'node verify.cjs',
          exitCode: 0,
          timedOut: false,
        },
      },
    ]),
  );
  await write(
    root,
    `${dir}/.run/events/2.jsonl`,
    jsonl([
      {
        type: 'started',
        timestamp: '2026-01-05T00:00:01.000Z',
        data: { harness: 'codex', model: 'gpt-5', attempt: 1 },
      },
    ]),
  );
  await write(
    root,
    `${dir}/.run/events/3.jsonl`,
    jsonl([
      {
        type: 'started',
        timestamp: '2026-01-06T00:00:00.000Z',
        data: { harness: 'opencode', model: 'big-pickle', attempt: 1 },
      },
      {
        type: 'regressed',
        timestamp: '2026-01-06T00:00:05.000Z',
        data: { reason: 'scope_regression', exitCode: 1, differingPaths: ['src/c.ts (modified)'] },
      },
      {
        type: 'recertification',
        timestamp: '2026-01-06T00:00:10.000Z',
        data: {
          task: '3',
          outcome: 'requeued',
          command: 'node verify.cjs',
          exitCode: 1,
          timedOut: false,
        },
      },
    ]),
  );
  await write(
    root,
    `${dir}/.run/plan.jsonl`,
    [
      JSON.stringify({
        type: 'plan_started',
        sessionId: 's1',
        timestamp: '2026-01-01T00:00:00.000Z',
        data: {
          harness: 'opencode',
          model: 'big-pickle',
          osqVersion: '0.0.0',
          briefHash: 'sha256:x',
        },
      }),
      'not-json',
      JSON.stringify({
        type: 'plan_exited',
        sessionId: 's1',
        timestamp: '2026-01-01T00:01:00.000Z',
        data: {
          exitCode: 0,
          wallSeconds: 60,
          usage: {
            inputTokens: 50,
            outputTokens: 10,
            cachedTokens: 5,
            reasoningTokens: null,
            cost: 0.25,
          },
        },
      }),
      JSON.stringify({
        type: 'plan_started',
        sessionId: 's2',
        timestamp: '2026-01-01T01:00:00.000Z',
        data: {
          harness: 'codex',
          model: 'gpt-5',
          osqVersion: '0.0.0',
          briefHash: 'sha256:y',
        },
      }),
      '',
    ].join('\n'),
  );
}

async function buildArchivedDuplicate(root: string): Promise<void> {
  const dir = 'openspec/changes/archive/002-archived-change';
  await write(root, `${dir}/proposal.md`, proposal('Archived Change', [], []));
  await write(root, `${dir}/tasks/1.md`, task('Archived task', 'src/d.ts'));
  // A malformed optional manifest must degrade to null fields, not crash.
  await write(root, `${dir}/.run/manifest.json`, '{not-json\n');
  await write(root, `${dir}/.run/done/1`, '2026-02-01T00:00:00.000Z\n');
  await write(
    root,
    `${dir}/.run/events/change.jsonl`,
    jsonl([{ type: 'archived', timestamp: '2026-02-01T00:00:00.000Z', data: {} }]),
  );
  await write(
    root,
    `${dir}/.run/events/1.jsonl`,
    `${jsonl([
      {
        type: 'started',
        timestamp: '2026-01-20T00:00:00.000Z',
        data: { harness: 'opencode', model: 'big-pickle', attempt: 1 },
      },
      { type: 'done', timestamp: '2026-01-20T00:00:30.000Z', data: { cost: 1.5 } },
    ])}not-json\n`,
  );
}

async function buildRejectedDuplicate(root: string): Promise<void> {
  const dir = 'openspec/changes/rejected/002-rejected-change';
  await write(root, `${dir}/proposal.md`, proposal('Rejected Change', [], []));
  await write(root, `${dir}/tasks/1.md`, task('Rejected task', 'src/e.ts'));
  await write(root, `${dir}/.run/rejected.md`, '---\nreason: superseded\n---\n');
  await write(
    root,
    `${dir}/.run/events/change.jsonl`,
    jsonl([
      {
        type: 'rejected',
        timestamp: '2026-03-01T00:00:00.000Z',
        data: { reason: 'superseded', timestamp: '2026-03-01T00:00:00.000Z' },
      },
    ]),
  );
}

async function buildArchivedUnique(root: string): Promise<void> {
  const dir = 'openspec/changes/archive/003-archived-unique';
  await write(root, `${dir}/proposal.md`, proposal('Unique Archived', [], []));
  await write(root, `${dir}/tasks/1.md`, task('Unique task', 'src/f.ts'));
  await write(root, `${dir}/specs/alpha/spec.md`, CAPABILITY_SPEC('alpha'));
  await write(
    root,
    `${dir}/.run/events/change.jsonl`,
    jsonl([{ type: 'archived', timestamp: '2026-02-15T00:00:00.000Z', data: {} }]),
  );
  await write(
    root,
    `${dir}/.run/events/1.jsonl`,
    jsonl([
      {
        type: 'started',
        timestamp: '2026-02-10T00:00:00.000Z',
        data: { harness: 'opencode', model: 'big-pickle', attempt: 1 },
      },
      { type: 'done', timestamp: '2026-02-10T00:00:20.000Z', data: { cost: 0.75 } },
    ]),
  );
}

/** Writes the complete dashboard fixture beneath `root`. */
export async function buildWebFixture(root: string): Promise<void> {
  await write(root, 'openspec/specs/alpha/spec.md', CAPABILITY_SPEC('alpha'));
  await write(root, 'openspec/specs/beta/spec.md', CAPABILITY_SPEC('beta'));
  // An existing scope file proves resolved paths carry a readable location.
  await write(root, 'src/a.ts', '// task one scope file\n');
  await buildActive(root);
  await buildArchivedDuplicate(root);
  await buildRejectedDuplicate(root);
  await buildArchivedUnique(root);
}

/** Writes the live running lock into the active change's task 2. */
export async function writeRunningLock(root: string, startedAtMs: number): Promise<void> {
  await write(
    root,
    'openspec/changes/010-active-change/.run/running/2.pid',
    JSON.stringify({ pid: process.pid, startedAt: startedAtMs }),
  );
}
