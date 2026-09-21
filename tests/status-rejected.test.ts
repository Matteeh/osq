import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createNewSpec } from '../src/core/new.js';
import { formatStatusOverview, getStatusOverview } from '../src/core/status.js';

function rejectedDir(root: string): string {
  return path.join(root, 'openspec', 'changes', 'rejected');
}

interface RejectedOptions {
  readonly title?: string;
  readonly marker?: string | null;
  readonly proposal?: boolean;
}

async function writeRejected(
  root: string,
  folder: string,
  options: RejectedOptions = {},
): Promise<string> {
  const folderPath = path.join(rejectedDir(root), folder);
  await fs.mkdir(path.join(folderPath, '.run'), { recursive: true });

  if (options.proposal !== false) {
    await fs.writeFile(
      path.join(folderPath, 'proposal.md'),
      `---\ntitle: ${options.title ?? folder}\nverify: node -e "process.exit(0)"\n---\n## Goal\nx\n`,
      'utf8',
    );
  }

  if (options.marker !== null) {
    await fs.writeFile(
      path.join(folderPath, '.run', 'rejected.md'),
      options.marker ??
        '---\nreason: "superseded by 040"\ntimestamp: "2026-01-02T03:04:05.000Z"\n---\n',
      'utf8',
    );
  }

  return folderPath;
}

describe('osq status rejected group', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-status-rejected-'));
    await scaffoldProject(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('discovers rejected folders separately with folder, title, reason, and timestamp', async () => {
    await createNewSpec(tmpDir, 'Active Spec');
    await fs.mkdir(path.join(tmpDir, 'openspec', 'changes', 'archive', '000-archived-one'), {
      recursive: true,
    });
    await writeRejected(tmpDir, '001-rejected-alpha', {
      title: 'Rejected Alpha',
      marker: '---\nreason: "no longer needed"\ntimestamp: "2026-01-02T03:04:05.000Z"\n---\n',
    });

    const overview = await getStatusOverview(tmpDir, DEFAULT_CONFIG);

    // Rejected folders never join active specs or the archived count.
    assert.equal(overview.specs.length, 1);
    assert.equal(overview.specs[0].id, '001');
    assert.equal(overview.archivedCount, 1);

    assert.equal(overview.rejected.length, 1);
    assert.deepEqual(overview.rejected[0], {
      folderName: '001-rejected-alpha',
      title: 'Rejected Alpha',
      reason: 'no longer needed',
      timestamp: '2026-01-02T03:04:05.000Z',
    });
  });

  it('renders a deterministic Rejected specs group with reason and timestamp', async () => {
    await createNewSpec(tmpDir, 'Active Spec');
    await writeRejected(tmpDir, '002-rejected-beta', { title: 'Rejected Beta' });

    const overview = await getStatusOverview(tmpDir, DEFAULT_CONFIG);
    const formatted = formatStatusOverview(overview);

    assert.ok(formatted.includes('Active specs:'));
    assert.ok(formatted.includes('Archived specs: 0'));
    assert.ok(formatted.includes('Rejected specs:'));
    assert.ok(formatted.includes('002-rejected-beta: Rejected Beta [rejected]'));
    assert.ok(formatted.includes('superseded by 040'));
    assert.ok(formatted.includes('2026-01-02T03:04:05.000Z'));
    // The rejected folder must not be listed as active.
    assert.equal(formatted.includes('002-rejected-beta: Rejected Beta [pending]'), false);
  });

  it('keeps malformed or missing rejection metadata visible as unavailable', async () => {
    await createNewSpec(tmpDir, 'Active Spec');
    await writeRejected(tmpDir, '003-rejected-malformed', {
      title: 'Rejected Malformed',
      marker: 'this is not frontmatter\n',
    });
    await writeRejected(tmpDir, '004-rejected-nodoc', { proposal: false, marker: null });

    const overview = await getStatusOverview(tmpDir, DEFAULT_CONFIG);
    assert.equal(overview.specs.length, 1);
    assert.equal(overview.rejected.length, 2);

    const malformed = overview.rejected.find((r) => r.folderName === '003-rejected-malformed');
    assert.ok(malformed);
    assert.equal(malformed.title, 'Rejected Malformed');
    assert.equal(malformed.reason, null);
    assert.equal(malformed.timestamp, null);

    const nodoc = overview.rejected.find((r) => r.folderName === '004-rejected-nodoc');
    assert.ok(nodoc);
    assert.equal(nodoc.title, '004-rejected-nodoc');
    assert.equal(nodoc.reason, null);
    assert.equal(nodoc.timestamp, null);

    const formatted = formatStatusOverview(overview);
    assert.ok(formatted.includes('Active specs:'));
    assert.ok(formatted.includes('Rejected specs:'));
    assert.ok(formatted.includes('003-rejected-malformed'));
    assert.ok(formatted.includes('004-rejected-nodoc'));
    assert.ok(formatted.includes('unavailable'));
  });

  it('orders rejected folders deterministically by numeric prefix', async () => {
    await writeRejected(tmpDir, '010-rejected-ten', { title: 'Ten' });
    await writeRejected(tmpDir, '002-rejected-two', { title: 'Two' });

    const overview = await getStatusOverview(tmpDir, DEFAULT_CONFIG);
    assert.deepEqual(
      overview.rejected.map((r) => r.folderName),
      ['002-rejected-two', '010-rejected-ten'],
    );

    const formatted = formatStatusOverview(overview);
    assert.ok(formatted.indexOf('002-rejected-two') < formatted.indexOf('010-rejected-ten'));
  });
});
