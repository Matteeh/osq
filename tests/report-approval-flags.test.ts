import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { formatMetricsReport, getMetricsReport } from '../src/core/report/report.js';

const tmpDirs: string[] = [];
const ts = '2026-09-18T00:00:00.000Z';

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-flags-'));
  tmpDirs.push(root);
  await fs.mkdir(path.join(root, 'openspec', 'changes'), { recursive: true });
  return root;
}

interface ChangeFixture {
  /** Recorded `approvalFlags`, omitted to write a legacy manifest without one. */
  readonly flags?: Record<string, unknown>;
  /** Raw manifest text that overrides the generated one, for malformed cases. */
  readonly rawManifest?: string;
  readonly events?: readonly Record<string, unknown>[];
  readonly changeEvents?: readonly Record<string, unknown>[];
}

function event(type: string, data: Record<string, unknown> = {}): Record<string, unknown> {
  return { type, timestamp: ts, data };
}

async function writeStream(
  filePath: string,
  events?: readonly Record<string, unknown>[],
): Promise<void> {
  if (!events) return;
  await fs.writeFile(
    filePath,
    events.length > 0 ? `${events.map((entry) => JSON.stringify(entry)).join('\n')}\n` : '',
    'utf8',
  );
}

/** One active or archived change folder with a manifest, task, and event streams. */
async function writeChange(root: string, folder: string, fixture: ChangeFixture): Promise<string> {
  const folderPath = path.join(root, 'openspec', 'changes', folder);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folderPath, 'proposal.md'),
    '---\ntitle: fixture\n---\n## Goal\n\nFixture.\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(folderPath, 'tasks', '1.md'),
    '---\ntitle: Task 1\n---\n## Acceptance\n- [ ] x\n',
    'utf8',
  );
  const runDir = path.join(folderPath, '.run');
  const eventsDir = path.join(runDir, 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  const manifest =
    fixture.rawManifest ??
    JSON.stringify({
      approvedAt: ts,
      ...(fixture.flags ? { approvalFlags: fixture.flags } : {}),
    });
  await fs.writeFile(path.join(runDir, 'manifest.json'), manifest, 'utf8');
  await writeStream(path.join(eventsDir, '1.jsonl'), fixture.events);
  await writeStream(path.join(eventsDir, 'change.jsonl'), fixture.changeEvents);
  return folderPath;
}

/** A manifest whose only recorded flag handling is the given mode and ids. */
function shown(ids: readonly string[]): Record<string, unknown> {
  return { ids: [...ids], mode: 'shown' };
}

function confirmed(ids: readonly string[]): Record<string, unknown> {
  return { ids: [...ids], mode: 'confirmed' };
}

describe('report approval flag outcomes', () => {
  it('counts fired and later-troubled changes per flag and mode, skipping unrecorded folders', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-shown-dead', {
      flags: shown(['shared_file', 'sensitive_path']),
      events: [event('dead', { reason: 'verify_red' })],
    });
    await writeChange(root, '002-confirmed-clean', {
      flags: confirmed(['shared_file']),
      events: [event('done')],
    });
    await writeChange(root, '003-none', { flags: shown([]) });
    await writeChange(root, '004-legacy', {
      events: [event('dead', { reason: 'verify_red' })],
    });
    await writeChange(root, '005-confirmed-trouble', {
      flags: confirmed(['verify_without_test']),
      events: [event('dead', { reason: 'verify_red' })],
      changeEvents: [event('regressed', { reason: 'archive_verify_red' })],
    });
    await writeChange(root, '006-shown-regressed', {
      flags: shown(['removed_requirement']),
      events: [event('regressed', { reason: 'scope_regression' })],
    });
    await writeChange(root, 'archive/007-confirmed-clean', {
      flags: confirmed(['unknown_capability']),
    });
    await writeChange(root, '008-invalid-mode', {
      flags: { ids: ['shared_file'], mode: 'prompted' },
      events: [event('dead', { reason: 'verify_red' })],
    });
    await writeChange(root, '009-invalid-ids', { flags: { ids: 'shared_file', mode: 'shown' } });
    await writeChange(root, '010-malformed', { rawManifest: '{ not json' });

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.approvalFlags.changes, 6);
    assert.deepEqual(report.approvalFlags.byFlag, {
      shared_file: {
        shown: { fired: 1, troubled: 1 },
        confirmed: { fired: 1, troubled: 0 },
      },
      sensitive_path: {
        shown: { fired: 1, troubled: 1 },
        confirmed: { fired: 0, troubled: 0 },
      },
      verify_without_test: {
        shown: { fired: 0, troubled: 0 },
        confirmed: { fired: 1, troubled: 1 },
      },
      removed_requirement: {
        shown: { fired: 1, troubled: 1 },
        confirmed: { fired: 0, troubled: 0 },
      },
      unknown_capability: {
        shown: { fired: 0, troubled: 0 },
        confirmed: { fired: 1, troubled: 0 },
      },
      none: {
        shown: { fired: 1, troubled: 0 },
        confirmed: { fired: 0, troubled: 0 },
      },
    });
  });

  it('treats only a task dead or a task or change regressed event as trouble', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-change-dead', {
      flags: shown(['shared_file']),
      changeEvents: [event('dead', { reason: 'archive' })],
    });
    await writeChange(root, '002-change-regressed', {
      flags: confirmed(['shared_file']),
      changeEvents: [event('regressed', { reason: 'archive_verify_red' })],
    });

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.deepEqual(report.approvalFlags.byFlag.shared_file, {
      shown: { fired: 1, troubled: 0 },
      confirmed: { fired: 1, troubled: 1 },
    });
    assert.equal(report.approvalFlags.changes, 2);
  });

  it('never recomputes flags: a folder without a recorded field contributes nothing', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-unrecorded', {
      events: [event('dead', { reason: 'verify_red' })],
    });
    await writeChange(root, '002-recorded', { flags: confirmed([]) });

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.approvalFlags.changes, 1);
    assert.equal(report.approvalFlags.byFlag.none.confirmed.fired, 1);
    for (const key of [
      'shared_file',
      'sensitive_path',
      'verify_without_test',
      'removed_requirement',
      'unknown_capability',
    ]) {
      assert.deepEqual(report.approvalFlags.byFlag[key], {
        shown: { fired: 0, troubled: 0 },
        confirmed: { fired: 0, troubled: 0 },
      });
    }
  });

  it('renders the section after planning and emits the field in stable JSON', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-output', {
      flags: confirmed(['shared_file']),
      events: [event('dead', { reason: 'verify_red' })],
    });

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    const text = formatMetricsReport(report);
    assert.ok(text.includes('Approval flags:'));
    assert.ok(text.includes('1 approved changes recorded flags'));
    assert.ok(
      text.includes(
        'shared_file: fired 1 (shown 0, confirmed 1), later trouble 1 (shown 0, confirmed 1)',
      ),
    );
    assert.ok(
      text.includes('none: fired 0 (shown 0, confirmed 0), later trouble 0 (shown 0, confirmed 0)'),
    );
    assert.ok(text.indexOf('Approval flags:') > text.indexOf('Planning:'));
    assert.ok(text.indexOf('Approval flags:') < text.indexOf('Cycle:'));

    const raw = await reportCommand({ cwd: root, json: true, stdout: () => {} });
    const parsed = JSON.parse(raw) as {
      approvalFlags: { changes: number; byFlag: Record<string, unknown> };
    };
    assert.equal(parsed.approvalFlags.changes, 1);
    assert.deepEqual(parsed.approvalFlags.byFlag.shared_file, {
      shown: { fired: 0, troubled: 0 },
      confirmed: { fired: 1, troubled: 1 },
    });
    assert.deepEqual(parsed.approvalFlags.byFlag.none, {
      shown: { fired: 0, troubled: 0 },
      confirmed: { fired: 0, troubled: 0 },
    });
  });
});
