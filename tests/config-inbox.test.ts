import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  DEFAULT_INBOX_CONFIG,
  parseQuietHours,
  validateInboxConfig,
} from '../src/core/foundation/config-inbox.js';
import { DEFAULT_CONFIG, defineConfig, loadConfig } from '../src/core/foundation/config.js';
import type { InboxConfig } from '../src/index.js';

const DEFAULTS: InboxConfig = {
  sound: 'default',
  quietHours: null,
  soundWindowSeconds: 5,
  eventDebounceMs: 200,
  pollSeconds: 30,
};

describe('inbox configuration', () => {
  it('defaults every key through defineConfig and DEFAULT_CONFIG', () => {
    assert.deepEqual(DEFAULT_INBOX_CONFIG, DEFAULTS);
    assert.deepEqual(DEFAULT_CONFIG.inbox, DEFAULTS);
    assert.deepEqual(defineConfig({}).inbox, DEFAULTS);
  });

  it('keeps each default for a partial block', () => {
    const config = defineConfig({ inbox: { quietHours: '22:00-07:00' } });
    assert.equal(config.inbox?.quietHours, '22:00-07:00');
    assert.equal(config.inbox?.sound, 'default');
    assert.equal(config.inbox?.soundWindowSeconds, 5);
    assert.equal(config.inbox?.eventDebounceMs, 200);
    assert.equal(config.inbox?.pollSeconds, 30);
  });

  it('keeps null quiet hours when the block omits or nulls them', () => {
    assert.equal(defineConfig({ inbox: { sound: 'bell' } }).inbox?.quietHours, null);
    assert.equal(defineConfig({ inbox: { quietHours: null } }).inbox?.quietHours, null);
  });

  it('rejects malformed quiet hours naming the key', () => {
    const invalid = ['25:00-07:00', '22:60-07:00', '22:00-22:00', '10pm-7am', '7:00-8:00'];
    for (const quietHours of invalid) {
      assert.throws(
        () => defineConfig({ inbox: { quietHours } }),
        /inbox\.quietHours must be HH:MM-HH:MM with two different times/,
      );
    }
  });

  it('rejects a non-string quiet hours naming the key', () => {
    assert.throws(() => defineConfig({ inbox: { quietHours: 22 } } as never), /inbox\.quietHours/);
  });

  it('rejects non-positive and non-finite poll intervals naming the key', () => {
    for (const pollSeconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => defineConfig({ inbox: { pollSeconds } }), /inbox\.pollSeconds/);
    }
  });

  it('rejects an empty or non-string sound naming the key', () => {
    assert.throws(() => defineConfig({ inbox: { sound: '' } }), /inbox\.sound/);
    assert.throws(() => defineConfig({ inbox: { sound: 3 } } as never), /inbox\.sound/);
  });

  it('accepts a non-empty custom sound path', () => {
    const config = defineConfig({ inbox: { sound: 'sounds/ping.wav' } });
    assert.equal(config.inbox?.sound, 'sounds/ping.wav');
  });

  it('rejects negative and non-finite windows and debounces naming the key', () => {
    for (const soundWindowSeconds of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () => defineConfig({ inbox: { soundWindowSeconds } }),
        /inbox\.soundWindowSeconds/,
      );
    }
    for (const eventDebounceMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => defineConfig({ inbox: { eventDebounceMs } }), /inbox\.eventDebounceMs/);
    }
  });

  it('accepts a zero window and a zero debounce', () => {
    const config = defineConfig({ inbox: { soundWindowSeconds: 0, eventDebounceMs: 0 } });
    assert.equal(config.inbox?.soundWindowSeconds, 0);
    assert.equal(config.inbox?.eventDebounceMs, 0);
  });

  it('rejects a non-object inbox block', () => {
    assert.throws(() => defineConfig({ inbox: 42 } as never), /inbox configuration/);
    assert.throws(() => defineConfig({ inbox: [] } as never), /inbox configuration/);
  });

  it('validates a bare block through validateInboxConfig', () => {
    assert.deepEqual(validateInboxConfig(undefined), DEFAULTS);
    assert.deepEqual(validateInboxConfig({ sound: 'off' }), { ...DEFAULTS, sound: 'off' });
  });
});

describe('parseQuietHours', () => {
  it('returns start and end as minutes after midnight', () => {
    assert.deepEqual(parseQuietHours('22:00-07:00'), { start: 1320, end: 420 });
    assert.deepEqual(parseQuietHours('00:00-23:59'), { start: 0, end: 1439 });
  });

  it('rejects malformed windows naming the key', () => {
    for (const value of ['25:00-07:00', '22:00-22:00', '10pm-7am']) {
      assert.throws(() => parseQuietHours(value), /inbox\.quietHours/);
    }
  });
});

describe('inbox configuration from the config file', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-config-inbox-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('loads an inbox block through osq.config.ts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      "export default { inbox: { sound: 'bell' } };",
      'utf8',
    );
    const config = await loadConfig(tmpDir);
    assert.equal(config.inbox?.sound, 'bell');
    assert.equal(config.inbox?.quietHours, null);
    assert.equal(config.inbox?.pollSeconds, 30);
  });
});
