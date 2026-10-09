import type { WebServerStatus } from '../contracts.js';

/** The minimal response contract the status client needs from its transport. */
export interface ServerStatusResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type ServerStatusRequest = (input: string) => Promise<ServerStatusResponse>;

export interface ServerStatusClient {
  /** The server's status document, or null when the request fails. */
  load(base: string): Promise<WebServerStatus | null>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStatus(value: unknown): value is WebServerStatus {
  return (
    isObject(value) &&
    typeof value.name === 'string' &&
    typeof value.project === 'string' &&
    typeof value.path === 'string'
  );
}

/** Create the one client that owns `api/server`; any failure yields null. */
export function createServerStatusClient(request: ServerStatusRequest): ServerStatusClient {
  return {
    async load(base) {
      try {
        const response = await request(`${base}/api/server`);
        if (!response.ok) return null;
        const body: unknown = await response.json();
        return isStatus(body) ? body : null;
      } catch {
        return null;
      }
    },
  };
}
