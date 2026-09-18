/**
 * Strip the project root from absolute paths embedded in a tool summary so the
 * status row reads a clean repository relative path. Relativization happens once
 * at write time (harness adapters) and once more for display (heartbeat), but the
 * function lives in core so both layers share a single implementation.
 */
export function relativizeToolSummary(summary: string, root: string = process.cwd()): string {
  if (!summary || !root) {
    return summary;
  }

  // Compare without a trailing separator so `${normalizedRoot}/` strips
  // cleanly, but keep a bare filesystem root intact so it is not reduced to an
  // empty string that would match every separator in the summary.
  const normalizedRoot = root.length > 1 ? root.replace(/[\\/]+$/, '') : root;
  if (!normalizedRoot || normalizedRoot === '/' || normalizedRoot === '\\') {
    return summary;
  }

  const escapedRoot = normalizedRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withSeparator = new RegExp(`${escapedRoot}[\\\\/]`, 'g');
  const relativized = summary.replace(withSeparator, '');

  // A summary that is exactly the root has no trailing separator to strip.
  const exactRoot = new RegExp(`${escapedRoot}(?=$|[\\s"'()\\[\\]{},;:])`, 'g');
  return relativized.replace(exactRoot, '.');
}
