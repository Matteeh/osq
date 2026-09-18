export type LogLevel = 'quiet' | 'normal' | 'verbose';

export interface Logger {
  info(msg: string): void;
  verbose(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
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

export function createLogger(level: LogLevel, prefix?: string): Logger {
  const maxRank = LEVEL_RANK[level];

  const write = (messageLevel: MessageLevel, msg: string): void => {
    if (MESSAGE_RANK[messageLevel] > maxRank) return;

    const lines = msg.split('\n');
    const rendered = lines.map((line) => (prefix ? `[${prefix}] ${line}` : line)).join('\n');
    process.stderr.write(rendered.endsWith('\n') ? rendered : `${rendered}\n`);
  };

  return {
    info: (msg: string) => write('info', msg),
    verbose: (msg: string) => write('verbose', msg),
    warn: (msg: string) => write('warn', msg),
    error: (msg: string) => write('error', msg),
  };
}
