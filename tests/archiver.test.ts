import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { getArchiveDir } from '../src/core/layout.js';
import { createNewSpec } from '../src/core/new.js';
import { applyDelta, archiveSpecFolder, checkAndArchiveSpec } from '../src/watcher/archiver.js';

const BASE_CAPABILITY_SPEC = `# cli-foundation Specification

## Purpose

Base purpose.

## Requirements

### Requirement: Existing
The system SHALL exist.

#### Scenario: Runs
- **WHEN** run
- **THEN** exists
`;

const DELTA_SPEC = `# Spec Delta: cli-foundation

## Purpose

Adds archival behavior.

## ADDED Requirements

### Requirement: Archival
The system SHALL archive changes.

#### Scenario: Archive applies
- **WHEN** change archived
- **THEN** capability spec updated
`;

/**
 * Canonical OpenSpec layout config. `DEFAULT_CONFIG.paths.openspecRoot` drives
 * every change and archive path through `src/core/layout.ts`.
 */
function openSpecConfig(): OsqConfig {
  return DEFAULT_CONFIG;
}

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

    const proposalPath = path.join(specFolder, 'proposal.md');
    if (
      await fs
        .stat(proposalPath)
        .then(() => true)
        .catch(() => false)
    ) {
      await fs.writeFile(proposalPath, specMdContent, 'utf8');
    } else {
      await fs.writeFile(path.join(specFolder, 'spec.md'), specMdContent, 'utf8');
    }

    await applyDelta(tmpDir, specFolder, DEFAULT_CONFIG);

    const featureFilePath = path.join(tmpDir, DEFAULT_CONFIG.paths.features, 'archived-feature.md');
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
    assert.equal(
      archivedPath,
      path.join(getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir), folderName),
    );
    const doneMarker = path.join(archivedPath, '.run', 'done', '1');
    const stat = await fs.stat(doneMarker);
    assert.ok(stat);
  });

  it('archiveSpecFolder preserves full .run history including results and event logs', async () => {
    const runDir = path.join(specFolder, '.run');
    await fs.mkdir(path.join(runDir, 'done'), { recursive: true });
    await fs.mkdir(path.join(runDir, 'results'), { recursive: true });
    await fs.mkdir(path.join(runDir, 'events'), { recursive: true });
    await fs.writeFile(path.join(runDir, 'done', '1'), '', 'utf8');
    await fs.writeFile(path.join(runDir, 'results', '1.md'), 'result body', 'utf8');
    await fs.writeFile(
      path.join(runDir, 'events', '1.jsonl'),
      '{"type":"started"}\n{"type":"exited"}\n',
      'utf8',
    );
    await fs.writeFile(path.join(runDir, 'approved'), 'sha256:abc\n', 'utf8');

    const archivedPath = await archiveSpecFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(
      await fs.readFile(path.join(archivedPath, '.run', 'results', '1.md'), 'utf8'),
      'result body',
    );
    assert.equal(
      await fs.readFile(path.join(archivedPath, '.run', 'events', '1.jsonl'), 'utf8'),
      '{"type":"started"}\n{"type":"exited"}\n',
    );
    assert.equal(
      await fs.readFile(path.join(archivedPath, '.run', 'approved'), 'utf8'),
      'sha256:abc\n',
    );
    assert.ok(await fs.stat(path.join(archivedPath, '.run', 'done', '1')));
  });

  it('archiveSpecFolder preserves history by disambiguating if destination already exists', async () => {
    const folderName = path.basename(specFolder);
    const archiveDir = getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir);
    const existingArchive = path.join(archiveDir, folderName);
    await fs.mkdir(existingArchive, { recursive: true });
    await fs.writeFile(path.join(existingArchive, 'history.txt'), 'pre-existing archive', 'utf8');

    const archivedPath = await archiveSpecFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    // Old archive remains intact
    assert.equal(
      await fs.readFile(path.join(existingArchive, 'history.txt'), 'utf8'),
      'pre-existing archive',
    );

    // New archive path is disambiguated with suffix
    assert.equal(archivedPath, path.join(archiveDir, `${folderName}-1`));
    assert.ok(await fs.stat(archivedPath));
  });

  it('archiveSpecFolder resolves the destination through a custom openspecRoot', async () => {
    const customRoot = 'docs/changes-root';
    const customCfg: OsqConfig = {
      ...DEFAULT_CONFIG,
      paths: { ...DEFAULT_CONFIG.paths, openspecRoot: customRoot },
    };
    const folderName = path.basename(specFolder);
    const archivedPath = await archiveSpecFolder(tmpDir, specFolder, customCfg);

    assert.equal(archivedPath, path.join(getArchiveDir(customRoot, tmpDir), folderName));
  });

  it('archiveSpecFolder applies delta specs inside openspec/specs and moves to the OpenSpec archive path', async () => {
    const config = openSpecConfig();

    // Delta spec carried by the change.
    const deltaDir = path.join(specFolder, 'specs', 'cli-foundation');
    await fs.mkdir(deltaDir, { recursive: true });
    await fs.writeFile(path.join(deltaDir, 'spec.md'), DELTA_SPEC, 'utf8');

    // Living capability spec that the delta augments.
    const capabilityDir = path.join(tmpDir, 'openspec', 'specs', 'cli-foundation');
    await fs.mkdir(capabilityDir, { recursive: true });
    await fs.writeFile(path.join(capabilityDir, 'spec.md'), BASE_CAPABILITY_SPEC, 'utf8');

    const folderName = path.basename(specFolder);
    const archivedPath = await archiveSpecFolder(tmpDir, specFolder, config);

    assert.equal(archivedPath, path.join(tmpDir, 'openspec', 'changes', 'archive', folderName));
    await assert.rejects(async () => {
      await fs.stat(specFolder);
    });

    const merged = await fs.readFile(path.join(capabilityDir, 'spec.md'), 'utf8');
    assert.ok(merged.includes('### Requirement: Existing'));
    assert.ok(merged.includes('### Requirement: Archival'));

    // The delta spec travels with the archived folder.
    assert.ok(await fs.stat(path.join(archivedPath, 'specs', 'cli-foundation', 'spec.md')));
  });

  it('archiveSpecFolder ensures every archived tasks.md is fully ticked', async () => {
    const tasksMd = [
      '# Tasks',
      '',
      '## 1. First',
      '- [ ] 1. first item',
      '  - [ ] nested item',
      '- [x] 2. already done',
      '',
    ].join('\n');
    await fs.writeFile(path.join(specFolder, 'tasks.md'), tasksMd, 'utf8');

    const archivedPath = await archiveSpecFolder(tmpDir, specFolder, openSpecConfig());

    const archived = await fs.readFile(path.join(archivedPath, 'tasks.md'), 'utf8');
    assert.ok(!archived.includes('[ ]'), `expected no unchecked boxes, got:\n${archived}`);
    assert.ok(archived.includes('- [x] 1. first item'));
    assert.ok(archived.includes('  - [x] nested item'));
    assert.ok(archived.includes('- [x] 2. already done'));
  });

  it('archiveSpecFolder ticks tasks.md under the canonical archive layout', async () => {
    const tasksMd = '# Tasks\n\n- [ ] 1. pending item\n';
    await fs.writeFile(path.join(specFolder, 'tasks.md'), tasksMd, 'utf8');

    const archivedPath = await archiveSpecFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(
      path.dirname(archivedPath),
      getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir),
    );
    const archived = await fs.readFile(path.join(archivedPath, 'tasks.md'), 'utf8');
    assert.ok(!archived.includes('[ ]'));
    assert.ok(archived.includes('- [x] 1. pending item'));
  });

  it('checkAndArchiveSpec applies deltas once then archives only when all tasks are marked done', async () => {
    const config = openSpecConfig();

    const deltaDir = path.join(specFolder, 'specs', 'cli-foundation');
    await fs.mkdir(deltaDir, { recursive: true });
    await fs.writeFile(path.join(deltaDir, 'spec.md'), DELTA_SPEC, 'utf8');
    const capabilityDir = path.join(tmpDir, 'openspec', 'specs', 'cli-foundation');
    await fs.mkdir(capabilityDir, { recursive: true });
    await fs.writeFile(path.join(capabilityDir, 'spec.md'), BASE_CAPABILITY_SPEC, 'utf8');

    // 1. Not approved -> should return false
    let archived = await checkAndArchiveSpec(tmpDir, specFolder, config);
    assert.equal(archived, false);

    // 2. Approved but task pending -> should return false
    const runDir = path.join(specFolder, '.run');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'approved'), 'sha256:abc\n', 'utf8');

    archived = await checkAndArchiveSpec(tmpDir, specFolder, config);
    assert.equal(archived, false);

    // 3. Mark task 1 done -> should archive and return true
    await fs.mkdir(path.join(runDir, 'done'), { recursive: true });
    await fs.writeFile(path.join(runDir, 'done', '1'), '', 'utf8');

    archived = await checkAndArchiveSpec(tmpDir, specFolder, config);
    assert.equal(archived, true);

    const folderName = path.basename(specFolder);
    assert.ok(
      await fs.stat(
        path.join(getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir), folderName),
      ),
    );

    // ADDED requirement appears exactly once despite being applied during archive.
    const merged = await fs.readFile(path.join(capabilityDir, 'spec.md'), 'utf8');
    assert.equal(merged.match(/### Requirement: Archival/g)?.length, 1);
  });
});
