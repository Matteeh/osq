import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { hashChangeFolder } from '../src/core/spec/hasher.js';
import { archiveSpecFolder } from '../src/watcher/archiver.js';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

interface ChangeProject {
  readonly projectRoot: string;
  readonly changeFolder: string;
}

/** A temporary scaffolded project holding one change, as tests/archiver.test.ts builds one. */
async function makeChangeProject(): Promise<ChangeProject> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-archive-seal-'));
  tempDirs.push(projectRoot);
  await scaffoldProject(projectRoot);
  const change = await createNewSpec(projectRoot, 'Archive Seal');
  return { projectRoot, changeFolder: change.folderPath };
}

/** The "Root task lines" table: each line the change's root tasks.md holds, before and after. */
const ROOT_TASK_ROWS = [
  { before: '- [ ] 1. first item', after: '- [x] 1. first item' },
  { before: '  - [ ] nested item', after: '  - [x] nested item' },
  { before: '-\t[ ] a tab after the dash', after: '-\t[x] a tab after the dash' },
  { before: '* [ ] a star item', after: '* [ ] a star item' },
  { before: '- [x] 2. already done', after: '- [x] 2. already done' },
  { before: '-[ ] no space after the dash', after: '-[ ] no space after the dash' },
];

const NESTED_TASKS = '- [ ] a nested tasks file keeps its bytes\n';

describe('Archive keeps the approval seal', () => {
  it('watcher-and-harness: Archived seal matches approval', async () => {
    const { projectRoot, changeFolder } = await makeChangeProject();
    const rootTasks = `${ROOT_TASK_ROWS.map((row) => row.before).join('\n')}\n`;
    await fs.writeFile(path.join(changeFolder, 'tasks.md'), rootTasks, 'utf8');
    await fs.mkdir(path.join(changeFolder, 'notes'), { recursive: true });
    await fs.writeFile(path.join(changeFolder, 'notes', 'tasks.md'), NESTED_TASKS, 'utf8');

    const seal = await hashChangeFolder(changeFolder);
    await fs.mkdir(path.join(changeFolder, '.run'), { recursive: true });
    await fs.writeFile(path.join(changeFolder, '.run', 'approved'), seal, 'utf8');

    const archivedPath = await archiveSpecFolder(projectRoot, changeFolder, DEFAULT_CONFIG);

    const marker = await fs.readFile(path.join(archivedPath, '.run', 'approved'), 'utf8');
    assert.equal(await hashChangeFolder(archivedPath), marker);
  });

  it('watcher-and-harness: Root task lines', async () => {
    const { projectRoot, changeFolder } = await makeChangeProject();
    const rootTasks = `${ROOT_TASK_ROWS.map((row) => row.before).join('\n')}\n`;
    await fs.writeFile(path.join(changeFolder, 'tasks.md'), rootTasks, 'utf8');

    const archivedPath = await archiveSpecFolder(projectRoot, changeFolder, DEFAULT_CONFIG);
    const archivedLines = (await fs.readFile(path.join(archivedPath, 'tasks.md'), 'utf8')).split(
      '\n',
    );

    for (const row of ROOT_TASK_ROWS) {
      assert.ok(
        archivedLines.includes(row.after),
        `expected the whole line ${JSON.stringify(row.after)} in:\n${archivedLines.join('\n')}`,
      );
    }
  });

  it('watcher-and-harness: Nested tasks file keeps its bytes', async () => {
    const { projectRoot, changeFolder } = await makeChangeProject();
    await fs.mkdir(path.join(changeFolder, 'notes'), { recursive: true });
    await fs.writeFile(path.join(changeFolder, 'notes', 'tasks.md'), NESTED_TASKS, 'utf8');

    const archivedPath = await archiveSpecFolder(projectRoot, changeFolder, DEFAULT_CONFIG);

    assert.equal(
      await fs.readFile(path.join(archivedPath, 'notes', 'tasks.md'), 'utf8'),
      NESTED_TASKS,
    );
  });

  it('watcher-and-harness: Archive without a root tasks file', async () => {
    const { projectRoot, changeFolder } = await makeChangeProject();
    await fs.rm(path.join(changeFolder, 'tasks.md'));

    const archivedPath = await archiveSpecFolder(projectRoot, changeFolder, DEFAULT_CONFIG);

    assert.equal((await fs.stat(archivedPath)).isDirectory(), true);
    await assert.rejects(fs.stat(path.join(archivedPath, 'tasks.md')), { code: 'ENOENT' });
  });
});
