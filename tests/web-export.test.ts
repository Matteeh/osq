import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { getMetricsReport } from '../src/core/report/report.js';
import { readInbox } from '../src/core/status/inbox-projection.js';
import { getWebGraph } from '../src/core/web/web-data-graph.js';
import type { WebChange } from '../src/core/web/web-data.js';
import { exportDashboard } from '../src/core/web/web-export.js';
import { resolveUiDir } from '../src/core/web/web-static.js';

interface ExportedDocument {
  report: unknown;
  graph: unknown;
  inbox: unknown;
  changes: Record<string, WebChange>;
}

const STUB_INDEX =
  '<!doctype html><html><head>' +
  '<script type="module" src="./assets/app-abc12345.js"></script>' +
  '</head><body><div id="root"></div></body></html>';

let projectDir: string;
let uiDir: string;
let homeDir: string;
let outputParent: string;
let now: Date;

async function writeFile(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function proposalMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    '',
    `${title} goal text.`,
    '',
  ].join('\n');
}

function taskMd(title: string, scope: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node verify.cjs',
    'scope:',
    `  - ${scope}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '',
    `- [ ] ${title} criterion`,
    '',
  ].join('\n');
}

/** One active, one archived, and one rejected change with unique id prefixes. */
async function buildFixture(root: string, home: string): Promise<void> {
  await writeFile(
    root,
    'openspec/specs/alpha/spec.md',
    '# alpha Specification\n\n## Purpose\n\nalpha purpose text.\n',
  );
  await writeFile(root, 'src/a.ts', '// scope file\n');

  const active = 'openspec/changes/010-active-change';
  await writeFile(root, `${active}/proposal.md`, proposalMd('Active Change'));
  await writeFile(root, `${active}/tasks/1.md`, taskMd('First task', 'src/a.ts'));
  await writeFile(
    root,
    `${active}/.run/results/1.md`,
    `Result under ${root}/src/a.ts with home ${home}/secrets/notes.txt.\n`,
  );

  const archived = 'openspec/changes/archive/002-archived-change';
  await writeFile(root, `${archived}/proposal.md`, proposalMd('Archived Change'));
  await writeFile(root, `${archived}/tasks/1.md`, taskMd('Archived task', 'src/b.ts'));

  const rejected = 'openspec/changes/rejected/007-rejected-change';
  await writeFile(root, `${rejected}/proposal.md`, proposalMd('Rejected Change'));
  await writeFile(root, `${rejected}/tasks/1.md`, taskMd('Rejected task', 'src/c.ts'));
  await writeFile(root, `${rejected}/.run/rejected.md`, '---\nreason: superseded\n---\n');
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function exportOptions(targetDir: string) {
  return {
    projectRoot: projectDir,
    config: DEFAULT_CONFIG,
    targetDir,
    uiDir,
    home: homeDir,
    now,
  };
}

beforeEach(async () => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-web-export-'));
  uiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-web-export-ui-'));
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-web-export-home-'));
  outputParent = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-web-export-out-'));
  now = new Date('2026-06-01T00:00:00.000Z');
  await buildFixture(projectDir, homeDir);
  await writeFile(uiDir, 'index.html', STUB_INDEX);
  await writeFile(uiDir, 'assets/app-abc12345.js', 'console.log("osq");');
});

afterEach(async () => {
  for (const dir of [projectDir, uiDir, homeDir, outputParent]) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('dashboard static export', () => {
  it('inlines every view document with scrubbed paths beside the built UI', async () => {
    const target = path.join(outputParent, 'snapshot');
    const written = await exportDashboard(exportOptions(target));

    assert.ok(written.includes(path.join(target, 'data.js')));
    assert.ok(written.includes(path.join(target, 'index.html')));
    assert.ok(written.includes(path.join(target, 'assets', 'app-abc12345.js')));

    const dataJs = await fs.readFile(path.join(target, 'data.js'), 'utf8');
    assert.match(dataJs, /^window\.__OSQ_DATA__ = /);
    assert.ok(dataJs.endsWith(';'));
    const doc = JSON.parse(dataJs.slice('window.__OSQ_DATA__ = '.length, -1)) as ExportedDocument;

    const report = await getMetricsReport(projectDir, DEFAULT_CONFIG);
    const graph = await getWebGraph(projectDir, DEFAULT_CONFIG);
    const inbox = await readInbox(projectDir, { config: DEFAULT_CONFIG, now, home: homeDir });
    assert.deepEqual(doc.report, report);
    assert.deepEqual(doc.graph, graph);
    assert.deepEqual(doc.inbox, inbox);

    assert.equal(graph.changes.length, 3);
    for (const node of graph.changes) {
      const byKey = doc.changes[node.folderKey];
      assert.ok(byKey, node.folderKey);
      assert.equal(byKey.folderKey, node.folderKey);
      const prefix = /^(\d+)/.exec(node.folderKey)?.[1] ?? '';
      assert.deepEqual(doc.changes[prefix.padStart(3, '0')], byKey, prefix);
    }

    const active = doc.changes['010-active-change'];
    assert.ok(active);
    assert.ok(active.tasks[0].result?.includes('./src/a.ts'));
    assert.ok(active.tasks[0].result?.includes('~/secrets/notes.txt'));

    for (const file of await listFiles(target)) {
      const content = await fs.readFile(file, 'utf8');
      assert.ok(!content.includes(projectDir), `absolute project path in ${file}`);
      assert.ok(!content.includes(homeDir), `absolute home path in ${file}`);
    }

    const index = await fs.readFile(path.join(target, 'index.html'), 'utf8');
    const inserted = index.indexOf('<script src="./data.js"></script>');
    assert.ok(inserted >= 0, 'data.js script missing from the copied index');
    assert.ok(index.indexOf('./assets/app-abc12345.js') > inserted);
  });

  it('refuses a non-empty target before writing anything', async () => {
    const target = path.join(outputParent, 'occupied');
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'keep.txt'), 'keep\n', 'utf8');

    await assert.rejects(
      () => exportDashboard(exportOptions(target)),
      (error: unknown) => error instanceof Error && error.message.includes(target),
    );
    await assert.rejects(() => fs.stat(path.join(target, 'data.js')));
    assert.deepEqual(await fs.readdir(target), ['keep.txt']);
  });

  it('stages the dashboard index with relative asset paths', async () => {
    const index = await fs
      .readFile(path.join(resolveUiDir(), 'index.html'), 'utf8')
      .catch(() => null);
    assert.ok(index, 'staged dashboard index is missing; run pnpm build before verifying');
    assert.match(index, /src="\.\/assets\//);
  });
});
