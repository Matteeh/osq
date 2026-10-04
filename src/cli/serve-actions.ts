import type { OsqConfig } from '../core/foundation/config.js';
import type {
  WebActionRequest,
  WebActionResult,
  WebActionRunner,
  WebActionVerb,
} from '../core/web/web-actions.js';
import { approveCommand } from './approve.js';
import { CommandError } from './command-error.js';
import type { ActionInputs } from './inbox-actions.js';
import { landCommand } from './land.js';
import { rejectCommand } from './reject.js';
import { retryCommand } from './retry.js';

/** A command function for one verb, given the request and this request's inputs. */
export type WebCommand = (request: WebActionRequest, inputs: ActionInputs) => Promise<void>;

/** The reason of a `reject` request; only that verb carries one. */
function rejectReason(request: WebActionRequest): string {
  if (request.verb !== 'reject') throw new Error(`expected a reject request, got ${request.verb}`);
  return request.reason;
}

/** The target of a `retry` request; only that verb carries one. */
function retryTarget(request: WebActionRequest): string {
  if (request.verb !== 'retry') throw new Error(`expected a retry request, got ${request.verb}`);
  return request.target;
}

/** The default table: one verb to the command function the CLI runs. */
const DEFAULT_COMMANDS: Readonly<Record<WebActionVerb, WebCommand>> = {
  approve: (request, inputs) => approveCommand([request.change], inputs),
  land: (request, inputs) => landCommand(request.change, inputs),
  reject: (request, inputs) =>
    rejectCommand(request.change, { ...inputs, reason: rejectReason(request) }),
  retry: (request, inputs) => retryCommand(request.change, retryTarget(request), inputs),
};

/** Turn a thrown `CommandError` or any other value into the runner's result. */
function failureResult(error: unknown, stdout: string, stderr: string): WebActionResult {
  if (error instanceof CommandError) {
    return {
      exitCode: error.exitCode,
      stdout,
      stderr,
      error: { message: error.message, next: error.next ?? null },
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { exitCode: 1, stdout, stderr, error: { message: `Error: ${message}`, next: null } };
}

/** Build the runner `osq serve` passes to `startWebServer`. */
export function createWebActionRunner(
  inputs: { readonly cwd: string; readonly config: OsqConfig },
  commands: Readonly<Record<WebActionVerb, WebCommand>> = DEFAULT_COMMANDS,
): WebActionRunner {
  return async (request) => {
    const out: string[] = [];
    const err: string[] = [];
    const actionInputs: ActionInputs = {
      cwd: inputs.cwd,
      config: inputs.config,
      stdout: (text) => out.push(text),
      stderr: (text) => err.push(text),
    };
    try {
      await commands[request.verb](request, actionInputs);
      return { exitCode: 0, stdout: out.join(''), stderr: err.join(''), error: null };
    } catch (error) {
      return failureResult(error, out.join(''), err.join(''));
    }
  };
}
