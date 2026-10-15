import type { WebActionRequest } from './web-actions.js';

export type ActionRequestBody =
  | { readonly ok: true; readonly request: WebActionRequest }
  | { readonly ok: false; readonly error: string };

/**
 * Validate one action body, supplying the URL's decoded change selector. A
 * `plan` body MAY carry `notes`, a non-empty string.
 *
 * @scenario web-inspection: Plan action bodies
 * @adr 013
 * @adr 019
 */
export function parseActionRequest(rawBody: string, change: string): ActionRequestBody {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: 'body is not valid JSON' };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'body must be a JSON object' };
  }
  const record = value as Record<string, unknown>;
  const verb = record.verb;
  if (verb === 'approve') {
    const opened = record.opened;
    if (opened === undefined) return { ok: true, request: { verb, change } };
    if (!Array.isArray(opened) || !opened.every((id) => typeof id === 'string')) {
      return { ok: false, error: 'approve opened must be a list of strings' };
    }
    return { ok: true, request: { verb, change, opened } };
  }
  if (verb === 'land') return { ok: true, request: { verb, change } };
  if (verb === 'reject') {
    const reason = record.reason;
    if (typeof reason !== 'string' || reason.length === 0) {
      return { ok: false, error: 'reject requires a non-empty string reason' };
    }
    return { ok: true, request: { verb, change, reason } };
  }
  if (verb === 'retry') {
    const target = record.target;
    if (typeof target !== 'string' || target.length === 0) {
      return { ok: false, error: 'retry requires a non-empty string target' };
    }
    return { ok: true, request: { verb, change, target } };
  }
  if (verb === 'plan') {
    const notes = record.notes;
    if (notes === undefined) return { ok: true, request: { verb, change } };
    if (typeof notes !== 'string' || notes.length === 0) {
      return { ok: false, error: 'plan notes must be a non-empty string' };
    }
    return { ok: true, request: { verb, change, notes } };
  }
  return { ok: false, error: 'verb must be approve, land, reject, retry, or plan' };
}
