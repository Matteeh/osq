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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-starts-'));
  tmpDirs.push(root);
  await fs.mkdir(path.join(root, 'openspec', 'changes'), { recursive: true });
  return root;
}

/** One pre-spawn `verify_ran` event carrying the given observed data. */
function preSpawn(data: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'verify_ran',
    timestamp: ts,
    data: { command: 'x', phase: 'pre_spawn', ...data },
  };
}

/** A task file and an event stream for one change folder. */
async function writeChange(
  root: string,
  folder: string,
  streams: Record<string, readonly Record<string, unknown>[]>,
  approvalFlags?: Record<string, unknown>,
): Promise<string> {
  const folderPath = path.join(root, 'openspec', 'changes', folder);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folderPath, 'proposal.md'),
    '---\ntitle: fixture\n---\n## Goal\n\nFixture.\n',
    'utf8',
  );
  const eventsDir = path.join(folderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  for (const [taskNumber, events] of Object.entries(streams)) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${taskNumber}.md`),
      `---\ntitle: Task ${taskNumber}\n---\n## Acceptance\n- [ ] x\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(eventsDir, `${taskNumber}.jsonl`),
      events.length > 0 ? `${events.map((entry) => JSON.stringify(entry)).join('\n')}\n` : '',
      'utf8',
    );
  }
  if (approvalFlags) {
    await fs.writeFile(
      path.join(folderPath, '.run', 'manifest.json'),
      JSON.stringify({ approvedAt: ts, approvalFlags }),
      'utf8',
    );
  }
  return folderPath;
}

describe('report pre-spawn start outcomes', () => {
  it('counts missing-path runs and runs and passes by declared start across task streams', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-starts', {
      '1': [
        preSpawn({ expected: 'red', mismatch: false, exitCode: 1 }),
        preSpawn({
          expected: 'red',
          mismatch: false,
          exitCode: 0,
          missingPaths: ['tests/new.test.ts'],
        }),
        preSpawn({ expected: 'red', mismatch: false, exitCode: 0 }),
        preSpawn({ expected: 'green', mismatch: false, exitCode: 0 }),
        preSpawn({ expected: 'any', mismatch: false, exitCode: 1 }),
        // A post-spawn gate run is verification history, never a pre-spawn run.
        { type: 'verify_ran', timestamp: ts, data: { command: 'x', exitCode: 0 } },
      ],
      '2': [preSpawn({ expected: 'red', mismatch: false, exitCode: 0 })],
    });

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.history.preSpawnVerify.runs, 6);
    assert.equal(report.history.preSpawnVerify.missingPathRuns, 1);
    assert.deepEqual(report.history.preSpawnVerify.byStart, {
      red: { runs: 4, passed: 3 },
      green: { runs: 1, passed: 1 },
      any: { runs: 1, passed: 0 },
    });

    const text = formatMetricsReport(report);
    assert.ok(text.includes('Pre-spawn verify mismatches: 0 of 6 runs'), text);
    assert.ok(text.includes('Pre-spawn verify with missing paths: 1 of 6 runs'), text);
    assert.ok(
      text.includes(
        'Pre-spawn verify by declared start: red 3 of 4 passed, green 1 of 1 passed, any 0 of 1 passed',
      ),
      text,
    );

    const raw = await reportCommand({ cwd: root, json: true, stdout: () => {} });
    const parsed = JSON.parse(raw) as {
      history: { preSpawnVerify: Record<string, unknown> };
    };
    assert.equal(parsed.history.preSpawnVerify.runs, 6);
    assert.equal(parsed.history.preSpawnVerify.missingPathRuns, 1);
    assert.deepEqual(parsed.history.preSpawnVerify.byStart, {
      red: { runs: 4, passed: 3 },
      green: { runs: 1, passed: 1 },
      any: { runs: 1, passed: 0 },
    });
  });

  it('reports a recorded verify_starts_conflict change under that approval flag', async () => {
    const root = await tempRoot();
    await writeChange(
      root,
      '001-conflict',
      {
        '1': [{ type: 'dead', timestamp: ts, data: { reason: 'verify_red' } }],
      },
      { ids: ['verify_starts_conflict'], mode: 'shown' },
    );

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    assert.equal(report.approvalFlags.changes, 1);
    assert.deepEqual(report.approvalFlags.byFlag.verify_starts_conflict, {
      shown: { fired: 1, troubled: 1 },
      confirmed: { fired: 0, troubled: 0 },
    });

    const text = formatMetricsReport(report);
    assert.ok(
      text.includes(
        'verify_starts_conflict: fired 1 (shown 1, confirmed 0), later trouble 1 (shown 1, confirmed 0)',
      ),
      text,
    );

    const raw = await reportCommand({ cwd: root, json: true, stdout: () => {} });
    const parsed = JSON.parse(raw) as {
      approvalFlags: { byFlag: Record<string, unknown> };
    };
    assert.deepEqual(parsed.approvalFlags.byFlag.verify_starts_conflict, {
      shown: { fired: 1, troubled: 1 },
      confirmed: { fired: 0, troubled: 0 },
    });
  });
});
