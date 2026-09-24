import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { resolveChangeApprovalTime } from '../src/core/report/planning-observed.js';
import { readManifestApprovedAt } from '../src/core/run/manifest-approval.js';
import { getWebGraph } from '../src/core/web/web-data.js';

const SESSION = 'observed:claude:s1';
const APPROVED_AT = '2026-01-02T00:00:00.000Z';

async function write(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function manifestJson(approvedAt: unknown): string {
  return JSON.stringify({ createdAt: '2026-01-01T00:00:00.000Z', approvedAt });
}

function proposal(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads:',
    '    []',
    '---',
    '## Goal',
    '',
    `${title} goal text.`,
    '',
  ].join('\n');
}

describe('readManifestApprovedAt', () => {
  let root = '';

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-manifest-approval-'));
  });
  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('counts the manifest time only once .run/approved exists', async () => {
    const folder = path.join(root, '001-change');
    await write(root, '001-change/.run/manifest.json', manifestJson(APPROVED_AT));

    assert.equal(await readManifestApprovedAt(folder), null);

    await write(root, '001-change/.run/approved', 'sha256:sealed\n');
    assert.equal(await readManifestApprovedAt(folder), APPROVED_AT);
  });

  it('returns null for a missing, malformed, or invalid manifest', async () => {
    const missing = path.join(root, '002-missing');
    await write(root, '002-missing/.run/approved', 'sha256:sealed\n');
    assert.equal(await readManifestApprovedAt(missing), null);

    const malformed = path.join(root, '003-malformed');
    await write(root, '003-malformed/.run/approved', 'sha256:sealed\n');
    await write(root, '003-malformed/.run/manifest.json', '{not-json\n');
    assert.equal(await readManifestApprovedAt(malformed), null);

    const invalid = path.join(root, '004-invalid');
    await write(root, '004-invalid/.run/approved', 'sha256:sealed\n');
    await write(root, '004-invalid/.run/manifest.json', manifestJson('not-a-date'));
    assert.equal(await readManifestApprovedAt(invalid), null);
  });
});

describe('dashboard graph approval gate', () => {
  let root = '';

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-manifest-approval-web-'));
    await write(root, 'openspec/changes/060-active-change/proposal.md', proposal('Active Change'));
    await write(
      root,
      'openspec/changes/060-active-change/.run/manifest.json',
      manifestJson(APPROVED_AT),
    );
  });
  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('reports a plan-time manifest time as no approval until the marker exists', async () => {
    const before = await getWebGraph(root, DEFAULT_CONFIG);
    const unapproved = before.changes.find((node) => node.folderKey === '060-active-change');
    assert.equal(unapproved?.approved, null);

    await write(root, 'openspec/changes/060-active-change/.run/approved', 'sha256:sealed\n');
    const after = await getWebGraph(root, DEFAULT_CONFIG);
    const approved = after.changes.find((node) => node.folderKey === '060-active-change');
    assert.equal(approved?.approved, APPROVED_AT);
  });
});

describe('planning turn attribution approval gate', () => {
  let root = '';
  let changesDir = '';

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-manifest-approval-slice-'));
    changesDir = path.join(root, 'openspec', 'changes');
    await fs.mkdir(changesDir, { recursive: true });
  });
  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
    changesDir = '';
  });

  it('ignores a manifest time without the marker and uses it once marked', async () => {
    const folder = path.join(changesDir, '061-active-change');
    await write(
      root,
      'openspec/changes/061-active-change/.run/manifest.json',
      manifestJson(APPROVED_AT),
    );

    assert.equal(await resolveChangeApprovalTime(folder, SESSION), null);

    await write(root, 'openspec/changes/061-active-change/.run/approved', 'sha256:sealed\n');
    assert.equal(await resolveChangeApprovalTime(folder, SESSION), APPROVED_AT);
  });

  it('still reads the rejection timestamp when no slice was recorded', async () => {
    const original = path.join(changesDir, '062-rejected-change');
    await write(
      root,
      'openspec/changes/rejected/062-rejected-change/.run/rejected.md',
      `---\nreason: "stop"\ntimestamp: ${JSON.stringify(APPROVED_AT)}\n---\n`,
    );

    assert.equal(await resolveChangeApprovalTime(original, SESSION), APPROVED_AT);
  });
});
