import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createProgram } from '../src/cli/index.js';
import { parseReportPeriod, reportCommand } from '../src/cli/report.js';
import { resolveWaitLogPath } from '../src/core/status/wait-log.js';

const fixtureReportRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixture',
  'report',
);

let tmpDir: string;
let home: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-inbox-wait-cli-'));
  home = path.join(tmpDir, 'home');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Copy the hand-written fixture log under the temporary home. */
async function copyFixture(): Promise<void> {
  const content = await fs.readFile(path.join(fixtureReportRoot, 'inbox-wait.jsonl'), 'utf8');
  const logPath = await resolveWaitLogPath(fixtureReportRoot, home);
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.writeFile(logPath, content);
}

describe('osq report Inbox waiting section', () => {
  it('prints the section and the JSON key when the fixture log exists', async () => {
    await copyFixture();

    const text = await reportCommand({ cwd: fixtureReportRoot, home, stdout: () => {} });
    assert.ok(text.includes('Inbox waiting (start to now):'), text);
    assert.ok(text.includes('  approval: 2 handled, median 2m 1s, longest 3m 1s'), text);

    const raw = await reportCommand({
      cwd: fixtureReportRoot,
      home,
      json: true,
      stdout: () => {},
    });
    const parsed = JSON.parse(raw) as {
      inboxWait: { kinds: { approval: { handled: number } } };
    };
    assert.equal(parsed.inboxWait.kinds.approval.handled, 2);
  });

  it('limits the section to the --since period', async () => {
    await copyFixture();

    const text = await reportCommand({
      cwd: fixtureReportRoot,
      home,
      since: '2027-01-01',
      stdout: () => {},
    });
    assert.ok(text.includes('Inbox waiting (2027-01-01 to now):'), text);
    assert.ok(text.includes('  approval: not measured'), text);
  });

  it('leaves the report unchanged without a wait log', async () => {
    const text = await reportCommand({ cwd: fixtureReportRoot, home, stdout: () => {} });
    assert.ok(!text.includes('Inbox waiting'), text);

    const raw = await reportCommand({
      cwd: fixtureReportRoot,
      home,
      json: true,
      stdout: () => {},
    });
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.equal('inboxWait' in parsed, false);
  });

  it('rejects a period bound that Date.parse cannot read', () => {
    assert.throws(() => parseReportPeriod('yesterday', null), /--since is not a date: yesterday/);
    assert.throws(() => parseReportPeriod(null, 'yesterday'), /--until is not a date: yesterday/);
    assert.throws(
      () => parseReportPeriod('2026-02-01', '2026-01-01'),
      /--since must be before --until/,
    );
  });

  it('registers --json, --since, and --until on report', () => {
    const report = createProgram('0.0.0').commands.find((command) => command.name() === 'report');
    assert.ok(report);
    const longs = report.options.map((option) => option.long);
    assert.ok(longs.includes('--json'), longs.join(', '));
    assert.ok(longs.includes('--since'), longs.join(', '));
    assert.ok(longs.includes('--until'), longs.join(', '));
  });
});
