import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseQuietHours } from '../src/core/foundation/config-inbox.js';
import { defineConfig } from '../src/core/foundation/config.js';
import { PACKAGE_ROOT } from '../src/core/foundation/package-root.js';
import { type InboxSoundChild, createInboxSound } from '../src/core/status/inbox-sound.js';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE_SOUND = path.join(PACKAGE_ROOT, 'sounds', 'inbox.wav');

/** A child whose only jobs are to catch an error and to be unref'd. */
class FakeChild extends EventEmitter {
  unrefCount = 0;

  unref(): void {
    this.unrefCount += 1;
  }
}

interface SpawnRecord {
  readonly command: string;
  readonly args: readonly string[];
}

/** Mutable seams so a single test can replace `spawn` with a throwing fake. */
interface HarnessDeps {
  platform: NodeJS.Platform;
  path: string;
  spawn: (command: string, args: readonly string[]) => InboxSoundChild;
  bell: () => void;
  warn: (message: string) => void;
  exists?: (file: string) => boolean;
}

interface Harness {
  readonly deps: HarnessDeps;
  readonly bells: string[];
  readonly warns: string[];
  readonly spawns: SpawnRecord[];
  readonly children: FakeChild[];
}

/** Recording seams: every bell, warning, and spawn lands in an array. */
function createHarness(overrides: { platform?: NodeJS.Platform; path?: string } = {}): Harness {
  const bells: string[] = [];
  const warns: string[] = [];
  const spawns: SpawnRecord[] = [];
  const children: FakeChild[] = [];
  const deps: HarnessDeps = {
    platform: overrides.platform ?? 'linux',
    path: overrides.path ?? '',
    spawn: (command, args) => {
      const child = new FakeChild();
      spawns.push({ command, args });
      children.push(child);
      return child;
    },
    bell: () => {
      bells.push('bell');
    },
    warn: (message) => {
      warns.push(message);
    },
  };
  return { deps, bells, warns, spawns, children };
}

/** A local date in one fixed month, so quiet hours are deterministic. */
function at(hours: number, minutes: number, seconds = 0, day = 1): Date {
  return new Date(2026, 0, day, hours, minutes, seconds);
}

/** Write a regular file with the execute bit set, as a fake player. */
async function makeExecutable(dir: string, name: string): Promise<void> {
  const file = path.join(dir, name);
  await fs.writeFile(file, '#!/bin/sh\nexit 0\n');
  await fs.chmod(file, 0o755);
}

/** Recursively collect `.ts` files under `dir`. */
async function listTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listTsFiles(full)));
    else if (entry.isFile() && full.endsWith('.ts')) files.push(full);
  }
  return files;
}

/** Every static or dynamic import specifier in `source`. */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) specifiers.push(match[1]);
  for (const match of source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) specifiers.push(match[1]);
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

describe('inbox sound', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-sound-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('spawns paplay with the package sound when pw-play is absent', async () => {
    await makeExecutable(tmpDir, 'paplay');
    await makeExecutable(tmpDir, 'aplay');
    const harness = createHarness({ path: tmpDir });
    const sound = createInboxSound(tmpDir, defineConfig({}), harness.deps);

    sound.notify(at(12, 0, 0));

    assert.deepEqual(harness.spawns, [{ command: 'paplay', args: [PACKAGE_SOUND] }]);
    assert.deepEqual(harness.bells, []);
    assert.equal(harness.children[0].unrefCount, 1);
  });

  it('prefers pw-play, then paplay, then aplay on linux', async () => {
    for (const name of ['pw-play', 'paplay', 'aplay']) await makeExecutable(tmpDir, name);
    const harness = createHarness({ path: tmpDir });

    createInboxSound(tmpDir, defineConfig({}), harness.deps).notify(at(12, 0, 0));

    assert.deepEqual(
      harness.spawns.map((record) => record.command),
      ['pw-play'],
    );
  });

  it('ignores a non-executable file when picking a player', async () => {
    await fs.writeFile(path.join(tmpDir, 'paplay'), '#!/bin/sh\n');
    const harness = createHarness({ path: tmpDir });

    createInboxSound(tmpDir, defineConfig({}), harness.deps).notify(at(12, 0, 0));

    assert.deepEqual(harness.spawns, []);
    assert.equal(harness.bells.length, 1);
  });

  it('spawns afplay with the sound file on darwin', async () => {
    await makeExecutable(tmpDir, 'afplay');
    await makeExecutable(tmpDir, 'paplay');
    const harness = createHarness({ platform: 'darwin', path: tmpDir });

    createInboxSound(tmpDir, defineConfig({}), harness.deps).notify(at(12, 0, 0));

    assert.deepEqual(harness.spawns, [{ command: 'afplay', args: [PACKAGE_SOUND] }]);
    assert.deepEqual(harness.bells, []);
  });

  it('rings the bell and spawns nothing when no player is in PATH', () => {
    const harness = createHarness({ path: tmpDir });

    createInboxSound(tmpDir, defineConfig({}), harness.deps).notify(at(12, 0, 0));

    assert.deepEqual(harness.spawns, []);
    assert.equal(harness.bells.length, 1);
  });

  it('rings the bell when the spawned player emits an error', async () => {
    await makeExecutable(tmpDir, 'paplay');
    const harness = createHarness({ path: tmpDir });
    const sound = createInboxSound(tmpDir, defineConfig({}), harness.deps);

    sound.notify(at(12, 0, 0));
    assert.equal(harness.bells.length, 0);

    harness.children[0].emit('error', new Error('no player'));

    assert.equal(harness.bells.length, 1);
  });

  it('never throws when the seam throws, ringing the bell instead', async () => {
    await makeExecutable(tmpDir, 'paplay');
    const harness = createHarness({ path: tmpDir });
    harness.deps.spawn = () => {
      throw new Error('cannot spawn');
    };

    const sound = createInboxSound(tmpDir, defineConfig({}), harness.deps);

    assert.doesNotThrow(() => sound.notify(at(12, 0, 0)));
    assert.equal(harness.bells.length, 1);
    assert.deepEqual(harness.spawns, []);
  });

  it('rings the bell for sound bell and does nothing for sound off', () => {
    const bellHarness = createHarness({ path: tmpDir });
    createInboxSound(tmpDir, defineConfig({ inbox: { sound: 'bell' } }), bellHarness.deps).notify(
      at(12, 0, 0),
    );
    assert.equal(bellHarness.bells.length, 1);
    assert.deepEqual(bellHarness.spawns, []);

    const offHarness = createHarness({ path: tmpDir });
    createInboxSound(tmpDir, defineConfig({ inbox: { sound: 'off' } }), offHarness.deps).notify(
      at(12, 0, 0),
    );
    assert.equal(offHarness.bells.length, 0);
    assert.deepEqual(offHarness.spawns, []);
  });

  it('spawns the player with a custom sound file under the project root', async () => {
    await makeExecutable(tmpDir, 'paplay');
    await fs.mkdir(path.join(tmpDir, 'sounds'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'sounds', 'ping.wav'), 'wav');
    const harness = createHarness({ path: tmpDir });
    const sound = createInboxSound(
      tmpDir,
      defineConfig({ inbox: { sound: 'sounds/ping.wav' } }),
      harness.deps,
    );

    sound.notify(at(12, 0, 0));

    assert.deepEqual(harness.spawns, [
      { command: 'paplay', args: [path.join(tmpDir, 'sounds', 'ping.wav')] },
    ]);
  });

  it('warns once and rings the bell when the configured sound file is missing', () => {
    const harness = createHarness({ path: tmpDir });
    const missing = path.join(tmpDir, 'sounds', 'missing.wav');
    const sound = createInboxSound(
      tmpDir,
      defineConfig({ inbox: { sound: 'sounds/missing.wav', soundWindowSeconds: 0 } }),
      harness.deps,
    );

    assert.deepEqual(harness.warns, [
      `osq inbox: inbox.sound: ${missing} does not exist; using the bell`,
    ]);

    sound.notify(at(12, 0, 0));
    sound.notify(at(12, 0, 1));

    assert.equal(harness.warns.length, 1);
    assert.equal(harness.bells.length, 2);
    assert.deepEqual(harness.spawns, []);
  });

  it('stays silent in quiet hours across midnight, start inclusive and end exclusive', () => {
    const harness = createHarness({ path: tmpDir });
    const sound = createInboxSound(
      tmpDir,
      defineConfig({ inbox: { sound: 'bell', quietHours: '22:00-07:00' } }),
      harness.deps,
    );

    sound.notify(at(21, 59, 0));
    sound.notify(at(22, 0, 0));
    sound.notify(at(23, 30, 0));
    sound.notify(at(6, 59, 0, 2));
    sound.notify(at(7, 0, 0, 2));

    assert.equal(harness.bells.length, 2);
    assert.deepEqual(parseQuietHours('22:00-07:00'), { start: 22 * 60, end: 7 * 60 });
  });

  it('plays at most once per sound window', () => {
    const harness = createHarness({ path: tmpDir });
    const sound = createInboxSound(
      tmpDir,
      defineConfig({ inbox: { sound: 'bell', soundWindowSeconds: 5 } }),
      harness.deps,
    );

    sound.notify(at(12, 0, 0));
    sound.notify(at(12, 0, 3));
    sound.notify(at(12, 0, 6));

    assert.equal(harness.bells.length, 2);
  });

  it('never lets the watcher or harness import the inbox sound modules', async () => {
    const roots = [path.join(REPO, 'src', 'watcher'), path.join(REPO, 'src', 'harness')];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of await listTsFiles(root)) {
        for (const specifier of importSpecifiers(await fs.readFile(file, 'utf8'))) {
          if (specifier.includes('inbox-sound') || specifier.includes('dispatch-follow')) {
            offenders.push(`${path.relative(REPO, file)} imports ${specifier}`);
          }
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});
