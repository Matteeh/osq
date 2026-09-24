/**
 * The one place the pre-spawn start of a task verify is worded. Both the watch
 * log and `osq show` read it, so a start is described the same way everywhere.
 * A red start is a failing verify or a named path that is not there yet; a
 * green start is a passing verify with every named path present.
 */

/** True when the start is red: verify failed or a named path is missing. */
function isRedStart(exitCode: number, missingPaths: readonly string[]): boolean {
  return exitCode !== 0 || missingPaths.length > 0;
}

/**
 * Word a pre-spawn start from the declared `expected` state, the verify exit
 * code, and the named paths absent before spawn. A declaration that disagrees
 * with the observed start gains `, but it declared <expected>`; `any` never does.
 */
export function formatPreSpawnStart(
  expected: string,
  exitCode: number,
  missingPaths: readonly string[],
): string {
  if (isRedStart(exitCode, missingPaths)) {
    const base =
      missingPaths.length > 0
        ? `started red: ${missingPaths.join(', ')} missing`
        : 'started red: verify fails';
    return expected === 'green' ? `${base}, but it declared ${expected}` : base;
  }
  const base = 'started green, as declared';
  return expected === 'red' ? `started green, but it declared ${expected}` : base;
}
