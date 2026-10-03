import type { CardInput } from '../core/status/dispatch-session.js';
import { type Writer, processStdout } from './command-inputs.js';

/** The readable stream `createTerminalInput` reads keys and lines from. */
export type TerminalStream = NodeJS.ReadableStream & {
  setRawMode?(mode: boolean): unknown;
};

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
        stream.pause();
        resolve(value);
      }
      stream.on('data', onData);
      stream.on('end', onEnd);
      stream.on('close', onEnd);
      stream.resume();
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
        stream.pause();
        resolve(value);
      }
      stream.on('data', onData);
      stream.on('end', onEnd);
      stream.on('close', onEnd);
      stream.resume();
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
