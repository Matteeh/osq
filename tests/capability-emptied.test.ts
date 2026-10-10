import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { getSpecsDir } from '../src/core/status/layout.js';
import { applyArchiveSpecs, restoreArchiveSpecs } from '../src/watcher/archive-specs.js';
import { installFakeValidator } from './helpers.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPENSPEC_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'openspec');
const VERIFY = 'node verify.cjs';

const GADGETS_SPEC = `# gadgets Specification

## Purpose

A living capability used by the emptied-capability tests, with enough words for the length check.

## Requirements

### Requirement: First gadget
The system SHALL count gadgets.

#### Scenario: Counts
- **WHEN** invoked
- **THEN** it counts

### Requirement: Second gadget
The system SHALL price gadgets.

#### Scenario: Prices
- **WHEN** invoked
- **THEN** it prices
`;

const GADGETS_SIDECAR = 'group: inventory\n';

const REMOVE_BOTH = `# Spec Delta: gadgets

## REMOVED Requirements

### Requirement: First gadget

### Requirement: Second gadget
`;

const REMOVE_FIRST = `# Spec Delta: gadgets

## REMOVED Requirements

### Requirement: First gadget
`;

const WIDGETS_DELTA = `# Spec Delta: widgets

## Purpose

Brief

## ADDED Requirements

### Requirement: Widget works
The system SHALL work.

#### Scenario: Works
- **WHEN** invoked
- **THEN** it works
`;

function openSpecConfig(): OsqConfig {
  return { ...DEFAULT_CONFIG, openspec: { bin: OPENSPEC_BIN } } as OsqConfig;
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

describe('emptied capability', () => {
  let root: string;
  let specFolder: string;
  let gadgetsDir: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-capability-emptied-'));
    await scaffoldProject(root);
    const spec = await createNewSpec(root, 'Emptied Capability');
    specFolder = spec.folderPath;
    gadgetsDir = path.join(getSpecsDir(DEFAULT_CONFIG.paths.openspecRoot, root), 'gadgets');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function writeLivingGadgets(): Promise<void> {
    await fs.mkdir(gadgetsDir, { recursive: true });
    await fs.writeFile(path.join(gadgetsDir, 'spec.md'), GADGETS_SPEC, 'utf8');
    await fs.writeFile(path.join(gadgetsDir, 'osq.yml'), GADGETS_SIDECAR, 'utf8');
  }

  async function writeDelta(folder: string, capability: string, content: string): Promise<void> {
    const dir = path.join(folder, 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), content, 'utf8');
  }

  it('removes a capability the deltas empty', async () => {
    await writeLivingGadgets();
    await writeDelta(specFolder, 'gadgets', REMOVE_BOTH);

    await applyArchiveSpecs(root, specFolder, DEFAULT_CONFIG);

    assert.equal(await exists(gadgetsDir), false, 'an emptied capability folder is gone');
  });

  it('restores the emptied capability after a red verify', async () => {
    await writeLivingGadgets();
    await writeDelta(specFolder, 'gadgets', REMOVE_BOTH);

    await applyArchiveSpecs(root, specFolder, DEFAULT_CONFIG);
    assert.equal(await exists(gadgetsDir), false);

    assert.equal(await restoreArchiveSpecs(root, specFolder), true);
    assert.equal(await fs.readFile(path.join(gadgetsDir, 'spec.md'), 'utf8'), GADGETS_SPEC);
    assert.equal(await fs.readFile(path.join(gadgetsDir, 'osq.yml'), 'utf8'), GADGETS_SIDECAR);
  });

  it('keeps a capability that still has a requirement', async () => {
    await writeLivingGadgets();
    await writeDelta(specFolder, 'gadgets', REMOVE_FIRST);

    await applyArchiveSpecs(root, specFolder, DEFAULT_CONFIG);

    const merged = await fs.readFile(path.join(gadgetsDir, 'spec.md'), 'utf8');
    assert.ok(merged.includes('### Requirement: Second gadget'), merged);
    assert.ok(!merged.includes('### Requirement: First gadget'), merged);
    assert.equal(await fs.readFile(path.join(gadgetsDir, 'osq.yml'), 'utf8'), GADGETS_SIDECAR);
  });

  it('does not validate a capability the change empties', async () => {
    await installFakeValidator(root);
    await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
    await writeLivingGadgets();

    const change = await createNewSpec(root, 'Emptied Capability');
    const proposalPath = path.join(change.folderPath, 'proposal.md');
    const proposal = await fs.readFile(proposalPath, 'utf8');
    await fs.writeFile(
      proposalPath,
      proposal.replace('verify: node -e "process.exit(0)"', `${VERIFY}\ncreates:\n  - widgets`),
      'utf8',
    );
    const taskPath = path.join(change.folderPath, 'tasks', '1.md');
    const task = await fs.readFile(taskPath, 'utf8');
    await fs.writeFile(taskPath, task.replace(/^verify:.*$/m, `verify: ${VERIFY}`), 'utf8');

    await writeDelta(change.folderPath, 'gadgets', REMOVE_BOTH);
    await writeDelta(change.folderPath, 'widgets', WIDGETS_DELTA);

    const result = await lintChangeFolder(root, change.folderPath, openSpecConfig());

    assert.ok(
      result.findings.some((finding) => finding.message.includes('widgets after archive')),
      JSON.stringify(result.findings),
    );
    assert.equal(
      result.findings.some((finding) => finding.message.includes('gadgets after archive')),
      false,
      JSON.stringify(result.findings),
    );
  });
});
