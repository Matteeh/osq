import type { OsqLimits } from '../foundation/config.js';

/**
 * The subset of configured limits the excerpt builder reads. Keeping the shape
 * narrow lets marker writers and tests pass `config.limits` directly.
 */
export type VerifyExcerptLimits = Pick<OsqLimits, 'markerOutputLines' | 'markerLineChars'>;

/** A line whose text, after leading whitespace, opens the failing-tests section. */
const FAILING_TESTS_PREFIX = '✖ failing tests:';

/** True when `line` begins the failing-tests section after leading whitespace. */
function isFailingTestsLine(line: string): boolean {
  return line.trimStart().startsWith(FAILING_TESTS_PREFIX);
}

/** Keep the first `maxChars` characters of an over-long line and count the rest. */
function cutLine(line: string, maxChars: number): string {
  if (line.length <= maxChars) {
    return line;
  }
  return `${line.slice(0, maxChars)}… (${line.length - maxChars} more characters)`;
}

/**
 * The tail a `verify_ran`, `regressed` or `recertification` event keeps of a
 * recorded output. A text within both marker limits is kept exactly, trailing
 * newline included; any other text keeps its last `markerOutputLines` lines,
 * each cut to `markerLineChars`; blank output becomes the empty string.
 */
export function tailVerifyOutput(output: string, limits: VerifyExcerptLimits): string {
  const trimmed = output.trimEnd();
  if (trimmed.length === 0) return '';
  const lines = trimmed.split('\n');
  const withinLimits =
    lines.length <= limits.markerOutputLines &&
    lines.every((line) => line.length <= limits.markerLineChars);
  if (withinLimits) return output;
  const start = Math.max(0, lines.length - limits.markerOutputLines);
  return lines
    .slice(start)
    .map((line) => cutLine(line, limits.markerLineChars))
    .join('\n');
}

/**
 * Build the excerpt of a command's output that a `.run/` marker keeps. The
 * excerpt is the last `✖ failing tests:` line through the end when there is
 * one, otherwise the last `markerOutputLines` lines. Each kept line is cut to
 * `markerLineChars`, blank output becomes `(no output)`, and the excerpt ends
 * with a line naming the event that still holds the full output.
 */
export function excerptVerifyOutput(
  output: string,
  source: string,
  limits: VerifyExcerptLimits,
): string {
  const fullOutputLine = `Full output: ${source}`;
  const normalized = output.trimEnd();
  if (normalized.length === 0) {
    return `(no output)\n${fullOutputLine}`;
  }

  const lines = normalized.split('\n');
  let start = Math.max(0, lines.length - limits.markerOutputLines);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (isFailingTestsLine(lines[index])) {
      start = index;
      break;
    }
  }

  const kept = lines.slice(start).map((line) => cutLine(line, limits.markerLineChars));
  return [...kept, fullOutputLine].join('\n');
}
