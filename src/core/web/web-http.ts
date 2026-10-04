import type { ServerResponse } from 'node:http';

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value === null || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) sorted[key] = sortKeysDeep(source[key]);
  return sorted;
}

/** Deterministic UTF-8 JSON shared by every API document. */
export function serializeWebJson(data: unknown): string {
  return JSON.stringify(sortKeysDeep(data));
}

/** Decode a change selector once, rejecting separators, traversal, and bad escapes. */
export function decodeChangeSelector(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded.length === 0 || decoded.includes('\0')) return null;
  if (decoded.includes('/') || decoded.includes('\\')) return null;
  if (decoded === '.' || decoded === '..') return null;
  return decoded;
}

export function send(
  res: ServerResponse,
  status: number,
  body: Buffer,
  contentType: string,
  cache: string,
  head: boolean,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': body.byteLength,
    'Cache-Control': cache,
    ...headers,
  });
  if (head) res.end();
  else res.end(body);
}

export function sendJson(
  res: ServerResponse,
  status: number,
  data: unknown,
  head: boolean,
  headers: Record<string, string> = {},
): void {
  const body = Buffer.from(serializeWebJson(data), 'utf8');
  send(res, status, body, 'application/json; charset=utf-8', 'no-store', head, headers);
}

export function sendFailure(res: ServerResponse, error: unknown, head = false): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) }, head);
}
