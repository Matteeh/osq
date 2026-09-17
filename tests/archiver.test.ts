import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createNewSpec } from '../src/core/new.js';
import { applyDelta, archiveSpecFolder, checkAndArchiveSpec } from '../src/watcher/archiver.js';

describe('Archiver and Delta Application', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-archiver-test-'));
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Archive Feature');
    specFolder = spec.folderPath;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('applyDelta creates or updates feature docs specified in features.writes', async () => {
    const specMdContent = [
      '---',
      'title: Archive Feature',
      'depends_on: []',
      'features:',
      '  reads: []',
      '  writes: [archived-feature]',
      '---',
      '## Goal',
      'Goal text',
      '## Contract',
      '| In | Out |',
      '|---|---|',
      '| a | b |',
      '## Non-goals',
      'None',
      '## Delta',
      'Describes the behavior added by this feature.',
    ].join('\n');

    await fs.writeFile(path.join(specFolder, 'spec.md'), specMdContent, 'utf8');

    await applyDelta(tmpDir, specFolder, DEFAULT_CONFIG);

    const featureFilePath = path.join(tmpDir, 'features', 'archived-feature.md');
    const content = await fs.readFile(featureFilePath, 'utf8');
    assert.ok(content.includes('Describes the behavior added by this feature.'));
  });

  it('archiveSpecFolder moves spec folder whole to archive preserving .run markers', async () => {
    const runDir = path.join(specFolder, '.run');
    await fs.mkdir(path.join(runDir, 'done'), { recursive: true });
    await fs.writeFile(path.join(runDir, 'done', '1'), '', 'utf8');

    const folderName = path.basename(specFolder);
    const archivedPath = await archiveSpecFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    // Old folder does not exist
    await assert.rejects(async () => {
      await fs.stat(specFolder);
    });

    // New folder exists in archive
    assert.equal(archivedPath, path.join(tmpDir, 'specs', 'archive', folderName));
    const doneMarker = path.join(archivedPath, '.run', 'done', '1');
    const stat = await fs.stat(doneMarker);
    assert.ok(stat);
  });

  it('archiveSpecFolder preserves history by disambiguating if destination already exists', async () => {
    const folderName = path.basename(specFolder);
    const existingArchive = path.join(tmpDir, 'specs', 'archive', folderName);
    await fs.mkdir(existingArchive, { recursive: true });
    await fs.writeFile(path.join(existingArchive, 'history.txt'), 'pre-existing archive', 'utf8');

    const archivedPath = await archiveSpecFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    // Old archive remains intact
    assert.equal(
      await fs.readFile(path.join(existingArchive, 'history.txt'), 'utf8'),
      'pre-existing archive',
    );

    // New archive path is disambiguated with suffix
    assert.equal(archivedPath, path.join(tmpDir, 'specs', 'archive', `${folderName}-1`));
    assert.ok(await fs.stat(archivedPath));
  });

  it('checkAndArchiveSpec archives only when all tasks are marked done', async () => {
    // 1. Not approved -> should return false
    let archived = await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(archived, false);

    // 2. Approved but task pending -> should return false
    const runDir = path.join(specFolder, '.run');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'approved'), 'sha256:abc\n', 'utf8');

    archived = await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(archived, false);

    // 3. Mark task 1 done -> should archive and return true
    await fs.mkdir(path.join(runDir, 'done'), { recursive: true });
    await fs.writeFile(path.join(runDir, 'done', '1'), '', 'utf8');

    archived = await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(archived, true);

    const folderName = path.basename(specFolder);
    const inArchive = await fs.stat(path.join(tmpDir, 'specs', 'archive', folderName));
    assert.ok(inArchive);
  });
});
