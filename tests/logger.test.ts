import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';
import { type LogLevel, createLogger } from '../src/core/logger.js';

interface CapturedOutput {
  stderr: string;
  stdout: string;
}

function captureOutput(fn: () => void): CapturedOutput {
  const originalStderrWrite = process.stderr.write;
  const originalStdoutWrite = process.stdout.write;
  let stderr = '';
  let stdout = '';

  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stderr.write;

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stdout.write;

  try {
    fn();
  } finally {
    process.stderr.write = originalStderrWrite;
    process.stdout.write = originalStdoutWrite;
  }

  return { stderr, stdout };
}

describe('createLogger', () => {
  it('exports createLogger and accepts a LogLevel', () => {
    assert.equal(typeof createLogger, 'function');
    const level: LogLevel = 'normal';
    assert.ok(createLogger(level, 'osq'));
  });

  it('writes exclusively to process.stderr with a bracketed prefix', () => {
    const logger = createLogger('normal', 'osq');
    const { stderr, stdout } = captureOutput(() => {
      logger.info('hello world');
    });

    assert.equal(stderr, '[osq] hello world\n');
    assert.equal(stdout, '');
  });

  it('writes without a prefix when none is supplied', () => {
    const logger = createLogger('normal');
    const { stderr } = captureOutput(() => {
      logger.info('plain message');
    });

    assert.equal(stderr, 'plain message\n');
  });

  it('prefixes every line of a multi-line message', () => {
    const logger = createLogger('normal', 'osq');
    const { stderr } = captureOutput(() => {
      logger.info('first\nsecond');
    });

    assert.equal(stderr, '[osq] first\n[osq] second\n');
  });

  it('quiet level suppresses info and verbose messages but writes warn and error', () => {
    const logger = createLogger('quiet', 'osq');
    const { stderr } = captureOutput(() => {
      logger.info('info');
      logger.verbose('verbose');
      logger.warn('warn');
      logger.error('error');
    });

    assert.equal(stderr, '[osq] warn\n[osq] error\n');
  });

  it('normal level outputs info, warn, and error while suppressing verbose', () => {
    const logger = createLogger('normal', 'osq');
    const { stderr } = captureOutput(() => {
      logger.info('info');
      logger.verbose('verbose');
      logger.warn('warn');
      logger.error('error');
    });

    assert.equal(stderr, '[osq] info\n[osq] warn\n[osq] error\n');
  });

  it('verbose level outputs info, verbose, warn, and error', () => {
    const logger = createLogger('verbose', 'osq');
    const { stderr } = captureOutput(() => {
      logger.info('info');
      logger.verbose('verbose');
      logger.warn('warn');
      logger.error('error');
    });

    assert.equal(stderr, '[osq] info\n[osq] verbose\n[osq] warn\n[osq] error\n');
  });
});

describe('watch command verbosity options', () => {
  it('registers --verbose and -q/--quiet options on watch', () => {
    const program = createProgram();
    const watchCmd = program.commands.find((cmd) => cmd.name() === 'watch');

    assert.ok(watchCmd);
    const verboseOption = watchCmd.options.find((o) => o.long === '--verbose');
    const quietOption = watchCmd.options.find((o) => o.long === '--quiet');
    assert.ok(verboseOption);
    assert.ok(quietOption);
    assert.equal(quietOption.short, '-q');
  });

  it('parses --verbose and --quiet into the watch command options', () => {
    const program = createProgram();
    const watchCmd = program.commands.find((cmd) => cmd.name() === 'watch');
    assert.ok(watchCmd);

    watchCmd.parseOptions(['--verbose', '--once']);
    assert.equal(watchCmd.opts().verbose, true);
    assert.equal(watchCmd.opts().quiet, undefined);

    const second = createProgram();
    const quietCmd = second.commands.find((cmd) => cmd.name() === 'watch');
    assert.ok(quietCmd);
    quietCmd.parseOptions(['--quiet']);
    assert.equal(quietCmd.opts().quiet, true);
    assert.equal(quietCmd.opts().verbose, undefined);
  });
});
