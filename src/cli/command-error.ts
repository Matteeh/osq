/**
 * A command failure that `runCli` prints and turns into an exit code without
 * ending the process. The message is exactly the text the command would have
 * printed to stderr; `next` is an optional step `runCli` prints after it.
 */
export class CommandError extends Error {
  readonly exitCode: number;
  readonly next: string | undefined;

  constructor(message: string, options: { exitCode?: number; next?: string } = {}) {
    super(message);
    this.name = 'CommandError';
    this.exitCode = options.exitCode ?? 1;
    this.next = options.next;
  }
}
