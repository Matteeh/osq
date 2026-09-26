import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { formatMetricsReport, getMetricsReport } from '../src/core/report/report.js';
import { formatSpecDetails, getSpecDetails } from '../src/core/status/show.js';

const tmpDirs: string[] = [];
const ts = '2026-09-18T00:00:00.000Z';

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-dependencies-report-'));
  tmpDirs.push(root);
  await fs.mkdir(path.join(root, 'openspec', 'changes'), { recursive: true });
  return root;
}

function dependencyEvent(
  added: readonly { file: string; name: string }[],
): Record<string, unknown> {
  return { type: 'dependencies_added', timestamp: ts, data: { added } };
}

/** One change folder with a proposal and numbered task event streams. */
async function writeChange(
  root: string,
  relative: string,
  streams: Record<string, Record<string, unknown>[]>,
): Promise<string> {
  const folderPath = path.join(root, 'openspec', 'changes', relative);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folderPath, 'proposal.md'),
    `---\ntitle: ${relative}\ndepends_on: []\nfeatures:\n  reads: []\nverify: node -e "process.exit(0)"\n---\n## Goal\n\nFixture change.\n`,
    'utf8',
  );
  const eventsDir = path.join(folderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  for (const [taskNumber, events] of Object.entries(streams)) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${taskNumber}.md`),
      `---\ntitle: Task ${taskNumber}\nverify: node -e "process.exit(0)"\nscope: []\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] x\n`,
      'utf8',
    );
    const body = events.map((event) => JSON.stringify(event)).join('\n');
    await fs.writeFile(path.join(eventsDir, `${taskNumber}.jsonl`), `${body}\n`, 'utf8');
  }
  return folderPath;
}

describe('report dependencies added per change', () => {
  it('lists only changes whose streams added packages, in change order', async () => {
    const root = await tempRoot();
    await writeChange(root, '013-quiet', {
      '1': [{ type: 'started', timestamp: ts, data: {} }],
    });
    await writeChange(root, '012-adds', {
      '1': [dependencyEvent([{ file: 'package.json', name: 'zod' }])],
    });

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    assert.deepEqual(report.history.dependencies, [
      { change: '012-adds', added: [{ file: 'package.json', name: 'zod' }] },
    ]);

    const text = formatMetricsReport(report);
    assert.ok(text.includes('Dependencies added:'), text);
    assert.ok(text.includes('  012-adds: zod (package.json)'), text);
    assert.equal(text.includes('013-quiet'), false, text);

    const output = await reportCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      stdout: () => {},
    });
    assert.ok(output.includes('  012-adds: zod (package.json)'), output);

    const raw = await reportCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: () => {},
    });
    const parsed = JSON.parse(raw) as { history: { dependencies: unknown } };
    assert.deepEqual(parsed.history.dependencies, [
      { change: '012-adds', added: [{ file: 'package.json', name: 'zod' }] },
    ]);
  });

  it('omits the field and section when nothing was added', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-plain', {
      '1': [{ type: 'started', timestamp: ts, data: {} }],
    });

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    assert.equal(report.history.dependencies, undefined);
    assert.equal(formatMetricsReport(report).includes('Dependencies added:'), false);

    const raw = await reportCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: () => {},
    });
    const parsed = JSON.parse(raw) as { history: Record<string, unknown> };
    assert.equal('dependencies' in parsed.history, false);
  });

  it('dedupes every event of every attempt and sorts by file then name', async () => {
    const root = await tempRoot();
    await writeChange(root, '005-multi', {
      '1': [
        dependencyEvent([
          { file: 'package.json', name: 'zod' },
          { file: 'package.json', name: 'axios' },
        ]),
        dependencyEvent([{ file: 'package.json', name: 'zod' }]),
      ],
      '2': [
        dependencyEvent([
          { file: 'packages/ui/package.json', name: 'zustand' },
          { file: 'package.json', name: 'axios' },
        ]),
      ],
    });

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    assert.deepEqual(report.history.dependencies, [
      {
        change: '005-multi',
        added: [
          { file: 'package.json', name: 'axios' },
          { file: 'package.json', name: 'zod' },
          { file: 'packages/ui/package.json', name: 'zustand' },
        ],
      },
    ]);
    assert.ok(
      formatMetricsReport(report).includes(
        '  005-multi: axios (package.json), zod (package.json), zustand (packages/ui/package.json)',
      ),
    );
  });

  it('never counts a rejected folder', async () => {
    const root = await tempRoot();
    await writeChange(root, 'rejected/009-no', {
      '1': [dependencyEvent([{ file: 'package.json', name: 'vue' }])],
    });

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    assert.equal(report.history.dependencies, undefined);
  });
});

describe('show dependencies added', () => {
  it('prints the line under the task after instructions changed', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-show', {
      '1': [
        { type: 'instructions_changed', timestamp: ts, data: { task: 1, changed: ['AGENTS.md'] } },
        dependencyEvent([
          { file: 'package.json', name: 'zod' },
          { file: 'package.json', name: 'axios' },
          { file: 'package.json', name: 'zod' },
        ]),
      ],
      '2': [{ type: 'started', timestamp: ts, data: { task: 2 } }],
    });

    const details = await getSpecDetails(root, '001', DEFAULT_CONFIG);
    const lines = formatSpecDetails(details).split('\n');
    const instructionsIndex = lines.findIndex((line) =>
      line.includes('Instructions changed after approval:'),
    );
    const dependenciesIndex = lines.findIndex((line) => line.includes('Dependencies added:'));
    assert.ok(instructionsIndex >= 0, 'instructions line should render');
    assert.ok(dependenciesIndex > instructionsIndex, 'dependencies line should follow it');
    assert.equal(
      lines[dependenciesIndex],
      '      Dependencies added: axios (package.json), zod (package.json)',
    );

    const task2Start = lines.findIndex((line) => line.includes('. Task 2 ['));
    const task2Block = lines.slice(task2Start, task2Start + 10).join('\n');
    assert.equal(task2Block.includes('Dependencies added:'), false, task2Block);
  });

  it('prints no line for a task whose stream holds no dependencies_added event', async () => {
    const root = await tempRoot();
    await writeChange(root, '002-plain', {
      '1': [{ type: 'started', timestamp: ts, data: { task: 1 } }],
    });

    const details = await getSpecDetails(root, '002', DEFAULT_CONFIG);
    assert.equal(formatSpecDetails(details).includes('Dependencies added:'), false);
  });
});
