import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';

const tmpDirs: string[] = [];
const ts = '2026-09-18T00:00:00.000Z';

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-verification-'));
  tmpDirs.push(root);
  await fs.mkdir(path.join(root, 'openspec', 'changes'), { recursive: true });
  return root;
}

interface ArchivedFixture {
  /** The `verification` the `archived` event carries, when the change needs one. */
  readonly verification?: { afterLanding: boolean; check: string | null };
  /** The latest recorded outcome; absent leaves the change pending. */
  readonly outcome?: 'passed' | 'failed';
}

/** One archived change folder with a proposal and change-level event stream. */
async function writeArchived(
  root: string,
  folder: string,
  fixture: ArchivedFixture = {},
): Promise<string> {
  const folderPath = path.join(root, 'openspec', 'changes', 'archive', folder);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folderPath, 'proposal.md'),
    `---\ntitle: ${folder}\n---\n## Goal\n\nFixture.\n`,
    'utf8',
  );

  const events: Record<string, unknown>[] = [
    {
      type: 'archived',
      timestamp: ts,
      data: {
        archivePath: 'archive',
        ...(fixture.verification ? { verification: fixture.verification } : {}),
      },
    },
  ];
  if (fixture.outcome) {
    events.push({
      type: 'verification_recorded',
      timestamp: ts,
      data: { outcome: fixture.outcome, note: null },
    });
  }

  const eventsDir = path.join(folderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  await fs.writeFile(
    path.join(eventsDir, 'change.jsonl'),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    'utf8',
  );
  return folderPath;
}

describe('report after-landing verification counts', () => {
  it('counts mixed outcomes and carries the same counts in text and JSON', async () => {
    const root = await tempRoot();
    await writeArchived(root, '001-passed', {
      verification: { afterLanding: true, check: null },
      outcome: 'passed',
    });
    await writeArchived(root, '002-failed', {
      verification: { afterLanding: false, check: 'node check.cjs' },
      outcome: 'failed',
    });
    await writeArchived(root, '003-pending', {
      verification: { afterLanding: true, check: null },
    });

    const text = await reportCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      stdout: () => {},
    });
    assert.ok(text.includes('After-landing checks: 1 passed, 1 failed, 1 pending'), text);

    const raw = await reportCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: () => {},
    });
    const parsed = JSON.parse(raw) as { history: { verification?: unknown } };
    assert.deepEqual(parsed.history.verification, { passed: 1, failed: 1, pending: 1 });
  });

  it('prints no line and no JSON key when no archived change requires verification', async () => {
    const root = await tempRoot();
    await writeArchived(root, '001-plain');

    const text = await reportCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      stdout: () => {},
    });
    assert.equal(text.includes('After-landing checks'), false, text);

    const raw = await reportCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: () => {},
    });
    const parsed = JSON.parse(raw) as { history: Record<string, unknown> };
    assert.equal('verification' in parsed.history, false);
  });
});
