import type { GitWriteContext } from './git-vcs-write.js';
import type { VcsDiffStat } from './vcs.js';

/** One `git diff --numstat` line's counts; `-` counts as 0 lines. */
function lineCounts(field: string): number {
  return field === '-' ? 0 : Number.parseInt(field, 10);
}

/**
 * Count what `to` changed since its merge base with `from`: files changed and
 * lines added and removed, leaving out each path of `exclude`. A binary file
 * counts as one file with no lines. Null when either ref is unknown.
 */
export async function diffStat(
  ctx: GitWriteContext,
  from: string,
  to: string,
  exclude: readonly string[],
): Promise<VcsDiffStat | null> {
  const args = [
    'diff',
    '--numstat',
    '--no-renames',
    `${from}...${to}`,
    '--',
    '.',
    ...exclude.map((entry) => `:(exclude)${entry}`),
  ];
  const result = await ctx.run(args);
  if (result.code !== 0) return null;

  let files = 0;
  let added = 0;
  let removed = 0;
  for (const raw of result.stdout.split('\n')) {
    if (raw.length === 0) continue;
    const [addField = '', removeField = ''] = raw.split('\t');
    const fileAdded = lineCounts(addField);
    const fileRemoved = lineCounts(removeField);
    if (Number.isNaN(fileAdded) || Number.isNaN(fileRemoved)) continue;
    files += 1;
    added += fileAdded;
    removed += fileRemoved;
  }
  return { files, added, removed };
}
