import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createLogger } from '../src/core/logger.js';

const CLEAR = '\r\x1b[2K';
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

class FakeStream extends Writable {
  isTTY: boolean;
  private chunks: string[] = [];

  constructor(isTTY: boolean) {
    super();
    this.isTTY = isTTY;
  }

  _write(
    chunk: string | Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    callback();
  }

  get output(): string {
    return this.chunks.join('');
  }

  reset(): void {
    this.chunks = [];
  }
}

interface FakeHandle {
  id: number;
  unref(): FakeHandle;
  ref(): FakeHandle;
}

interface FakeInterval {
  callback: () => void;
  delay: number;
  unrefCalled: boolean;
}

interface FakeTimers {
  intervals: Map<number, FakeInterval>;
  tick(): void;
  restore(): void;
}

function installFakeTimers(): FakeTimers {
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  const intervals = new Map<number, FakeInterval>();
  let nextId = 1;

  globalThis.setInterval = ((callback: () => void, delay?: number): FakeHandle => {
    const id = nextId++;
    const interval: FakeInterval = { callback, delay: delay ?? 0, unrefCalled: false };
    intervals.set(id, interval);
    const handle: FakeHandle = {
      id,
      unref() {
        interval.unrefCalled = true;
        return handle;
      },
      ref() {
        return handle;
      },
    };
    return handle;
  }) as unknown as typeof setInterval;

  globalThis.clearInterval = ((handle: FakeHandle): void => {
    intervals.delete(handle.id);
  }) as unknown as typeof clearInterval;

  return {
    intervals,
    tick() {
      for (const interval of [...intervals.values()]) interval.callback();
    },
    restore() {
      globalThis.setInterval = realSetInterval;
      globalThis.clearInterval = realClearInterval;
    },
  };
}

const originalCI = process.env.CI;
let activeTimers: FakeTimers | null = null;

function setCI(value: string | undefined): void {
  if (value === undefined) Reflect.deleteProperty(process.env, 'CI');
  else process.env.CI = value;
}

beforeEach(() => {
  setCI(undefined);
});

afterEach(() => {
  activeTimers?.restore();
  activeTimers = null;
  setCI(originalCI);
});

function useFakeTimers(): FakeTimers {
  activeTimers = installFakeTimers();
  return activeTimers;
}

describe('logger status interface', () => {
  it('exposes status(text) and clearStatus()', () => {
    const logger = createLogger('normal');
    assert.equal(typeof logger.status, 'function');
    assert.equal(typeof logger.clearStatus, 'function');
  });
});

describe('logger status on an interactive TTY sink', () => {
  it('clears the status row, writes the log line, and redraws status below', () => {
    const stream = new FakeStream(true);
    const logger = createLogger('normal', 'osq', { stream });

    logger.status('running task 1');
    assert.equal(stream.output, `${CLEAR}${FRAMES[0]} [osq] running task 1`);

    stream.reset();
    logger.info('milestone reached');
    assert.equal(
      stream.output,
      `${CLEAR}[osq] milestone reached\n${CLEAR}${FRAMES[0]} [osq] running task 1`,
    );
  });

  it('prefixes every line of a multi-line log and redraws once below', () => {
    const stream = new FakeStream(true);
    const logger = createLogger('normal', 'osq', { stream });

    logger.status('busy');
    stream.reset();
    logger.warn('first\nsecond');
    assert.equal(
      stream.output,
      `${CLEAR}[osq] first\n[osq] second\n${CLEAR}${FRAMES[0]} [osq] busy`,
    );
  });

  it("starts an unref'd 80ms interval that advances spinner frames", () => {
    const stream = new FakeStream(true);
    const timers = useFakeTimers();
    const logger = createLogger('normal', 'osq', { stream });

    logger.status('working');
    const intervals = [...timers.intervals.values()];
    assert.equal(intervals.length, 1);
    const interval = intervals[0];
    assert.ok(interval);
    assert.equal(interval.delay, 80);
    assert.equal(interval.unrefCalled, true);

    stream.reset();
    timers.tick();
    assert.equal(stream.output, `${CLEAR}${FRAMES[1]} [osq] working`);

    stream.reset();
    timers.tick();
    assert.equal(stream.output, `${CLEAR}${FRAMES[2]} [osq] working`);
  });

  it('does not disturb the status row when a message is suppressed by level', () => {
    const stream = new FakeStream(true);
    const timers = useFakeTimers();
    const logger = createLogger('normal', 'osq', { stream });

    logger.status('working');
    stream.reset();
    logger.verbose('hidden');
    assert.equal(stream.output, '');
    assert.equal(timers.intervals.size, 1);

    logger.clearStatus();
    assert.equal(timers.intervals.size, 0);
  });

  it('clearStatus() clears the active row and stops the animation timer', () => {
    const stream = new FakeStream(true);
    const timers = useFakeTimers();
    const logger = createLogger('normal', 'osq', { stream });

    logger.status('working');
    stream.reset();
    logger.clearStatus();
    assert.equal(stream.output, CLEAR);
    assert.equal(timers.intervals.size, 0);

    stream.reset();
    timers.tick();
    assert.equal(stream.output, '');

    logger.info('after clear');
    assert.equal(stream.output, '[osq] after clear\n');
  });

  it('honours the isTTY option override for a non-TTY stream', () => {
    const stream = new FakeStream(false);
    const timers = useFakeTimers();
    const logger = createLogger('normal', 'osq', { stream, isTTY: true });

    logger.status('forced');
    assert.equal(stream.output, `${CLEAR}${FRAMES[0]} [osq] forced`);
    assert.equal(timers.intervals.size, 1);

    logger.clearStatus();
    assert.equal(timers.intervals.size, 0);
  });
});

describe('logger status in non-interactive sinks', () => {
  it('is a no-op when isTTY is false and renders no escape sequences', () => {
    const stream = new FakeStream(false);
    const logger = createLogger('normal', 'osq', { stream });

    logger.status('nope');
    logger.clearStatus();
    assert.equal(stream.output, '');

    logger.info('plain');
    assert.equal(stream.output, '[osq] plain\n');
  });

  it('is a no-op when process.env.CI is set, even on a TTY', () => {
    process.env.CI = '1';
    const stream = new FakeStream(true);
    const logger = createLogger('normal', 'osq', { stream });

    logger.status('nope');
    logger.clearStatus();
    assert.equal(stream.output, '');

    logger.info('plain');
    assert.equal(stream.output, '[osq] plain\n');
  });

  it('is a no-op at quiet level, even on a TTY', () => {
    const stream = new FakeStream(true);
    const logger = createLogger('quiet', 'osq', { stream });

    logger.status('quiet');
    logger.clearStatus();
    assert.equal(stream.output, '');
  });
});
