import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DispatchItem } from './dispatch-items.js';
import {
  type WaitItem,
  type WaitMode,
  type WaitRecord,
  dispatchIdentity,
  readWaitLog,
  resolveWaitLogPath,
  waitEpisodes,
} from './wait-log.js';

/** The home to write under and where one append failure is reported. */
export interface WaitRecorderOptions {
  readonly home?: string;
  readonly stderr?: (message: string) => void;
}

/**
 * The recorder `osq inbox`'s card session and `--follow` use. Records land in
 * call order; no method rejects, and a first append failure reports once.
 */
export interface WaitRecorder {
  observe(items: readonly DispatchItem[], idle: boolean, at: Date): Promise<void>;
  opened(item: DispatchItem, idle: boolean, at: Date): Promise<void>;
  stop(at: Date): Promise<void>;
}

/** The log form of a dispatch item: change folder and task number. */
function toWaitItem(item: DispatchItem): WaitItem {
  return { kind: item.kind, change: item.change.folder, task: item.task?.number ?? null };
}

/** The message of a thrown value, for the one stderr report. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One run's writer: fold the log, then append records in call order. */
class RecorderWriter implements WaitRecorder {
  private session: string | null = null;
  private previous: readonly WaitItem[] = [];
  private previousIds: readonly string[] = [];
  private lastTop: { identity: string | null; idle: boolean } | null = null;
  private started = false;
  private reported = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly projectRoot: string,
    private readonly mode: WaitMode,
    private readonly home: string,
    private readonly stderr: (message: string) => void,
  ) {}

  private async append(record: WaitRecord): Promise<void> {
    const logPath = await resolveWaitLogPath(this.projectRoot, this.home);
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.appendFile(logPath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  /** Chain `task` after earlier work; report the first failure once. */
  private run(task: () => Promise<void>): Promise<void> {
    const next = this.queue.then(task).catch((error: unknown) => {
      if (this.reported) return;
      this.reported = true;
      this.stderr(`osq inbox: wait log: ${messageOf(error)}`);
    });
    this.queue = next;
    return next;
  }

  /** The first observe: mark the open runs and the items no run has seen. */
  private async firstObserve(items: readonly WaitItem[], idle: boolean, at: Date): Promise<void> {
    const session = `${process.pid}-${at.getTime()}`;
    this.session = session;
    this.started = true;
    const iso = at.toISOString();
    await this.append({ type: 'start', mode: this.mode, at: iso, session, idle });
    const records = (await readWaitLog(this.projectRoot, this.home)) ?? [];
    const openEpisodes = waitEpisodes(records).filter((episode) => episode.gone === null);
    const present = new Set(items.map(dispatchIdentity));
    for (const episode of openEpisodes) {
      if (present.has(dispatchIdentity(episode.item))) continue;
      await this.append({
        type: 'gone',
        item: episode.item,
        idle,
        unobserved: true,
        at: iso,
        session,
      });
    }
    const open = new Set(openEpisodes.map((episode) => dispatchIdentity(episode.item)));
    for (const item of items) {
      if (open.has(dispatchIdentity(item))) continue;
      await this.append({ type: 'seen', item, idle, unobserved: true, at: iso, session });
    }
  }

  /** A later observe: mark items that appeared and items that departed. */
  private async laterObserve(items: readonly WaitItem[], idle: boolean, at: Date): Promise<void> {
    const session = this.session as string;
    const iso = at.toISOString();
    const after = new Set(items.map(dispatchIdentity));
    const before = new Set(this.previousIds);
    for (const item of items) {
      if (before.has(dispatchIdentity(item))) continue;
      await this.append({ type: 'seen', item, idle, unobserved: false, at: iso, session });
    }
    for (const item of this.previous) {
      if (after.has(dispatchIdentity(item))) continue;
      await this.append({ type: 'gone', item, idle, unobserved: false, at: iso, session });
    }
  }

  observe(items: readonly DispatchItem[], idle: boolean, at: Date): Promise<void> {
    const mapped = items.map(toWaitItem);
    return this.run(async () => {
      if (!this.started) {
        await this.firstObserve(mapped, idle, at);
      } else {
        await this.laterObserve(mapped, idle, at);
      }
      this.previous = mapped;
      this.previousIds = mapped.map(dispatchIdentity);
      const first = mapped[0] ?? null;
      const identity = first === null ? null : dispatchIdentity(first);
      if (
        this.lastTop !== null &&
        this.lastTop.identity === identity &&
        this.lastTop.idle === idle
      ) {
        return;
      }
      await this.append({
        type: 'top',
        item: first,
        idle,
        at: at.toISOString(),
        session: this.session as string,
      });
      this.lastTop = { identity, idle };
    });
  }

  opened(item: DispatchItem, idle: boolean, at: Date): Promise<void> {
    return this.run(async () => {
      const session = this.session ?? `${process.pid}-${at.getTime()}`;
      this.session = session;
      await this.append({
        type: 'opened',
        item: toWaitItem(item),
        idle,
        at: at.toISOString(),
        session,
      });
    });
  }

  stop(at: Date): Promise<void> {
    return this.run(async () => {
      if (!this.started || this.session === null) return;
      await this.append({ type: 'stop', at: at.toISOString(), session: this.session });
    });
  }
}

/** Create a writer for one inbox run under `options.home`, reporting once. */
export function createWaitRecorder(
  projectRoot: string,
  mode: WaitMode,
  options: WaitRecorderOptions = {},
): WaitRecorder {
  const home = options.home ?? os.homedir();
  const stderr = options.stderr ?? ((message: string) => process.stderr.write(message));
  return new RecorderWriter(projectRoot, mode, home, stderr);
}
