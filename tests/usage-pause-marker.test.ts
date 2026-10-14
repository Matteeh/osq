import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_GATES_CONFIG, validateGatesConfig } from '../src/core/foundation/config-gates.js';
import { defineConfig } from '../src/core/foundation/config.js';
import {
  type UsageLimit,
  findUsageLimit,
  formatPauseUntil,
  pauseUntil,
  readActivePause,
  readUsagePause,
  usagePausePath,
  writeUsagePause,
} from '../src/core/run/usage-pause.js';

const NOW = Date.parse('2026-10-14T12:00:00.000Z');
const WAIT_SECONDS = 1800;
const INVALID_MESSAGE = 'gates.usageLimitWaitSeconds must be a non-negative integer';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-usage-pause-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

/** The message a throwing callback raises, for an exact assertion. */
function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected the call to throw');
}

describe('Pause times', () => {
  const rows: readonly {
    readonly resetsAt?: string;
    readonly until: string;
    readonly source: 'harness' | 'wait';
  }[] = [
    { resetsAt: '2026-10-14T15:00:00.000Z', until: '2026-10-14T15:00:00.000Z', source: 'harness' },
    { until: '2026-10-14T12:30:00.000Z', source: 'wait' },
    { resetsAt: '2026-10-14T11:00:00.000Z', until: '2026-10-14T12:30:00.000Z', source: 'wait' },
  ];

  for (const row of rows) {
    it(`resetsAt ${row.resetsAt ?? 'none'} pauses until ${row.until} (${row.source})`, () => {
      const limit: UsageLimit = row.resetsAt === undefined ? {} : { resetsAt: row.resetsAt };
      assert.deepEqual(pauseUntil(limit, NOW, WAIT_SECONDS), {
        until: row.until,
        source: row.source,
      });
    });
  }
});

describe('Active pause', () => {
  const pause = {
    task: '2',
    until: '2026-10-14T15:00:00.000Z',
    source: 'harness' as const,
    error: 'Monthly quota exceeded',
  };

  it('writes and reads the marker back', async () => {
    await writeUsagePause(root, pause);
    assert.equal(typeof (await readUsagePause(root))?.task, 'string');
    assert.deepEqual(await readUsagePause(root), pause);
  });

  it('returns the pause only while until is later than now', async () => {
    await writeUsagePause(root, pause);
    assert.deepEqual(await readActivePause(root, Date.parse('2026-10-14T14:59:00.000Z')), pause);
    assert.equal(await readActivePause(root, Date.parse('2026-10-14T15:00:00.000Z')), null);
  });

  it('renders the pause time in UTC', () => {
    assert.equal(formatPauseUntil(pause.until), '2026-10-14 15:00 UTC');
  });

  it('writes the task number quoted and reads it as a string', async () => {
    await writeUsagePause(root, pause);
    const content = await fs.readFile(usagePausePath(root), 'utf8');
    assert.match(content, /^task: "2"$/m);
  });

  it('writes the default body and reads no error without one', async () => {
    await writeUsagePause(root, {
      task: '3',
      until: '2026-10-14T15:00:00.000Z',
      source: 'wait',
    });
    const content = await fs.readFile(usagePausePath(root), 'utf8');
    assert.match(content, /usage limit reached/);
    const read = await readUsagePause(root);
    assert.deepEqual(read, { task: '3', until: '2026-10-14T15:00:00.000Z', source: 'wait' });
    assert.equal(read?.error, undefined);
  });
});

describe('Unreadable marker', () => {
  it('returns null when the marker is missing', async () => {
    assert.equal(await readUsagePause(root), null);
    assert.equal(await readActivePause(root, NOW), null);
  });

  it('returns null when until is not a time', async () => {
    await fs.mkdir(path.join(root, '.run'), { recursive: true });
    await fs.writeFile(
      usagePausePath(root),
      ['---', 'task: "2"', 'until: "not a time"', 'source: harness', '---', 'boom', ''].join('\n'),
      'utf8',
    );
    assert.equal(await readUsagePause(root), null);
    assert.equal(await readActivePause(root, NOW), null);
  });
});

describe('Last limit wins', () => {
  it('returns the data of the last usage_limit event', () => {
    const events = [
      { type: 'text', timestamp: '2026-10-14T12:00:00.000Z', data: {} },
      { type: 'usage_limit', data: { error: 'first' } },
      { type: 'usage_limit', data: { resetsAt: '2026-10-14T15:00:00.000Z' } },
    ];
    assert.deepEqual(findUsageLimit(events), { resetsAt: '2026-10-14T15:00:00.000Z' });
  });

  it('returns undefined without a usage_limit event', () => {
    assert.equal(findUsageLimit([{ type: 'text', data: {} }]), undefined);
    assert.equal(findUsageLimit([]), undefined);
  });
});

describe('Usage limit wait default', () => {
  it('defaults to 1800 with no gates block, an empty block, or a partial block', () => {
    assert.equal(defineConfig({}).gates?.usageLimitWaitSeconds, 1800);
    assert.equal(defineConfig({ gates: {} }).gates?.usageLimitWaitSeconds, 1800);
    assert.equal(
      defineConfig({ gates: { preSpawnVerify: 'off' } }).gates?.usageLimitWaitSeconds,
      1800,
    );
    assert.equal(validateGatesConfig(undefined).usageLimitWaitSeconds, 1800);
    assert.equal(DEFAULT_GATES_CONFIG.usageLimitWaitSeconds, 1800);
  });
});

describe('Invalid usage limit wait', () => {
  const values = [-1, 1.5, '900'];

  for (const value of values) {
    it(`rejects ${JSON.stringify(value)} through defineConfig`, () => {
      assert.equal(
        messageOf(() => defineConfig({ gates: { usageLimitWaitSeconds: value as number } })),
        INVALID_MESSAGE,
      );
    });
  }

  it('rejects a negative value through validateGatesConfig', () => {
    assert.equal(
      messageOf(() => validateGatesConfig({ usageLimitWaitSeconds: -1 })),
      INVALID_MESSAGE,
    );
  });
});
