import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { NOT_REPORTED, formatCost } from '../packages/ui/src/format.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { getWebGraph } from '../src/core/web/web-data.js';

let tmpDir: string;

async function write(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function proposal(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads:',
    '    []',
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

/** One observed lifecycle pair for a session reporting `usage`. */
function observedPair(sessionId: string, model: string, usage: Record<string, unknown>): object[] {
  return [
    {
      type: 'plan_started',
      sessionId,
      timestamp: '2026-01-01T00:00:00.000Z',
      source: 'observed',
      data: {
        harness: 'opencode',
        model,
        osqVersion: '0.0.0',
        briefHash: 'sha256:x',
      },
    },
    {
      type: 'plan_exited',
      sessionId,
      timestamp: '2026-01-01T00:01:00.000Z',
      source: 'observed',
      data: { exitCode: null, wallSeconds: 60, usage },
    },
  ];
}

function planLog(pairs: object[][]): string {
  return `${pairs
    .flat()
    .map((record) => JSON.stringify(record))
    .join('\n')}\n`;
}

/** A change whose one observed session reports tokens but no cost. */
async function buildTokensWithoutCost(root: string): Promise<void> {
  const dir = 'openspec/changes/301-token-change';
  await write(root, `${dir}/proposal.md`, proposal('Token Change'));
  await write(root, `${dir}/tasks/1.md`, task('Token task', 'src/a.ts'));
  await write(
    root,
    `${dir}/.run/plan.jsonl`,
    planLog([
      observedPair('s1', 'big-pickle', {
        inputTokens: 120,
        outputTokens: 30,
        cachedTokens: 40,
        reasoningTokens: 10,
      }),
    ]),
  );
}

/** A change with one priced and one unpriced observed session. */
async function buildPricedAndUnpriced(root: string): Promise<void> {
  const dir = 'openspec/changes/302-priced-change';
  await write(root, `${dir}/proposal.md`, proposal('Priced Change'));
  await write(root, `${dir}/tasks/1.md`, task('Priced task', 'src/b.ts'));
  await write(
    root,
    `${dir}/.run/plan.jsonl`,
    planLog([
      observedPair('s1', 'priced-model', { inputTokens: 10, cost: 0.25 }),
      observedPair('s2', 'unpriced-model', { inputTokens: 5 }),
    ]),
  );
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-web-planning-cost-'));
  await buildTokensWithoutCost(tmpDir);
  await buildPricedAndUnpriced(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('web planning cost coverage', () => {
  it('keeps a token-only planning cost null with zero cost coverage', async () => {
    const graph = await getWebGraph(tmpDir, DEFAULT_CONFIG);
    const token = graph.changes.find((node) => node.folderKey === '301-token-change');
    assert.ok(token);

    // Tokens and durations are observed unchanged, but no session reported a cost.
    assert.equal(token.planning.cost, null);
    assert.deepEqual(token.planning.costCoverage, { reported: 0, total: 1 });
    assert.deepEqual(token.planning.tokens, [
      {
        harness: 'opencode',
        model: 'big-pickle',
        input: 120,
        cachedInput: 40,
        output: 30,
        reasoning: 10,
        total: 150,
      },
    ]);
    assert.deepEqual(token.planning.durations, [60]);

    assert.equal(formatCost(token.planning.cost, token.planning.costCoverage), NOT_REPORTED);
    assert.equal(formatCost(token.planning.cost, token.planning.costCoverage), 'not reported');
  });

  it('sums only the priced session while covering both', async () => {
    const graph = await getWebGraph(tmpDir, DEFAULT_CONFIG);
    const priced = graph.changes.find((node) => node.folderKey === '302-priced-change');
    assert.ok(priced);

    assert.equal(priced.planning.cost, 0.25);
    assert.deepEqual(priced.planning.costCoverage, { reported: 1, total: 2 });
    assert.deepEqual(
      priced.planning.tokens.map((group) => [group.model, group.input]),
      [
        ['priced-model', 10],
        ['unpriced-model', 5],
      ],
    );
  });
});
