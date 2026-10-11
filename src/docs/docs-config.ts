/**
 * The `docs` config block. It reaches `config.ts` for types only, because the
 * `docs` slice imports this module statically and `slice.ts` must not pull the
 * configuration module into a slice's runtime imports.
 */

import type { OsqConfig } from '../core/foundation/config.js';
import type { DocsConfig } from './docs-types.js';

/** The default `docs` block. */
export const DOCS_DEFAULTS: DocsConfig = { recentChanges: 5 };

/** The one message an invalid `recentChanges` fails with. */
const INVALID = 'docs.recentChanges must be a positive integer';

/** True for a positive integer. */
function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Resolve the user's raw `docs` block over the defaults. `undefined` and
 * `null` resolve to the defaults; a `recentChanges` that is not a positive
 * integer fails.
 *
 * @scenario docs: Docs config values
 * @adr 016
 */
export function resolveDocsConfig(raw: unknown): DocsConfig {
  if (raw === undefined || raw === null) return { ...DOCS_DEFAULTS };
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error(INVALID);
  const recentChanges = (raw as Record<string, unknown>).recentChanges;
  const value = recentChanges === undefined ? DOCS_DEFAULTS.recentChanges : recentChanges;
  if (!isPositiveInteger(value)) throw new Error(INVALID);
  return { recentChanges: value };
}

/**
 * The config's `docs` block, or `DOCS_DEFAULTS` when it has none.
 *
 * @scenario docs: Docs config values
 * @adr 016
 */
export function docsConfig(config: OsqConfig): DocsConfig {
  const raw = (config as { docs?: unknown }).docs;
  return raw === undefined ? DOCS_DEFAULTS : resolveDocsConfig(raw);
}
