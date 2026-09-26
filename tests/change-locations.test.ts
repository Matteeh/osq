import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import {
  changeTrees,
  changesDirLabel,
  findChange,
  listChanges,
  locateFolder,
} from '../src/core/status/change-locations.js';

const CHANGES = path.join('openspec', 'changes');

async function makeFolder(...parts: string[]): Promise<string> {
  const folderPath = path.join(...parts);
  await fs.mkdir(folderPath, { recursive: true });
  return folderPath;
}

describe('change locations', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-change-locations-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('lists directories only, active then archived then rejected, each by numeric prefix', async () => {
    await makeFolder(root, CHANGES, '010-b');
    await makeFolder(root, CHANGES, '002-a');
    await makeFolder(root, CHANGES, '_scratch');
    await fs.writeFile(path.join(root, CHANGES, 'notes.md'), 'notes\n', 'utf8');
    await makeFolder(root, CHANGES, 'archive', '001-x');
    await makeFolder(root, CHANGES, 'rejected', '003-y');

    const changes = await listChanges(root, DEFAULT_CONFIG);

    assert.deepEqual(
      changes.map((change) => [change.folderName, change.location]),
      [
        ['002-a', 'active'],
        ['010-b', 'active'],
        ['001-x', 'archived'],
        ['003-y', 'rejected'],
      ],
    );
    for (const change of changes) {
      assert.equal(path.isAbsolute(change.folderPath), true);
      assert.equal(change.folderPath, path.join(root, CHANGES, ...locationParts(change)));
      assert.equal(change.tree.root, root);
    }
  });

  it('filters to the requested locations when one is named', async () => {
    await makeFolder(root, CHANGES, '002-a');
    await makeFolder(root, CHANGES, 'archive', '001-x');
    await makeFolder(root, CHANGES, 'rejected', '003-y');

    const archived = await listChanges(root, DEFAULT_CONFIG, ['archived']);
    assert.deepEqual(
      archived.map((change) => change.folderName),
      ['001-x'],
    );
  });

  it('returns exactly one tree rooted at the project root', async () => {
    const trees = await changeTrees(root, DEFAULT_CONFIG);

    assert.equal(trees.length, 1);
    assert.equal(trees[0].root, path.resolve(root));
    assert.equal(trees[0].changesDir, path.join(root, CHANGES));
    assert.equal(trees[0].archiveDir, path.join(root, CHANGES, 'archive'));
    assert.equal(trees[0].rejectedDir, path.join(root, CHANGES, 'rejected'));
  });

  it('resolves a relative project root against the current directory', async () => {
    await makeFolder(root, CHANGES, '002-a');
    const relativeRoot = path.relative(process.cwd(), root);

    const trees = await changeTrees(relativeRoot, DEFAULT_CONFIG);
    const changes = await listChanges(relativeRoot, DEFAULT_CONFIG);

    assert.equal(trees[0].root, root);
    assert.equal(changes[0].folderPath, path.join(root, CHANGES, '002-a'));
  });

  it('finds an active change by number, padded number, and prefix', async () => {
    await makeFolder(root, CHANGES, '007-seven');

    assert.equal((await findChange(root, DEFAULT_CONFIG, '7')).folderName, '007-seven');
    assert.equal((await findChange(root, DEFAULT_CONFIG, '007')).folderName, '007-seven');
    assert.equal((await findChange(root, DEFAULT_CONFIG, '007-')).folderName, '007-seven');
  });

  it('fails the lookup with findSpecFolder message when nothing matches', async () => {
    await makeFolder(root, CHANGES, '007-seven');

    await assert.rejects(
      () => findChange(root, DEFAULT_CONFIG, '9'),
      (error: Error) => {
        assert.equal(error.message, `Spec "9" not found in ${path.join(root, CHANGES)}`);
        return true;
      },
    );
  });

  it('locates an archived folder by its absolute path', async () => {
    const archiveFolder = await makeFolder(root, CHANGES, 'archive', '001-x');

    const located = await locateFolder(root, DEFAULT_CONFIG, archiveFolder);

    assert.equal(located?.folderName, '001-x');
    assert.equal(located?.location, 'archived');
    assert.equal(located?.folderPath, archiveFolder);
  });

  it('returns null for a folder outside every tree', async () => {
    const outside = await makeFolder(root, 'elsewhere');

    assert.equal(await locateFolder(root, DEFAULT_CONFIG, outside), null);
  });

  it('labels the changes directory relative to the project root', () => {
    assert.equal(changesDirLabel(DEFAULT_CONFIG), path.join('openspec', 'changes'));
  });
});

/** The path parts below `openspec/changes` that locate a change folder. */
function locationParts(change: { folderName: string; location: string }): string[] {
  if (change.location === 'archived') return ['archive', change.folderName];
  if (change.location === 'rejected') return ['rejected', change.folderName];
  return [change.folderName];
}
