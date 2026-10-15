import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { buildOpeningPrompt } from '../src/cli/plan.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import {
  MANUAL_EDITS_HEADING,
  formatManualEditsSection,
} from '../src/core/report/manual-edits-section.js';

const INTRO =
  'Edits a human kept with osq manual after the last change that wrote these capabilities. When this change writes one of them, bring its spec in line with the edit.';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** A fresh temporary project root, removed after the test. */
async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-manual-'));
  roots.push(root);
  return root;
}

/** Writes one file under the root, creating parent folders. */
async function write(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** One record file under `openspec/manual/`: frontmatter, then the comment. */
async function writeRecord(
  root: string,
  keptAt: string,
  paths: readonly string[],
  capabilities: readonly string[],
  comment: string,
): Promise<void> {
  const name = `${keptAt.replace(/[:.]/g, '-')}.md`;
  const lines = ['---', `kept_at: ${keptAt}`, 'paths:'];
  for (const entry of paths) lines.push(`  - ${entry}`);
  if (capabilities.length === 0) {
    lines.push('capabilities: []');
  } else {
    lines.push('capabilities:');
    for (const entry of capabilities) lines.push(`  - ${entry}`);
  }
  lines.push('---', comment, '');
  await write(root, path.join('openspec', 'manual', name), lines.join('\n'));
}

/** One archived change folder with its `archived` event and delta capabilities. */
async function writeArchiveChange(
  root: string,
  folder: string,
  archivedAt: string,
  capabilities: readonly string[],
): Promise<void> {
  const change = path.join('openspec', 'changes', 'archive', folder);
  const delta = [
    '## ADDED Requirements',
    '',
    '### Requirement: Marker',
    '',
    '#### Scenario: Marked',
    '- **WHEN** it runs',
    '- **THEN** it works',
    '',
  ].join('\n');
  for (const capability of capabilities) {
    await write(root, path.join(change, 'specs', capability, 'spec.md'), delta);
  }
  await write(
    root,
    path.join(change, '.run', 'events', 'change.jsonl'),
    `${JSON.stringify({ type: 'archived', timestamp: archivedAt, data: {} })}\n`,
  );
}

/** The plan prompt for a probe change in the root. */
async function openingPrompt(root: string): Promise<string> {
  return await buildOpeningPrompt({
    projectRoot: root,
    folderPath: path.join(root, 'openspec', 'changes', '001-probe'),
    specId: '001',
    specTitle: 'Probe',
    briefContent: '# Probe\n',
    openspecRoot: DEFAULT_CONFIG.paths.openspecRoot,
    config: DEFAULT_CONFIG,
  });
}

describe('manual edits plan prompt section', () => {
  it('Open manual edits', async () => {
    const root = await makeRoot();
    await writeRecord(
      root,
      '2026-10-10T00:00:00.000Z',
      ['osq.config.ts'],
      ['cli-foundation', 'version-control'],
      'raise timeout',
    );
    await writeRecord(root, '2026-10-12T00:00:00.000Z', ['notes/todo.txt'], [], 'typo');
    await writeRecord(
      root,
      '2026-10-13T00:00:00.000Z',
      ['packages/ui/src/a.tsx'],
      ['web-inspection'],
      'fix label',
    );
    await writeArchiveChange(root, '001-vc', '2026-10-11T00:00:00.000Z', ['version-control']);

    const body = await formatManualEditsSection(root, DEFAULT_CONFIG);

    assert.deepEqual(body?.split('\n'), [
      INTRO,
      '- 2026-10-10T00:00:00.000Z cli-foundation: raise timeout (osq.config.ts)',
      '- 2026-10-13T00:00:00.000Z web-inspection: fix label (packages/ui/src/a.tsx)',
    ]);
  });

  it('No open manual edits', async () => {
    const root = await makeRoot();
    await writeArchiveChange(root, '001-vc', '2026-10-11T00:00:00.000Z', ['version-control']);

    const baseline = await openingPrompt(root);
    assert.ok(!baseline.includes(MANUAL_EDITS_HEADING));

    await writeRecord(
      root,
      '2026-10-10T00:00:00.000Z',
      ['osq.config.ts'],
      ['version-control'],
      'raise the verify timeout',
    );
    await writeRecord(root, '2026-10-09T00:00:00.000Z', ['notes/todo.txt'], [], 'typo');

    const withRecords = await openingPrompt(root);
    assert.equal(withRecords, baseline);
    assert.ok(!withRecords.includes(MANUAL_EDITS_HEADING));
  });
});
