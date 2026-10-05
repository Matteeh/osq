import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { buildValidation } from '../src/core/status/show-model-validation.js';
import type { TimelineEvent } from '../src/core/status/show-types.js';
import { validationLines } from '../src/core/status/show-validation-lines.js';
import {
  formatShowJson,
  formatShowText,
  formatSpecDetails,
  getSpecDetails,
} from '../src/core/status/show.js';

const CHANGES_DIR = path.join('openspec', 'changes');
const STATUS_DIR = path.join(process.cwd(), 'src', 'core', 'status');

function proposalMd(title: string): string {
  return `---\ntitle: ${title}\ndepends_on: []\nverify: node verify.cjs\n---\n## Goal\n\n${title} goal.\n`;
}

function taskMd(title: string): string {
  return `---\ntitle: ${title}\nverify: node verify.cjs\nscope: []\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] ${title} acceptance\n`;
}

async function createArchivedChange(
  root: string,
  folderName: string,
  title: string,
): Promise<string> {
  const folderPath = path.join(root, CHANGES_DIR, 'archive', folderName);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.mkdir(path.join(folderPath, '.run', 'events'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMd(title), 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMd(title), 'utf8');
  // An approval seal keeps `osq show --json` free of the unapproved digest.
  await fs.writeFile(path.join(folderPath, '.run', 'approved'), 'sha256:abc\n', 'utf8');
  return folderPath;
}

/** Writes the archived change's own `.run/events/change.jsonl` from raw events. */
async function writeChangeEvents(folderPath: string, events: unknown[]): Promise<void> {
  await fs.writeFile(
    path.join(folderPath, '.run', 'events', 'change.jsonl'),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    'utf8',
  );
}

function archivedEvent(): Record<string, unknown> {
  return {
    type: 'archived',
    timestamp: '2026-10-04T09:00:00.000Z',
    data: { archivePath: 'archive/042' },
  };
}

function finding(problem: string): Record<string, unknown> {
  return {
    kind: 'scenario',
    capability: 'pricing',
    requirement: 'Volume discount',
    scenario: 'Ten or more',
    problem,
    detail: problem === 'no_test' ? 'Only the five-item tier is tested.' : `Detail for ${problem}.`,
  };
}

function validatedEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'validator_ran',
    timestamp: '2026-10-04T10:00:00.000Z',
    data: {
      outcome: 'validated',
      harness: 'claude',
      model: 'claude-opus-5-5',
      duration: 61.4,
      exitCode: 0,
      scenarios: 3,
      findings: [finding('no_test')],
      restored: [],
      ...overrides,
    },
  };
}

describe('osq show validation', () => {
  let root = '';

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-show-validation-'));
  });

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('Findings shown', async () => {
    const folderPath = await createArchivedChange(root, '042-pricing', 'Pricing');
    const event = validatedEvent();
    await writeChangeEvents(folderPath, [archivedEvent(), event]);

    const details = await getSpecDetails(root, '042', DEFAULT_CONFIG);
    assert.ok(details.validation, 'expected a validation block');
    assert.equal(details.validation.outcome, 'validated');
    assert.equal(details.validation.duration, 61.4);

    const text = formatShowText(details);
    assert.ok(
      text.includes(
        'Validation: validated by claude/claude-opus-5-5 in 61s, 3 scenarios judged, 1 findings',
      ),
      text,
    );
    assert.ok(
      text.includes(
        '  - pricing: Volume discount / Ten or more: no test covers it. Only the five-item tier is tested.',
      ),
      text,
    );
    assert.ok(text.indexOf('Tasks:') < text.indexOf('Validation:'), 'before the task section');
    assert.ok(
      text.indexOf('Validation:') < text.indexOf('Planning Sessions:'),
      'not after the planning section',
    );

    const document = JSON.parse(formatShowJson(details)) as Record<string, unknown>;
    assert.deepEqual(document.validation, event.data);
    const keys = Object.keys(document);
    assert.ok(keys.indexOf('validation') < keys.indexOf('digest'), 'validation before digest');
  });

  it('Run that never started shown', async () => {
    const folderPath = await createArchivedChange(root, '043-nobase', 'No Base');
    await writeChangeEvents(folderPath, [
      {
        type: 'validator_ran',
        timestamp: '2026-10-04T10:00:00.000Z',
        data: {
          outcome: 'not_run',
          harness: 'claude',
          model: 'claude-opus-5-5',
          duration: 0,
          exitCode: null,
          scenarios: 0,
          findings: [],
          restored: [],
          reason: 'no_base',
        },
      },
    ]);

    const details = await getSpecDetails(root, '043', DEFAULT_CONFIG);
    assert.equal(details.validation?.outcome, 'not_run');
    assert.deepEqual(validationLines(details), ['', 'Validation: not run (no_base)']);

    const text = formatShowText(details);
    assert.ok(text.includes('Validation: not run (no_base)'), text);
    assert.ok(!text.includes('no test covers it'), text);

    const document = JSON.parse(formatShowJson(details)) as { validation?: { outcome: string } };
    assert.equal(document.validation?.outcome, 'not_run');
  });

  it('No validator event', async () => {
    const folderPath = await createArchivedChange(root, '044-none', 'None');
    await writeChangeEvents(folderPath, [archivedEvent()]);

    const details = await getSpecDetails(root, '044', DEFAULT_CONFIG);
    assert.equal(details.validation, undefined);
    assert.deepEqual(validationLines(details), []);
    assert.ok(!formatShowText(details).includes('Validation:'), 'printed a Validation line');

    const document = JSON.parse(formatShowJson(details)) as Record<string, unknown>;
    assert.equal('validation' in document, false);
  });

  it('takes the latest event by timestamp and ignores task streams', async () => {
    const folderPath = await createArchivedChange(root, '045-latest', 'Latest');
    await writeChangeEvents(folderPath, [
      {
        type: 'validator_ran',
        timestamp: '2026-10-04T12:00:00.000Z',
        data: {
          outcome: 'failed',
          harness: 'claude',
          model: 'claude-opus-5-5',
          duration: 62,
          exitCode: 1,
          scenarios: 0,
          findings: [],
          restored: [],
        },
      },
      {
        type: 'validator_ran',
        timestamp: '2026-10-04T10:00:00.000Z',
        data: {
          outcome: 'validated',
          harness: 'claude',
          model: 'claude-opus-5-5',
          duration: 10,
          exitCode: 0,
          scenarios: 1,
          findings: [],
          restored: [],
        },
      },
    ]);

    const details = await getSpecDetails(root, '045', DEFAULT_CONFIG);
    assert.equal(details.validation?.outcome, 'failed');

    const timeline: TimelineEvent[] = [
      {
        taskNumber: '3',
        type: 'validator_ran',
        timestamp: '2026-10-04T13:00:00.000Z',
        data: { outcome: 'failed' },
      },
      {
        taskNumber: 'change',
        type: 'validator_ran',
        timestamp: '2026-10-04T11:00:00.000Z',
        data: { outcome: 'validated' },
      },
    ];
    assert.equal(buildValidation(timeline)?.outcome, 'validated');
    assert.equal(buildValidation([]), undefined);
    assert.equal(buildValidation([{ taskNumber: '1', type: 'text', timestamp: 'x' }]), undefined);
  });

  it('words every problem and prints restored paths', () => {
    const base = validatedEvent().data as Record<string, unknown>;
    const data = {
      ...base,
      scenarios: 3,
      findings: [finding('no_code'), finding('no_test'), finding('passes_without_change')],
      restored: ['src/a.ts', 'src/b.ts'],
    };
    const lines = validationLines({
      validation: data,
    } as unknown as Parameters<typeof validationLines>[0]);
    assert.deepEqual(lines, [
      '',
      'Validation: validated by claude/claude-opus-5-5 in 61s, 3 scenarios judged, 3 findings',
      '  - pricing: Volume discount / Ten or more: no code meets it. Detail for no_code.',
      '  - pricing: Volume discount / Ten or more: no test covers it. Only the five-item tier is tested.',
      '  - pricing: Volume discount / Ten or more: its test passes without the change. Detail for passes_without_change.',
      '  Restored: src/a.ts, src/b.ts',
    ]);
  });

  it('rounds a failed run to whole seconds without findings', () => {
    const data = {
      outcome: 'failed',
      harness: 'pi',
      model: 'm',
      duration: 2.5,
      exitCode: 1,
      scenarios: 2,
      findings: [],
      restored: [],
    };
    const detail = { validation: data } as unknown as Parameters<typeof validationLines>[0];
    assert.deepEqual(validationLines(detail), ['', 'Validation: failed by pi/m in 3s']);
  });

  it('reads no files in the new validation modules', async () => {
    for (const file of ['show-model-validation.ts', 'show-validation-lines.ts']) {
      const source = await fs.readFile(path.join(STATUS_DIR, file), 'utf8');
      assert.doesNotMatch(source, /node:fs/, `${file} imports node:fs`);
    }
  });

  it('places validation after the task section in the plain text renderer', async () => {
    const folderPath = await createArchivedChange(root, '046-order', 'Order');
    await writeChangeEvents(folderPath, [archivedEvent(), validatedEvent()]);
    const details = await getSpecDetails(root, '046', DEFAULT_CONFIG);

    const text = formatSpecDetails(details);
    assert.ok(text.indexOf('Tasks:') < text.indexOf('Validation:'));
  });
});
