export type LogLevel = 'quiet' | 'normal' | 'verbose';

export interface Logger {
  info(msg: string): void;
  verbose(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  status(text: string): void;
  clearStatus(): void;
  /** True when the sink is an interactive TTY with animation enabled. */
  readonly interactive?: boolean;
  /** True when unicode status symbols may be used (TTY, no `CI`, no `NO_COLOR`). */
  readonly symbols?: boolean;
}

/**
 * Environment-level check for unicode status symbols. Mirrors the logger's own
 * detection: an interactive stderr, no `CI`, and no `NO_COLOR`.
 */
export function symbolsEnabled(): boolean {
  return process.stderr.isTTY === true && !process.env.CI && process.env.NO_COLOR === undefined;
}

/**
 * Choose between a unicode symbol and its plain-word fallback. Callers that
 * own a logger should pass `logger.symbols` as `enabled` so the choice matches
 * the logger's sink; the default consults the process environment.
 */
export function resolveSymbol(symbol: string, word: string, enabled = symbolsEnabled()): string {
  return enabled ? symbol : word;
}

export interface LoggerOptions {
  stream?: NodeJS.WritableStream & { isTTY?: boolean };
  isTTY?: boolean;
}

type MessageLevel = 'info' | 'verbose' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  quiet: 0,
  normal: 1,
  verbose: 2,
};

const MESSAGE_RANK: Record<MessageLevel, number> = {
  verbose: 2,
  info: 1,
  warn: 0,
  error: 0,
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;
const CLEAR_LINE = '\r\x1b[2K';

export function createLogger(level: LogLevel, prefix?: string, options?: LoggerOptions): Logger {
  const maxRank = LEVEL_RANK[level];
  const stream = options?.stream ?? process.stderr;
  const interactive = (options?.isTTY ?? stream.isTTY) === true;
  const animate = interactive && level !== 'quiet' && !process.env.CI;
  const symbols = animate && process.env.NO_COLOR === undefined;

  let statusText: string | null = null;
  let frameIndex = 0;
  let timer: NodeJS.Timeout | null = null;

  const render = (msg: string): string => {
    const lines = msg.split('\n');
    return lines.map((line) => (prefix ? `[${prefix}] ${line}` : line)).join('\n');
  };

  const writeRaw = (chunk: string): void => {
    stream.write(chunk);
  };

  const redraw = (): void => {
    if (statusText === null) return;
    writeRaw(`${CLEAR_LINE}${SPINNER_FRAMES[frameIndex]} ${statusText}`);
  };

  const startTimer = (): void => {
    if (timer !== null) return;
    timer = setInterval(() => {
      frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
      redraw();
    }, SPINNER_INTERVAL_MS);
    timer.unref();
  };

  const stopTimer = (): void => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };

  const write = (messageLevel: MessageLevel, msg: string): void => {
    if (MESSAGE_RANK[messageLevel] > maxRank) return;

    const rendered = render(msg);
    const line = rendered.endsWith('\n') ? rendered : `${rendered}\n`;

    if (animate && statusText !== null) {
      writeRaw(CLEAR_LINE);
      writeRaw(line);
      redraw();
    } else {
      writeRaw(line);
    }
  };

  return {
    interactive: animate,
    symbols,
    info: (msg: string) => write('info', msg),
    verbose: (msg: string) => write('verbose', msg),
    warn: (msg: string) => write('warn', msg),
    error: (msg: string) => write('error', msg),
    status: (text: string) => {
      if (!animate) return;
      statusText = render(text);
      startTimer();
      redraw();
    },
    clearStatus: () => {
      if (!animate) return;
      if (statusText === null && timer === null) return;
      writeRaw(CLEAR_LINE);
      stopTimer();
      statusText = null;
      frameIndex = 0;
    },
  };
}
