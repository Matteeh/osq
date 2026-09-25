import { readVerification } from '../status/verification.js';

/** Archived changes that require verification, counted by their latest outcome. */
export interface VerificationCounts {
  readonly passed: number;
  readonly failed: number;
  readonly pending: number;
}

/**
 * Count the archived changes that require after-landing verification by their
 * latest recorded outcome: `passed`, `failed`, or `pending` when no outcome is
 * recorded. Returns null when no archived change requires verification, so the
 * report can leave the field and its text line out entirely.
 */
export async function collectVerificationCounts(
  archivedFolders: readonly string[],
): Promise<VerificationCounts | null> {
  let passed = 0;
  let failed = 0;
  let pending = 0;
  let required = 0;

  for (const folderPath of archivedFolders) {
    const state = await readVerification(folderPath);
    if (!state.required) continue;
    required++;
    if (state.outcome === 'passed') passed++;
    else if (state.outcome === 'failed') failed++;
    else pending++;
  }

  if (required === 0) return null;
  return { passed, failed, pending };
}

/** Render the `After-landing checks:` text line from the counts. */
export function formatVerificationCounts(counts: VerificationCounts): string {
  return `After-landing checks: ${counts.passed} passed, ${counts.failed} failed, ${counts.pending} pending`;
}
