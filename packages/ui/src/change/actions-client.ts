import type { WebActionResult, WebActionsDocument } from '../contracts.js';

/** A `WebActionRequest` without `change`; the client supplies the selector. */
export type WebActionInput =
  | { readonly verb: 'approve'; readonly opened?: readonly string[] }
  | { readonly verb: 'land' }
  | { readonly verb: 'reject'; readonly reason: string }
  | { readonly verb: 'retry'; readonly target: string };

/** The minimal response contract the actions client needs from `fetch`. */
export interface ActionFetchResponse {
  readonly status: number;
  json(): Promise<unknown>;
}

export interface ActionFetchInit {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

export type ActionFetch = (input: string, init?: ActionFetchInit) => Promise<ActionFetchResponse>;

/** The two requests the change view makes for one change. */
export interface ActionClient {
  /** The change's actions, or null when the server reports 404. */
  load(selector: string): Promise<WebActionsDocument | null>;
  /** Post one action; a 409 becomes a result that reports the running action. */
  run(selector: string, token: string, request: WebActionInput): Promise<WebActionResult>;
}

function actionUrl(selector: string): string {
  return `/api/actions/${encodeURIComponent(selector)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDocument(value: unknown): value is WebActionsDocument {
  return (
    isObject(value) &&
    Array.isArray(value.actions) &&
    Array.isArray(value.manual) &&
    typeof value.token === 'string'
  );
}

function isResult(value: unknown): value is WebActionResult {
  return isObject(value) && typeof value.exitCode === 'number';
}

/** A result standing in for the server's 409 "another action is running". */
function runningResult(): WebActionResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: '',
    error: { message: 'another action is running', next: null },
  };
}

function failed(status: number, selector: string): Error {
  return new Error(`action request for ${selector} failed: ${status}`);
}

/**
 * Create the change view's actions client over `fetch`. Loads the actions with
 * `GET /api/actions/<id>` (null on 404) and posts one request with the token.
 */
export function createActionClient(fetch: ActionFetch): ActionClient {
  const send = fetch;
  return {
    async load(selector) {
      const response = await send(actionUrl(selector));
      if (response.status === 404) return null;
      if (response.status < 200 || response.status >= 300) {
        throw failed(response.status, selector);
      }
      const body: unknown = await response.json();
      if (!isDocument(body)) throw new Error(`unexpected actions document for ${selector}`);
      return body;
    },
    async run(selector, token, request) {
      const response = await send(actionUrl(selector), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Osq-Token': token },
        body: JSON.stringify(request),
      });
      if (response.status === 409) return runningResult();
      if (response.status < 200 || response.status >= 300) {
        throw failed(response.status, selector);
      }
      const body: unknown = await response.json();
      if (!isResult(body)) throw new Error(`unexpected action result for ${selector}`);
      return body;
    },
  };
}
