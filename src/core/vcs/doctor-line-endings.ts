import type { DoctorCheckResult } from '../foundation/doctor.js';
import type { Vcs } from './vcs.js';

/**
 * The index line endings that make a fresh worktree check the file out with
 * different bytes, so git reports it modified. `lf`, `none`, `-text` and an
 * empty value never count.
 */
const REPAIR_ENDINGS = new Set(['crlf', 'mixed']);

/**
 * The passing `git-line-endings` warning when any tracked file's index is
 * CRLF or mixed, or null when none is. The message names the first `limit`
 * such files in `git ls-files` order and the total count, and tells the human
 * to run `git add --renormalize .`. It never changes doctor's exit code, and
 * osq never rewrites the files itself.
 *
 * @scenario cli-foundation: Line endings warning text
 * @scenario cli-foundation: Line endings warning keeps exit code
 * @adr 003
 */
export async function lineEndingWarning(
  vcs: Vcs,
  limit: number,
): Promise<DoctorCheckResult | null> {
  const endings = await vcs.lineEndings();
  const offenders = endings.filter((entry) => REPAIR_ENDINGS.has(entry.index));
  if (offenders.length === 0) return null;
  const count = offenders.length;
  const named = offenders
    .slice(0, limit)
    .map((entry) => entry.path)
    .join(', ');
  const rest = count - Math.min(limit, count);
  const more = rest > 0 ? ` and ${rest} more` : '';
  const verb = count === 1 ? 'tracked file has' : 'tracked files have';
  return {
    name: 'git-line-endings',
    ok: true,
    warning: true,
    message: `${count} ${verb} CRLF or mixed line endings: ${named}${more}; run git add --renormalize . and commit`,
  };
}
