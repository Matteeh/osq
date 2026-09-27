import os from 'node:os';
import type { OsqConfig } from '../foundation/config.js';
import { readDispatchCard } from './dispatch-cards.js';
import { readDispatchItems } from './dispatch-items.js';
import { type CardKey, type CardKeys, cardKeys, formatCardScreen } from './dispatch-keys.js';
import {
  type FirstSeenTimes,
  type OrderedDispatchItem,
  orderDispatchItems,
} from './dispatch-order.js';
import { applySetAsides } from './dispatch-set-aside.js';
import { type DispatchWatch, type WatchDispatchOptions, watchDispatch } from './dispatch-watch.js';
import type { InboxSound } from './inbox-sound.js';
import { dispatchIdentity, firstSeenTimes, readWaitLog } from './wait-log.js';
import type { WaitRecorder } from './wait-recorder.js';

/** One key read and one line read from the terminal. */
export interface CardInput {
  /** Reads a single key, or resolves null at end of input. */
  key(): Promise<string | null>;
  /** Writes `question` and reads one line, or resolves null at end of input. */
  line(question: string): Promise<string | null>;
}

/** Runs one osq command with the given arguments; resolves with its exit code. */
export type Launcher = (args: readonly string[]) => Promise<number>;

/** Injectable seams for `runCardSession`. */
export interface CardSessionOptions extends WatchDispatchOptions {
  readonly input: CardInput;
  readonly launch: Launcher;
  readonly sound?: InboxSound;
  readonly stdout?: (message: string) => void;
  readonly signal?: AbortSignal;
  readonly recorder?: WaitRecorder;
}

const WAITING = 'Nothing needs you. Waiting for new items (q to quit).\n';

/** True when the key ends the session. */
function endsSession(key: string | null): boolean {
  return key === 'q' || key === '\u0003' || key === null;
}

/** One interactive inbox card session, driven by scripted terminal input. */
class CardSession {
  private readonly out: (message: string) => void;
  private readonly input: CardInput;
  private readonly launch: Launcher;
  private readonly sound: InboxSound;
  private readonly signal: AbortSignal | undefined;
  private readonly recorder: WaitRecorder | undefined;
  private readonly home: string;
  private readonly clock: () => Date;
  private readonly setAside: string[] = [];
  private lastIdle = false;
  private readonly abort: Promise<void>;
  private onAbort: (() => void) | null = null;
  private pending: Promise<string | null> | null = null;
  private watch: DispatchWatch | null = null;
  private arrive: (() => void) | null = null;
  private arrived: Promise<void> | null = null;
  private waiting = false;
  private quit = false;

  constructor(
    private readonly projectRoot: string,
    private readonly config: OsqConfig,
    private readonly options: CardSessionOptions,
  ) {
    this.out = options.stdout ?? ((message) => process.stdout.write(message));
    this.input = options.input;
    this.launch = options.launch;
    this.sound = options.sound ?? { notify: () => undefined };
    this.signal = options.signal;
    this.recorder = options.recorder;
    this.home = options.home ?? os.homedir();
    this.clock = options.now ?? (() => new Date());
    this.abort = new Promise<void>((resolve) => {
      if (this.signal === undefined) return;
      if (this.signal.aborted) {
        resolve();
        return;
      }
      this.onAbort = () => resolve();
      this.signal.addEventListener('abort', this.onAbort, { once: true });
    });
  }

  /** The one pending key read; a second call reuses it. */
  private key(): Promise<string | null> {
    this.pending ??= this.input.key();
    return this.pending;
  }

  /** Read one key, or set `quit` when the signal aborts first. */
  private async nextKey(): Promise<string | null> {
    const result = await Promise.race([
      this.key().then((value) => ({ kind: 'key' as const, value })),
      this.abort.then(() => ({ kind: 'abort' as const })),
    ]);
    if (result.kind === 'abort') {
      this.quit = true;
      return null;
    }
    this.pending = null;
    return result.value;
  }

  /** The ordered items, set-aside ones moved behind the rest. */
  private async derive(): Promise<OrderedDispatchItem[]> {
    const at = this.clock();
    const dispatch = await readDispatchItems(this.projectRoot, this.config);
    const records = await readWaitLog(this.projectRoot, this.home);
    const firstSeen: FirstSeenTimes =
      records === null ? new Map<string, Date>() : firstSeenTimes(records);
    const ordered = await orderDispatchItems(this.projectRoot, this.config, dispatch, firstSeen);
    const items = applySetAsides(ordered, this.setAside);
    this.lastIdle = dispatch.watcherIdle;
    void this.recorder?.observe(items, dispatch.watcherIdle, at);
    return items;
  }

  /** Close the watch and ring once when the first item arrives. */
  private onItems = (items: readonly OrderedDispatchItem[], at: Date, idle: boolean): void => {
    this.lastIdle = idle;
    void this.recorder?.observe(applySetAsides(items, this.setAside), idle, at);
    if (this.arrive === null || items.length === 0) return;
    const resolve = this.arrive;
    this.arrive = null;
    this.arrived = null;
    const closing = this.watch;
    this.watch = null;
    void closing?.close();
    this.sound.notify(at);
    resolve();
  };

  /** Start the wait watch once; later calls reuse the same arrival. */
  private ensureWatch(): Promise<void> {
    if (this.arrived !== null) return this.arrived;
    this.arrived = new Promise<void>((resolve) => {
      this.arrive = resolve;
    });
    this.watch = watchDispatch(this.projectRoot, this.config, this.options, this.onItems);
    return this.arrived;
  }

  /** Print the waiting line once, then wait for a key or the first item. */
  private async waitForItems(): Promise<void> {
    if (!this.waiting) {
      this.waiting = true;
      this.out(WAITING);
    }
    const result = await Promise.race([
      this.key().then((value) => ({ kind: 'key' as const, value })),
      this.ensureWatch().then(() => ({ kind: 'items' as const })),
      this.abort.then(() => ({ kind: 'abort' as const })),
    ]);
    if (result.kind === 'abort') {
      this.quit = true;
      return;
    }
    if (result.kind === 'items') return;
    this.pending = null;
    if (endsSession(result.value)) this.quit = true;
  }

  /** Run one chosen key: ask for a reason first when it needs one. */
  private async runKey(key: CardKey): Promise<void> {
    let args = [...key.args];
    if (key.asks === 'reason') {
      const reason = await this.input.line('Reason: ');
      if (reason === null || reason === '') return;
      args = [...args, reason];
    }
    this.out(`── ${key.label} ──\n`);
    const code = await this.launch(args);
    this.out(`── exit ${code} ──\n`);
  }

  /** Move one item behind the others for the rest of the session. */
  private skip(item: OrderedDispatchItem): void {
    const id = dispatchIdentity(item);
    const at = this.setAside.indexOf(id);
    if (at !== -1) this.setAside.splice(at, 1);
    this.setAside.push(id);
  }

  /** Print the first card and act on one key. */
  private async showCard(items: readonly OrderedDispatchItem[]): Promise<void> {
    const first = items[0];
    if (first === undefined) return;
    const keys: CardKeys = cardKeys(first);
    const card = await readDispatchCard(this.projectRoot, this.config, first);
    this.out(`${formatCardScreen(items.length, first, card, keys)}\n`);
    void this.recorder?.opened(first, this.lastIdle, this.clock());
    const value = await this.nextKey();
    if (this.quit) return;
    if (endsSession(value)) {
      this.quit = true;
      return;
    }
    if (value === 'n') {
      this.skip(first);
      return;
    }
    const chosen = keys.keys.find((key) => key.key === value);
    if (chosen !== undefined) await this.runKey(chosen);
  }

  /** Run until the reviewer quits, then release the watch and the signal. */
  async run(): Promise<void> {
    try {
      while (!this.quit) {
        const items = await this.derive();
        if (items.length === 0) await this.waitForItems();
        else {
          this.waiting = false;
          await this.showCard(items);
        }
      }
    } finally {
      if (this.signal !== undefined && this.onAbort !== null) {
        this.signal.removeEventListener('abort', this.onAbort);
      }
      const closing = this.watch;
      this.watch = null;
      await closing?.close();
      await this.recorder?.stop(this.clock());
    }
  }
}

/**
 * Run the interactive card session: show the first item's card, run a command
 * per key, and refresh the queue after every key until the reviewer quits.
 */
export function runCardSession(
  projectRoot: string,
  config: OsqConfig,
  options: CardSessionOptions,
): Promise<void> {
  return new CardSession(projectRoot, config, options).run();
}
