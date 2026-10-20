/** In-process change lanes: one running task per change folder, capped by config. */

/** One finished lane's contribution to the watcher summary. */
export interface LaneOutcome {
  readonly tasksRun: number;
  readonly specsArchived: number;
  readonly blockedByRegression: readonly BlockedByRegression[];
}

/** A change whose pre-dispatch scope audit found newly stale tasks. */
export interface BlockedByRegression {
  readonly id: string;
  readonly outcome: 'blocked_by_regression';
  readonly tasks: readonly string[];
}

/** A lane body: it resolves with what it did and never rejects for a logged error. */
export type LaneBody = () => Promise<LaneOutcome>;

/** A kept lane error, boxed so `throw undefined` is still visible. */
interface KeptError {
  readonly value: unknown;
}

/**
 * The watcher's change lanes, keyed by change folder path. Promises are kept
 * only so the watcher can wait for them; what runs stays on disk as the running
 * locks. A lane body's error is kept for the watcher to rethrow; the promise
 * itself never rejects, so nothing is left unhandled.
 *
 * @scenario watcher-and-harness: Two independent changes at once
 * @scenario watcher-and-harness: The cap holds
 * @scenario watcher-and-harness: Lanes outlive a cycle
 * @adr 012
 */
export class ChangeLanes {
  private readonly cap: number;
  private readonly running = new Map<string, Promise<void>>();
  private readonly spawned = new Set<string>();
  private readonly outcomes: LaneOutcome[] = [];
  private keptError: KeptError | undefined;
  private closed = false;
  private readonly onIdle?: () => void;

  constructor(cap: number, onIdle?: () => void) {
    this.cap = Math.max(1, Math.floor(Number.isFinite(cap) ? cap : 1));
    this.onIdle = onIdle;
  }

  /** Whether `folderPath`'s lane is running right now. */
  isRunning(folderPath: string): boolean {
    return this.running.has(folderPath);
  }

  /** How many lanes run right now. */
  count(): number {
    return this.running.size;
  }

  /** Record that this lane's task has reached the adapter's spawn. */
  markSpawned(folderPath: string): void {
    if (this.running.has(folderPath)) this.spawned.add(folderPath);
  }

  /** Whether every running lane has already spawned its task, or none runs. */
  allSpawned(): boolean {
    for (const folderPath of this.running.keys()) {
      if (!this.spawned.has(folderPath)) return false;
    }
    return true;
  }

  /** Whether stopping closed the lanes, so no new one may start. */
  isClosed(): boolean {
    return this.closed;
  }

  /** Stop accepting new lanes; running ones finish as before. */
  close(): void {
    this.closed = true;
  }

  /**
   * Start a lane for `folderPath` unless one already runs there. The body's
   * outcome is queued for {@link takeOutcomes}; its first error is kept for
   * {@link takeError}.
   */
  start(folderPath: string, body: LaneBody): void {
    if (this.running.has(folderPath)) return;
    this.spawned.delete(folderPath);
    const lane = (async (): Promise<void> => {
      try {
        this.outcomes.push(await body());
      } catch (err) {
        if (this.keptError === undefined) this.keptError = { value: err };
      }
    })().finally(() => {
      this.running.delete(folderPath);
      this.spawned.delete(folderPath);
      if (this.running.size === 0) this.onIdle?.();
    });
    this.running.set(folderPath, lane);
  }

  /** Wait until fewer than the cap run, so the next lane may start. */
  async waitForSlot(): Promise<void> {
    while (this.running.size >= this.cap) {
      await Promise.race(this.running.values());
    }
  }

  /** Wait until no lane runs. */
  async waitAll(): Promise<void> {
    while (this.running.size > 0) {
      await Promise.all(this.running.values());
    }
  }

  /** Drain the outcomes of finished lanes. */
  takeOutcomes(): LaneOutcome[] {
    return this.outcomes.splice(0);
  }

  /** Take the first error a lane ended with, for the watcher to rethrow. */
  takeError(): KeptError | undefined {
    const error = this.keptError;
    this.keptError = undefined;
    return error;
  }
}
