import { Writable } from 'node:stream';
import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { type LogLevel, type Logger, createLogger } from '../core/foundation/logger.js';

/** A sink a command prints to, receiving exactly the text to print, newlines included. */
export type Writer = (text: string) => void;

/** The arguments every command function accepts, all optional. */
export interface CommandInputs {
  cwd?: string;
  config?: OsqConfig;
  stdout?: Writer;
  stderr?: Writer;
}

/** A `node:stream` writable that forwards every chunk, as text, to `writer`. */
function writerStream(writer: Writer): NodeJS.WritableStream & { isTTY?: boolean } {
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      writer(chunk.toString());
      callback();
    },
  });
  (stream as { isTTY?: boolean }).isTTY = false;
  return stream;
}

/** The writer to the process stdout stream. */
export const processStdout: Writer = (text) => {
  process.stdout.write(text);
};

/** The writer to the process stderr stream. */
export const processStderr: Writer = (text) => {
  process.stderr.write(text);
};

/**
 * Fill `cwd` and the writers with their process defaults and expose `config()`,
 * which gives the passed config or loads `cwd`'s. A passed value is used as
 * given, so `config()` never loads when the caller passed one.
 */
export function resolveInputs(inputs: CommandInputs): {
  cwd: string;
  stdout: Writer;
  stderr: Writer;
  config(): Promise<OsqConfig>;
} {
  const cwd = inputs.cwd ?? process.cwd();
  return {
    cwd,
    stdout: inputs.stdout ?? processStdout,
    stderr: inputs.stderr ?? processStderr,
    config: async () => inputs.config ?? loadConfig(cwd),
  };
}

/**
 * The `osq` logger at `level`. Without a `stderr` input it is the process
 * logger; with one it writes every rendered line, newline included, to that
 * writer and is never interactive.
 */
export function commandLogger(inputs: CommandInputs, level: LogLevel = 'normal'): Logger {
  if (inputs.stderr === undefined) return createLogger(level, 'osq');
  return createLogger(level, 'osq', { stream: writerStream(inputs.stderr), isTTY: false });
}
