import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { CardInput, Launcher } from '../core/status/dispatch-session.js';
import { type Writer, processStdout } from './command-inputs.js';

/** The readable stream `createTerminalInput` reads keys and lines from. */
export type TerminalStream = NodeJS.ReadableStream & {
  setRawMode?(mode: boolean): unknown;
};

/** True when this module runs from TypeScript source rather than the build. */
const IS_TYPESCRIPT = import.meta.url.endsWith('.ts');

function chunkToText(chunk: Buffer | string): string {
  return typeof chunk === 'string' ? chunk : chunk.toString('utf8');
}

/** Turn raw mode on when the stream supports it; a stream without it still works. */
function setRawMode(stream: TerminalStream, mode: boolean): void {
  stream.setRawMode?.(mode);
}

/**
 * Read the terminal one key at a time. Raw mode is on only while a key read is
 * pending; `line` writes the question and reads with raw mode off.
 */
export function createTerminalInput(
  stream: TerminalStream,
  stdout: Writer = processStdout,
): CardInput {
  let buffered = '';

  /** Resolve with the next chunk of input, or null at end of input. */
  function readChunk(): Promise<string | null> {
    return new Promise((resolve) => {
      const onData = (chunk: Buffer | string): void => finish(chunkToText(chunk));
      const onEnd = (): void => finish(null);
      function finish(value: string | null): void {
        stream.off('data', onData);
        stream.off('end', onEnd);
        stream.off('close', onEnd);
        resolve(value);
      }
      stream.on('data', onData);
      stream.on('end', onEnd);
      stream.on('close', onEnd);
    });
  }

  /** Read until a newline, leaving anything after it for the next read. */
  function readLine(): Promise<string | null> {
    return new Promise((resolve) => {
      let text = buffered;
      buffered = '';
      const onData = (chunk: Buffer | string): void => {
        text += chunkToText(chunk);
        const newline = text.indexOf('\n');
        if (newline === -1) return;
        buffered = text.slice(newline + 1);
        finish(text.slice(0, newline).replace(/\r$/, ''));
      };
      const onEnd = (): void => finish(text.length > 0 ? text : null);
      function finish(value: string | null): void {
        stream.off('data', onData);
        stream.off('end', onEnd);
        stream.off('close', onEnd);
        resolve(value);
      }
      stream.on('data', onData);
      stream.on('end', onEnd);
      stream.on('close', onEnd);
    });
  }

  return {
    async key(): Promise<string | null> {
      if (buffered.length > 0) {
        const head = buffered.slice(0, 1);
        buffered = buffered.slice(1);
        return head;
      }
      setRawMode(stream, true);
      try {
        let text = await readChunk();
        while (text === '') text = await readChunk();
        if (text === null) return null;
        buffered = text.slice(1);
        return text.slice(0, 1);
      } finally {
        setRawMode(stream, false);
      }
    },

    async line(question: string): Promise<string | null> {
      stdout(question);
      setRawMode(stream, false);
      return readLine();
    },
  };
}

/** The arguments that run this module's sibling `bin` entry under node. */
function binArguments(): string[] {
  const entry = fileURLToPath(new URL(IS_TYPESCRIPT ? 'bin.ts' : 'bin.js', import.meta.url));
  if (!IS_TYPESCRIPT) return [entry];
  return ['--import', import.meta.resolve('tsx'), entry];
}

/**
 * Spawn osq's own bin with `args`, inheriting the terminal and the project
 * root. Never through a shell. Resolves with the exit code, or 1 when the
 * child ends by a signal or fails to start. SIGINT during the child does not
 * end osq.
 */
export function createChildLauncher(projectRoot: string): Launcher {
  return (args) =>
    new Promise<number>((resolve) => {
      const ignoreSigint = (): void => undefined;
      let settled = false;
      const finish = (code: number): void => {
        if (settled) return;
        settled = true;
        process.off('SIGINT', ignoreSigint);
        resolve(code);
      };
      process.on('SIGINT', ignoreSigint);
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(process.execPath, [...binArguments(), ...args], {
          cwd: projectRoot,
          stdio: 'inherit',
        });
      } catch {
        finish(1);
        return;
      }
      child.on('error', () => finish(1));
      child.on('exit', (code, signal) => finish(signal !== null ? 1 : (code ?? 1)));
    });
}
