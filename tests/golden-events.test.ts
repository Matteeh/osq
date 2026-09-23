import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { hashChangeFolder } from '../src/core/spec/hasher.js';
import { MockAdapter } from '../src/harness/mock.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/events/', import.meta.url));
const VERIFIED_FIXTURE = path.join(FIXTURES_DIR, 'verified.jsonl');
const DEAD_FIXTURE = path.join(FIXTURES_DIR, 'dead.jsonl');

/** `UPDATE_GOLDEN=1` rewrites the checked-in fixtures from the live run. */
const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === '1';
const MASKED_PID = 12345;
/** Repository size counts depend on the scaffolded project and are pinned to one value. */
const MASKED_REPO_COUNT = 0;

/** Rewrite any string that embeds the ephemeral project root as a relative path. */
function relativizePaths(value: string, projectRoot: string): string {
  if (!value.includes(projectRoot)) return value;
  const relative = path.relative(projectRoot, value);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/');
  }
  return value.split(`${projectRoot}${path.sep}`).join('').split(projectRoot).join('');
}

function maskValue(value: unknown, projectRoot: string): unknown {
  if (typeof value === 'string') return relativizePaths(value, projectRoot);
  if (Array.isArray(value)) return value.map((entry) => maskValue(entry, projectRoot));
  if (value !== null && typeof value === 'object') {
    const masked: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      masked[key] = maskValue(entry, projectRoot);
    }
    return masked;
  }
  return value;
}

/** Strip every non-deterministic field from one parsed event. */
function maskEvent(event: Record<string, unknown>, projectRoot: string): Record<string, unknown> {
  const masked = maskValue(event, projectRoot) as Record<string, unknown>;
  if ('timestamp' in masked) masked.timestamp = '[TIMESTAMP]';

  const data = masked.data;
  if (data !== null && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if ('pid' in record) record.pid = MASKED_PID;
    if ('commit' in record) record.commit = '[COMMIT]';
    if ('version' in record) record.version = '[VERSION]';
    if ('osqVersion' in record) record.osqVersion = '[VERSION]';
    if ('elapsedSeconds' in record) record.elapsedSeconds = 0;
    if ('duration' in record) record.duration = 0;
    if (masked.type === 'measures') {
      maskScopeHashes(record);
      maskRepoCounts(record);
    }
  }

  return masked;
}

/** Replace content-addressed hashes in a measures event with a stable token. */
function maskScopeHashes(data: Record<string, unknown>): void {
  const scopeHashes = data.scopeHashes;
  if (scopeHashes === null || typeof scopeHashes !== 'object') return;
  for (const entry of Object.values(scopeHashes as Record<string, unknown>)) {
    if (entry === null || typeof entry !== 'object') continue;
    const hashes = entry as Record<string, unknown>;
    if (hashes.before !== null && hashes.before !== undefined) hashes.before = '[HASH]';
    if (hashes.after !== null && hashes.after !== undefined) hashes.after = '[HASH]';
  }
}

/** Replace the scaffolded project's file and line counts with one stable value. */
function maskRepoCounts(data: Record<string, unknown>): void {
  if ('repoFiles' in data) data.repoFiles = MASKED_REPO_COUNT;
  if ('repoLines' in data) data.repoLines = MASKED_REPO_COUNT;
}

/**
 * Convert a raw `events.jsonl` stream into a deterministic string: timestamps,
 * pids, versions, and absolute project paths are replaced with stable tokens so
 * the sequence can be checked into git and compared byte-for-byte.
 */
function normalizeEvents(rawJsonl: string, projectRoot: string): string {
  const lines = rawJsonl
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) =>
      JSON.stringify(maskEvent(JSON.parse(line) as Record<string, unknown>, projectRoot)),
    );
  return `${lines.join('\n')}\n`;
}

async function readNormalizedEvents(specFolder: string, projectRoot: string): Promise<string> {
  const raw = await fs.readFile(path.join(specFolder, '.run', 'events', '1.jsonl'), 'utf8');
  return normalizeEvents(raw, projectRoot);
}

/** Compare against the checked-in fixture, or rewrite it under `UPDATE_GOLDEN=1`. */
async function assertGolden(actual: string, fixturePath: string): Promise<void> {
  if (UPDATE_GOLDEN) {
    await fs.mkdir(path.dirname(fixturePath), { recursive: true });
    await fs.writeFile(fixturePath, actual, 'utf8');
    console.log(`golden events updated: ${path.relative(process.cwd(), fixturePath)}`);
    return;
  }

  const expected = await fs.readFile(fixturePath, 'utf8');
  assert.equal(actual, expected);
}

/**
 * Seal the change folder without linting. The golden fixtures pin the exact
 * `verify_ran` command byte-for-byte, so the sentinel must stay in this inert
 * event payload; writing the approval marker directly exercises the runner's
 * zero-trust gate without submitting the sentinel to approval lint.
 */
async function sealApproval(specFolder: string): Promise<void> {
  const runDir = path.join(specFolder, '.run');
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'approved'), await hashChangeFolder(specFolder), 'utf8');
}

async function writeTask(specFolder: string, title: string, verify: string): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    `title: ${title}`,
    `verify: ${verify}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] should be observed',
  ].join('\n');
  await fs.writeFile(taskPath, `${task}\n`, 'utf8');
}

describe('Golden event streams', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-golden-events-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Golden Events');
    specFolder = spec.folderPath;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('normalizes timestamps, pids, versions, and project paths to stable tokens', () => {
    const raw = `${JSON.stringify({
      type: 'started',
      timestamp: '2026-01-01T00:00:00.000Z',
      data: {
        pid: 999,
        version: '9.9.9',
        osqVersion: '9.9.9',
        commit: 'abc123',
        elapsedSeconds: 12.5,
        path: path.join(tmpDir, 'src', 'a.ts'),
      },
    })}\n`;

    assert.equal(
      normalizeEvents(raw, tmpDir),
      `${JSON.stringify({
        type: 'started',
        timestamp: '[TIMESTAMP]',
        data: {
          pid: MASKED_PID,
          version: '[VERSION]',
          osqVersion: '[VERSION]',
          commit: '[COMMIT]',
          elapsedSeconds: 0,
          path: 'src/a.ts',
        },
      })}\n`,
    );
  });

  it('masks verify_ran duration to zero while preserving exit code and command', () => {
    const raw = `${JSON.stringify({
      type: 'verify_ran',
      timestamp: '2026-01-01T00:00:00.000Z',
      data: { command: 'node -e "process.exit(0)"', exitCode: 0, duration: 1.23 },
    })}\n`;

    assert.equal(
      normalizeEvents(raw, tmpDir),
      `${JSON.stringify({
        type: 'verify_ran',
        timestamp: '[TIMESTAMP]',
        data: { command: 'node -e "process.exit(0)"', exitCode: 0, duration: 0 },
      })}\n`,
    );
  });

  it('masks measures scope hashes to stable tokens', () => {
    const raw = `${JSON.stringify({
      type: 'measures',
      timestamp: '2026-01-01T00:00:00.000Z',
      data: {
        phase: 'end',
        changedFiles: 1,
        changedLines: 2,
        scopeHashes: {
          'src/a.ts': { before: 'sha256:aaa', after: 'sha256:bbb' },
          'src/b.ts': { before: null, after: 'sha256:ccc' },
        },
      },
    })}\n`;

    assert.equal(
      normalizeEvents(raw, tmpDir),
      `${JSON.stringify({
        type: 'measures',
        timestamp: '[TIMESTAMP]',
        data: {
          phase: 'end',
          changedFiles: 1,
          changedLines: 2,
          scopeHashes: {
            'src/a.ts': { before: '[HASH]', after: '[HASH]' },
            'src/b.ts': { before: null, after: '[HASH]' },
          },
        },
      })}\n`,
    );
  });

  it('masks measures repository counts to a stable placeholder', () => {
    const raw = `${JSON.stringify({
      type: 'measures',
      timestamp: '2026-01-01T00:00:00.000Z',
      data: { phase: 'start', repoFiles: 14, repoLines: 518, scopeFiles: 0, scopeLines: 0 },
    })}\n`;

    assert.equal(
      normalizeEvents(raw, tmpDir),
      `${JSON.stringify({
        type: 'measures',
        timestamp: '[TIMESTAMP]',
        data: {
          phase: 'start',
          repoFiles: MASKED_REPO_COUNT,
          repoLines: MASKED_REPO_COUNT,
          scopeFiles: 0,
          scopeLines: 0,
        },
      })}\n`,
    );
  });

  it('matches the checked-in golden events for a verified task', async () => {
    await writeTask(
      specFolder,
      'When the mock task verifies, the emitted events are golden',
      'node -e "process.exit(0)"',
    );
    await sealApproval(specFolder);

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, new MockAdapter());
    assert.equal(result.success, true);

    await assertGolden(await readNormalizedEvents(specFolder, tmpDir), VERIFIED_FIXTURE);
  });

  it('still matches the verified golden events when the scaffolded project grows', async () => {
    await writeTask(
      specFolder,
      'When the mock task verifies, the emitted events are golden',
      'node -e "process.exit(0)"',
    );
    await sealApproval(specFolder);

    const plannerPath = path.join(tmpDir, 'PLANNER.md');
    const original = await fs.readFile(plannerPath, 'utf8');
    const growth = Array.from({ length: 10 }, (_, index) => `added line ${index + 1}`).join('\n');
    await fs.writeFile(plannerPath, `${original}${growth}\n`, 'utf8');

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, new MockAdapter());
    assert.equal(result.success, true);

    await assertGolden(await readNormalizedEvents(specFolder, tmpDir), VERIFIED_FIXTURE);
  });

  it('matches the checked-in golden events for a dead task', async () => {
    await writeTask(
      specFolder,
      'When the mock task fails, the emitted events are golden',
      'node -e "process.exit(1)"',
    );
    await sealApproval(specFolder);

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, new MockAdapter());
    assert.equal(result.reason, 'verify_red');

    await assertGolden(await readNormalizedEvents(specFolder, tmpDir), DEAD_FIXTURE);
  });
});
