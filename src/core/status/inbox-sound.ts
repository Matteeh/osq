import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_INBOX_CONFIG,
  type InboxConfig,
  type QuietHours,
  parseQuietHours,
} from '../foundation/config-inbox.js';
import type { OsqConfig } from '../foundation/config.js';
import { PACKAGE_ROOT } from '../foundation/package-root.js';

/** The part of a spawned sound player that `notify` needs. */
export interface InboxSoundChild {
  on(event: 'error', listener: (error: Error) => void): unknown;
  unref(): void;
}

/**
 * Injectable seams for `createInboxSound`. Production keeps every default;
 * tests pass fakes so no test makes a sound.
 */
export interface InboxSoundDeps {
  /** The platform whose player is looked up. */
  readonly platform: NodeJS.Platform;
  /** The `PATH` value the player lookup reads. */
  readonly path: string;
  /** Spawns the player detached, with output ignored. */
  readonly spawn: (command: string, args: readonly string[]) => InboxSoundChild;
  /** Writes the terminal bell to stdout. */
  readonly bell: () => void;
  /** Writes one warning line to stderr. */
  readonly warn: (message: string) => void;
  /** Reports whether a sound file exists. */
  readonly exists: (file: string) => boolean;
}

/** Plays one sound for a batch of new inbox items. */
export interface InboxSound {
  notify(now: Date): void;
}

const DEFAULT_SOUND_FILE = path.join(PACKAGE_ROOT, 'sounds', 'inbox.wav');
const BELL = '\u0007';
const DARWIN_PLAYERS: readonly string[] = ['afplay'];
const LINUX_PLAYERS: readonly string[] = ['pw-play', 'paplay', 'aplay'];

/** What one `notify` call can do, resolved once when the sound is built. */
type SoundPlan =
  | { readonly kind: 'off' }
  | { readonly kind: 'bell' }
  | { readonly kind: 'play'; readonly file: string; readonly player: string };

function defaultSpawn(command: string, args: readonly string[]): InboxSoundChild {
  return nodeSpawn(command, [...args], { stdio: 'ignore', detached: true });
}

function defaultBell(): void {
  process.stdout.write(BELL);
}

function defaultWarn(message: string): void {
  process.stderr.write(`${message}\n`);
}

function defaultExists(file: string): boolean {
  return fs.existsSync(file);
}

/** Fill every missing seam with its real implementation. */
function withDefaults(deps: Partial<InboxSoundDeps>): InboxSoundDeps {
  return {
    platform: deps.platform ?? process.platform,
    path: deps.path ?? process.env.PATH ?? '',
    spawn: deps.spawn ?? defaultSpawn,
    bell: deps.bell ?? defaultBell,
    warn: deps.warn ?? defaultWarn,
    exists: deps.exists ?? defaultExists,
  };
}

/** The player names to try on `platform`, in order. Other platforms have none. */
function playersFor(platform: NodeJS.Platform): readonly string[] {
  if (platform === 'darwin') return DARWIN_PLAYERS;
  if (platform === 'linux') return LINUX_PLAYERS;
  return [];
}

/** True when `file` is a regular file with an execute bit set. */
function isExecutableFile(file: string): boolean {
  try {
    const stat = fs.statSync(file);
    return stat.isFile() && (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/** True when an executable file named `command` sits in a `PATH` directory. */
function inPath(command: string, pathValue: string): boolean {
  for (const dir of pathValue.split(path.delimiter)) {
    if (dir === '') continue;
    if (isExecutableFile(path.join(dir, command))) return true;
  }
  return false;
}

/** The first player on `platform` that is an executable file in `PATH`. */
function findPlayer(platform: NodeJS.Platform, pathValue: string): string | null {
  for (const player of playersFor(platform)) {
    if (inPath(player, pathValue)) return player;
  }
  return null;
}

/** Resolve the configured sound to a plan, warning once for a missing file. */
function resolvePlan(projectRoot: string, inbox: InboxConfig, deps: InboxSoundDeps): SoundPlan {
  if (inbox.sound === 'off') return { kind: 'off' };
  if (inbox.sound === 'bell') return { kind: 'bell' };
  const file =
    inbox.sound === 'default' ? DEFAULT_SOUND_FILE : path.resolve(projectRoot, inbox.sound);
  if (!deps.exists(file)) {
    deps.warn(`osq inbox: inbox.sound: ${file} does not exist; using the bell`);
    return { kind: 'bell' };
  }
  const player = findPlayer(deps.platform, deps.path);
  if (player === null) return { kind: 'bell' };
  return { kind: 'play', file, player };
}

/** Spawn the player without waiting; ring the bell when the spawn fails. */
function play(file: string, player: string, deps: InboxSoundDeps): void {
  try {
    const child = deps.spawn(player, [file]);
    child.on('error', () => deps.bell());
    child.unref();
  } catch {
    deps.bell();
  }
}

/** True when `now`, in local time, falls in `quiet` (start inclusive, end exclusive). */
function withinQuietHours(quiet: QuietHours, now: Date): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (quiet.start < quiet.end) return minutes >= quiet.start && minutes < quiet.end;
  return minutes >= quiet.start || minutes < quiet.end;
}

/**
 * Build a sound for `config.inbox`. The player and the file are resolved once,
 * so a missing file warns once and a per-window timestamp keeps `notify` quiet.
 */
export function createInboxSound(
  projectRoot: string,
  config: OsqConfig,
  deps: Partial<InboxSoundDeps> = {},
): InboxSound {
  const seams = withDefaults(deps);
  const inbox = config.inbox ?? DEFAULT_INBOX_CONFIG;
  const plan = resolvePlan(projectRoot, inbox, seams);
  const quiet = inbox.quietHours === null ? null : parseQuietHours(inbox.quietHours);
  const windowMs = inbox.soundWindowSeconds * 1000;
  let lastPlayed: number | null = null;

  return {
    notify(now: Date): void {
      if (plan.kind === 'off') return;
      if (quiet !== null && withinQuietHours(quiet, now)) return;
      const at = now.getTime();
      if (lastPlayed !== null && at - lastPlayed < windowMs) return;
      lastPlayed = at;
      if (plan.kind === 'bell') {
        seams.bell();
        return;
      }
      play(plan.file, plan.player, seams);
    },
  };
}
