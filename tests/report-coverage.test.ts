import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { getMetricsReport } from '../src/core/report.js';

const fixtureReportRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixture',
  'report',
);

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-coverage-'));
  tmpDirs.push(root);
  await scaffoldProject(root);
  return root;
}

async function createChange(root: string, folder: string, tasks: string[]): Promise<string> {
  const folderPath = path.join(root, 'openspec', 'changes', folder);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folderPath, 'proposal.md'),
    `---\ntitle: ${folder}\nfeatures:\n  reads: []\n---\n## Goal\nx\n`,
    'utf8',
  );
  for (const taskNumber of tasks) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${taskNumber}.md`),
      `---\ntitle: Task ${taskNumber}\nverify: node -e "process.exit(0)"\nscope: []\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] x\n`,
      'utf8',
    );
  }
  return folderPath;
}

async function eventFile(changePath: string, taskNumber: string, content = ''): Promise<void> {
  const eventsDir = path.join(changePath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  await fs.writeFile(path.join(eventsDir, `${taskNumber}.jsonl`), content, 'utf8');
}

describe('report event coverage', () => {
  describe('fixture/report', () => {
    it('lists tasks with and without event files grouped by change', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);

      assert.equal(report.coverage.withEvents, 16);
      assert.equal(report.coverage.withoutEvents, 1);
      assert.deepEqual(report.coverage.byChange['008-opencode-harness-adapter'], {
        withEvents: ['1', '2', '3', '4', '5', '6'],
        withoutEvents: [],
      });
      assert.deepEqual(report.coverage.byChange['009-watcher-observability'], {
        withEvents: ['1', '2', '3', '4', '5', '6', '7', '8'],
        withoutEvents: [],
      });
      assert.deepEqual(report.coverage.byChange['010-report-history-state'], {
        withEvents: ['2', '3'],
        withoutEvents: ['1'],
      });
    });
  });

  describe('mixed coverage', () => {
    let root: string;

    beforeEach(async () => {
      root = await makeProject();
    });

    it('accounts for every task and sorts task numbers per change', async () => {
      const first = await createChange(root, '001-first', ['3', '1', '2']);
      const second = await createChange(root, '002-second', ['1']);
      await eventFile(first, '3', '');
      await eventFile(first, '1', '');
      await eventFile(second, '1', '');

      const report = await getMetricsReport(root, DEFAULT_CONFIG);

      assert.deepEqual(report.coverage.byChange, {
        '001-first': { withEvents: ['1', '3'], withoutEvents: ['2'] },
        '002-second': { withEvents: ['1'], withoutEvents: [] },
      });
      assert.equal(report.coverage.withEvents, 3);
      assert.equal(report.coverage.withoutEvents, 1);
    });

    it('treats an existing empty event file as covered', async () => {
      const change = await createChange(root, '001-empty-file', ['1']);
      await eventFile(change, '1', '');

      const report = await getMetricsReport(root, DEFAULT_CONFIG);

      assert.equal(report.coverage.withEvents, 1);
      assert.equal(report.coverage.withoutEvents, 0);
      assert.equal(report.history.attempts.byTask['001-empty-file/1'], 0);
    });

    it('treats a missing event file as uncovered', async () => {
      await createChange(root, '001-missing-file', ['1']);

      const report = await getMetricsReport(root, DEFAULT_CONFIG);

      assert.equal(report.coverage.withEvents, 0);
      assert.equal(report.coverage.withoutEvents, 1);
    });
  });
});
