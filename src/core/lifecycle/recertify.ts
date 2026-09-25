import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import type { ScopeHashResult } from '../run/scope-hash.js';
import { SCOPE_RESOLVER_VERSION } from '../run/scope.js';
import { parseFrontmatter } from '../spec/parser.js';

/**
 * Refresh a canonical done marker in place after a passing recertification.
 * Every existing field is kept, the first trusted hash is retained as
 * `original_scope_hash`, the current resolver-2 hashes and timestamp are
 * recorded, and `recertification_count` increments.
 */
export async function refreshRecertifiedDoneMarker(
  runDir: string,
  taskNumber: string,
  recordedHash: string,
  current: ScopeHashResult,
): Promise<void> {
  const { data, body } = parseFrontmatter(
    await fs.readFile(path.join(runDir, 'done', taskNumber), 'utf8'),
  );
  const merged: Record<string, unknown> = { ...data };
  if (typeof merged.original_scope_hash !== 'string' || !merged.original_scope_hash) {
    merged.original_scope_hash = recordedHash;
  }
  merged.scope_hash = current.hash;
  merged.scope_files = current.fileHashes;
  merged.scope_resolver = SCOPE_RESOLVER_VERSION;
  merged.recertified_at = new Date().toISOString();
  const count = data.recertification_count;
  merged.recertification_count =
    (typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : 0) + 1;
  await fs.writeFile(
    path.join(runDir, 'done', taskNumber),
    `---\n${YAML.stringify(merged)}---\n${body}`,
    'utf8',
  );
}
