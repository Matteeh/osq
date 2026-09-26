import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { formatSpecDetails, getSpecDetailsFromFolder } from '../src/core/status/show.js';

const tmpDirs: string[] = [];
const ts = '2026-09-18T00:00:00.000Z';

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** The default project config with pricing opted in. */
function traceConfig(): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    limits: { ...DEFAULT_CONFIG.limits },
    traceability: { capabilities: ['pricing'], mode: 'warn' },
  };
}

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-focused-show-'));
  tmpDirs.push(root);
  await fs.mkdir(path.join(root, 'openspec', 'changes'), { recursive: true });
  return root;
}

async function writeFile(root: string, relative: string, content: string): Promise<void> {
  const full = path.join(root, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

/** A pricing project with one real scenario test file naming one scenario. */
async function writePricingProject(root: string): Promise<void> {
  await writeFile(
    root,
    'src/pricing/quote.ts',
    'export function quote(quantity: number): number {\n  return quantity;\n}\n',
  );
  await writeFile(
    root,
    'tests/pricing-quote.test.ts',
    "import { scenario } from '@matteeh/osq/testing';\nimport { quote } from '../src/pricing/quote.js';\nscenario('pricing', 'Volume discount tiers', { covers: quote }, () => {});\n",
  );
}

/** One `focused_ran` event with the subset of fields show reads. */
function focusedEvent(outcome: string, duration: number): Record<string, unknown> {
  return {
    type: 'focused_ran',
    timestamp: ts,
    data: {
      command: "node --test --test-reporter=tap 'tests/pricing-quote.test.ts'",
      files: ['tests/pricing-quote.test.ts'],
      scenarios: ['pricing: Volume discount tiers'],
      outcome,
      exitCode: outcome === 'passed' ? 0 : 1,
      duration,
      timedOut: false,
      output: '',
    },
  };
}

/**
 * A change folder whose task files carry the given resolved scope, and whose
 * numbered event streams carry the given hand-written events.
 */
async function writeChange(
  root: string,
  relative: string,
  streams: Record<string, Record<string, unknown>[]>,
  scope: readonly string[] = [],
): Promise<string> {
  const folderPath = path.join(root, 'openspec', 'changes', relative);
  await writeFile(
    root,
    `openspec/changes/${relative}/proposal.md`,
    `---\ntitle: ${relative}\nverify: node verify.cjs\n---\n## Goal\n\nFixture change.\n`,
  );
  for (const [taskNumber, events] of Object.entries(streams)) {
    await writeFile(
      root,
      `openspec/changes/${relative}/tasks/${taskNumber}.md`,
      `---\ntitle: Task ${taskNumber}\nverify: node verify.cjs\nscope: [${scope.join(', ')}]\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] x\n`,
    );
    const body = events.map((event) => JSON.stringify(event)).join('\n');
    await writeFile(
      root,
      `openspec/changes/${relative}/.run/events/${taskNumber}.jsonl`,
      `${body}\n`,
    );
  }
  return folderPath;
}

describe('show focused runs', () => {
  it('lists failed then passed runs after the scenarios line', async () => {
    const root = await tempRoot();
    await writePricingProject(root);
    const changeDir = await writeChange(
      root,
      '001-focused',
      {
        '1': [{ type: 'started', timestamp: ts, data: { task: 1 } }],
        '2': [focusedEvent('failed', 0.14), focusedEvent('passed', 0.13)],
      },
      ['tests/pricing-quote.test.ts'],
    );

    const details = await getSpecDetailsFromFolder(root, changeDir, 'active', traceConfig());
    const lines = formatSpecDetails(details).split('\n');

    const scenariosIndex = lines.findIndex((line) => line.includes('Scenarios:'));
    const focusedIndex = lines.findIndex((line) => line.includes('Focused runs:'));
    assert.ok(scenariosIndex >= 0, lines.join('\n'));
    assert.ok(focusedIndex > scenariosIndex, lines.join('\n'));
    assert.equal(
      lines[focusedIndex],
      '      Focused runs: failed 0.14s (attempt ended, verify skipped), passed 0.13s',
    );
  });

  it('renders a problem entry without the failed annotation and no line without events', async () => {
    const root = await tempRoot();
    await writePricingProject(root);
    const changeDir = await writeChange(root, '002-mixed', {
      '1': [{ type: 'started', timestamp: ts, data: { task: 1 } }],
      '2': [focusedEvent('problem', 0.2)],
    });

    const details = await getSpecDetailsFromFolder(root, changeDir, 'active', traceConfig());
    const lines = formatSpecDetails(details).split('\n');

    const focusedIndex = lines.findIndex((line) => line.includes('Focused runs:'));
    assert.ok(focusedIndex >= 0, lines.join('\n'));
    assert.equal(lines[focusedIndex], '      Focused runs: problem 0.20s');

    const task1Start = lines.findIndex((line) => line.includes('. Task 1 ['));
    const task2Start = lines.findIndex((line) => line.includes('. Task 2 ['));
    const task1Block = lines.slice(task1Start, task2Start).join('\n');
    assert.equal(task1Block.includes('Focused runs:'), false, task1Block);
  });
});
