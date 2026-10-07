import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** A line whose text, after leading whitespace, opens the failing-tests section. */
const FAILING_TESTS_PREFIX = '✖ failing tests:';

/** A `test at <path>:<line>:<column>` line, matched after leading whitespace. */
const TEST_AT_REGEX = /^test at (.+):(\d+):(\d+)$/;

/** Project-relative POSIX form of an absolute path. */
function toRelativePosix(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join('/');
}

/**
 * Read the failing test files a verify run's output names. Only the lines after
 * the last `✖ failing tests:` line are read, and only lines of the form
 * `test at <path>:<line>:<column>`. A `file://` URL or absolute path is read
 * relative to `projectRoot`; every result is a POSIX path. Returns the distinct
 * paths sorted, or null when there is no such section or it names no file.
 */
export function readFailingTestFiles(output: string, projectRoot: string): string[] | null {
  const lines = output.split('\n');

  let sectionStart = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if ((lines[index] ?? '').trimStart().startsWith(FAILING_TESTS_PREFIX)) {
      sectionStart = index;
      break;
    }
  }
  if (sectionStart === -1) return null;

  const found = new Set<string>();
  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    const match = (lines[index] ?? '').trimStart().match(TEST_AT_REGEX);
    const raw = match?.[1];
    if (raw === undefined) continue;
    if (raw.startsWith('file://')) {
      found.add(toRelativePosix(projectRoot, fileURLToPath(raw)));
    } else if (path.isAbsolute(raw)) {
      found.add(toRelativePosix(projectRoot, raw));
    } else {
      found.add(raw);
    }
  }

  return found.size === 0 ? null : [...found].sort();
}
