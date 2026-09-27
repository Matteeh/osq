import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { buildManifest } from '../src/core/run/manifest.js';
import { getSpecsDir } from '../src/core/status/layout.js';
import { archiveSpecFolder } from '../src/watcher/archiver.js';

function sha256(content: string): string {
  return `sha256:${crypto.createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

function deltaSpec(capability: string): string {
  return `# Spec Delta: ${capability}

## Purpose

A capability used by archive sidecar tests.

## ADDED Requirements

### Requirement: ${capability} works
The system SHALL work.

#### Scenario: Works
- **WHEN** invoked
- **THEN** it works
`;
}

function proposalWithCreates(creates: string): string {
  return `---
title: Sidecar Archive
verify: node verify.cjs
creates:
${creates}
---
## Goal

Probe archive sidecars.
`;
}

const PLAIN_PROPOSAL = `---
title: Sidecar Archive
verify: node verify.cjs
---
## Goal

Probe archive sidecars.
`;

describe('archive sidecars', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-archive-sidecars-'));
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Sidecar Archive');
    specFolder = spec.folderPath;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeDelta(capability: string): Promise<void> {
    const dir = path.join(specFolder, 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), deltaSpec(capability), 'utf8');
  }

  async function livingSidecar(capability: string): Promise<string | null> {
    return fs
      .readFile(
        path.join(getSpecsDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir), capability, 'osq.yml'),
        'utf8',
      )
      .catch(() => null);
  }

  it('writes a sidecar for a created capability that declares a group', async () => {
    await writeDelta('gadgets');
    await fs.writeFile(
      path.join(specFolder, 'proposal.md'),
      proposalWithCreates('  - name: gadgets\n    group: inventory'),
      'utf8',
    );

    await archiveSpecFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(await livingSidecar('gadgets'), 'group: inventory\n');
  });

  it('writes no sidecar for a bare created capability', async () => {
    await writeDelta('gadgets');
    await fs.writeFile(
      path.join(specFolder, 'proposal.md'),
      proposalWithCreates('  - gadgets'),
      'utf8',
    );

    await archiveSpecFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(await livingSidecar('gadgets'), null);
  });

  it('copies a replacement sidecar byte for byte, replacing the living one', async () => {
    const livingDir = path.join(getSpecsDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir), 'pricing');
    await fs.mkdir(livingDir, { recursive: true });
    await fs.writeFile(path.join(livingDir, 'spec.md'), '# pricing\n', 'utf8');
    await fs.writeFile(path.join(livingDir, 'osq.yml'), 'group: inventory\n', 'utf8');

    const replacement = 'group: sales\ntags:\n  - costing\n';
    const replacementDir = path.join(specFolder, 'specs', 'pricing');
    await fs.mkdir(replacementDir, { recursive: true });
    await fs.writeFile(path.join(replacementDir, 'osq.yml'), replacement, 'utf8');
    await fs.writeFile(path.join(specFolder, 'proposal.md'), PLAIN_PROPOSAL, 'utf8');

    await archiveSpecFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    const written = await fs.readFile(path.join(livingDir, 'osq.yml'), 'utf8');
    assert.equal(written, replacement);
  });

  it('leaves a capability without a group or replacement sidecar untouched', async () => {
    await writeDelta('pricing');
    await fs.writeFile(path.join(specFolder, 'proposal.md'), PLAIN_PROPOSAL, 'utf8');

    await archiveSpecFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(await livingSidecar('pricing'), null);
  });

  it('records the sidecar hash, and null when there is none, for every hashed capability', async () => {
    const specsDir = getSpecsDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir);
    const sidecarContent = 'group: sales\n';
    await fs.mkdir(path.join(specsDir, 'pricing'), { recursive: true });
    await fs.writeFile(path.join(specsDir, 'pricing', 'spec.md'), '# pricing\n', 'utf8');
    await fs.writeFile(path.join(specsDir, 'pricing', 'osq.yml'), sidecarContent, 'utf8');
    await fs.mkdir(path.join(specsDir, 'orders'), { recursive: true });
    await fs.writeFile(path.join(specsDir, 'orders', 'spec.md'), '# orders\n', 'utf8');

    await writeDelta('pricing');
    await writeDelta('orders');
    await fs.writeFile(path.join(specFolder, 'proposal.md'), PLAIN_PROPOSAL, 'utf8');

    const manifest = await buildManifest(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(manifest.hashes['pricing/osq.yml'], sha256(sidecarContent));
    assert.equal(manifest.hashes['orders/osq.yml'], null);
    assert.equal(typeof manifest.hashes.pricing, 'string');
    assert.equal(typeof manifest.hashes.orders, 'string');
  });
});
