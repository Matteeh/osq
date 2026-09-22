import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { mergeDelta, parseDelta } from '../src/core/spec/delta.js';
import { getArchiveDir } from '../src/core/status/layout.js';
import {
  applyOpenSpecDeltas,
  archiveSpecFolder,
  checkAndArchiveSpec,
} from '../src/watcher/archiver.js';

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

const UPDATED_DELTA_SPEC = `# Spec Delta: cli-foundation

## MODIFIED Requirements

### Requirement: Archival
The system SHALL archive changes deterministically.

#### Scenario: Archive applies
- **WHEN** change archived again
- **THEN** capability spec updated in place
`;

/**
 * Canonical OpenSpec layout config. `DEFAULT_CONFIG.paths.openspecRoot` drives
 * every change and archive path through `src/core/layout.ts`.
 */
function openSpecConfig(): OsqConfig {
  return DEFAULT_CONFIG;
}

interface ParsedEvent {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

function parseJsonl(content: string): ParsedEvent[] {
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

/** Read and parse an event stream, treating a missing file as an empty stream. */
async function readEvents(eventsPath: string): Promise<ParsedEvent[]> {
  const content = await fs.readFile(eventsPath, 'utf8').catch(() => '');
  return parseJsonl(content);
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

  it('applyOpenSpecDeltas creates and then updates capability specs from delta specs', async () => {
    const deltaDir = path.join(specFolder, 'specs', 'cli-foundation');
    await fs.mkdir(deltaDir, { recursive: true });
    await fs.writeFile(path.join(deltaDir, 'spec.md'), DELTA_SPEC, 'utf8');

    await applyOpenSpecDeltas(tmpDir, specFolder, DEFAULT_CONFIG);

    const capabilityPath = path.join(tmpDir, 'openspec', 'specs', 'cli-foundation', 'spec.md');
    const created = await fs.readFile(capabilityPath, 'utf8');
    assert.equal(created, mergeDelta(null, 'cli-foundation', parseDelta(DELTA_SPEC)));

    await fs.writeFile(path.join(deltaDir, 'spec.md'), UPDATED_DELTA_SPEC, 'utf8');
    await applyOpenSpecDeltas(tmpDir, specFolder, DEFAULT_CONFIG);

    const updated = await fs.readFile(capabilityPath, 'utf8');
    assert.equal(updated.match(/### Requirement: Archival/g)?.length, 1);
    assert.ok(updated.includes('archive changes deterministically'));
    assert.ok(updated.includes('change archived again'));
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

  it('archiveSpecFolder appends exactly one archived event to the archived change stream after relocation', async () => {
    const before = Date.now();
    const archivedPath = await archiveSpecFolder(tmpDir, specFolder, DEFAULT_CONFIG);
    const after = Date.now();

    const eventsDir = path.join(archivedPath, '.run', 'events');
    // Only the change-level stream carries the event; no numbered task file does.
    assert.deepEqual((await fs.readdir(eventsDir)).sort(), ['change.jsonl']);

    const events = await readEvents(path.join(eventsDir, 'change.jsonl'));
    assert.equal(events.length, 1);
    const archivedEvent = events[0];
    assert.equal(archivedEvent.type, 'archived');
    assert.equal(archivedEvent.data.archivePath, archivedPath);

    const stamp = Date.parse(archivedEvent.timestamp);
    assert.ok(!Number.isNaN(stamp), `expected ISO archive time, got ${archivedEvent.timestamp}`);
    assert.ok(stamp >= before && stamp <= after, 'archive time falls inside the relocation window');

    // The event is only in the archive, never in the pre-move folder.
    await assert.rejects(fs.stat(path.join(specFolder, '.run', 'events', 'change.jsonl')));
  });

  it('archiveSpecFolder emits no archived event when relocation fails', async () => {
    const missingFolder = path.join(tmpDir, 'openspec', 'changes', '999-missing');
    await assert.rejects(archiveSpecFolder(tmpDir, missingFolder, DEFAULT_CONFIG));

    const archiveDir = getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir);
    assert.deepEqual(await fs.readdir(archiveDir).catch((): string[] => []), []);
  });

  it('checkAndArchiveSpec emits no archived event when change-level verification fails', async () => {
    const failingProposal = `---
title: Archive Feature
depends_on: []
verify: node -e "process.exit(1)"
features:
  reads: []
---
## Goal

Blocks archive.
`;
    await fs.writeFile(path.join(specFolder, 'proposal.md'), failingProposal, 'utf8');

    const runDir = path.join(specFolder, '.run');
    await fs.mkdir(path.join(runDir, 'done'), { recursive: true });
    await fs.writeFile(path.join(runDir, 'approved'), 'sha256:abc\n', 'utf8');
    await fs.writeFile(path.join(runDir, 'done', '1'), '', 'utf8');

    const archived = await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(archived, false);

    // Change stays active with retained regressed diagnostics.
    assert.ok(await fs.stat(specFolder));
    const regressed = await fs.readFile(path.join(runDir, 'regressed', 'change.md'), 'utf8');
    assert.ok(regressed.includes('reason: verify_red'));

    const events = await readEvents(path.join(runDir, 'events', 'change.jsonl'));
    assert.ok(events.some((event) => event.type === 'verify_ran' && event.data.exitCode === 1));
    assert.ok(events.some((event) => event.type === 'regressed'));
    assert.ok(!events.some((event) => event.type === 'archived'));
  });

  it('checkAndArchiveSpec records change-level verify_ran before the archived event', async () => {
    const runDir = path.join(specFolder, '.run');
    await fs.mkdir(path.join(runDir, 'done'), { recursive: true });
    await fs.writeFile(path.join(runDir, 'approved'), 'sha256:abc\n', 'utf8');
    await fs.writeFile(path.join(runDir, 'done', '1'), '', 'utf8');

    const archived = await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG);
    assert.equal(archived, true);

    const archivedPath = path.join(
      getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir),
      path.basename(specFolder),
    );
    const events = await readEvents(path.join(archivedPath, '.run', 'events', 'change.jsonl'));
    assert.deepEqual(
      events.map((event) => event.type),
      ['verify_ran', 'archived'],
    );

    const [verifyRan, archivedEvent] = events;
    assert.equal(verifyRan.data.exitCode, 0);
    assert.ok(typeof verifyRan.data.command === 'string');
    assert.equal(archivedEvent.data.archivePath, archivedPath);
    assert.ok(
      Date.parse(verifyRan.timestamp) <= Date.parse(archivedEvent.timestamp),
      'archive time is stamped after the change-level verification',
    );
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
