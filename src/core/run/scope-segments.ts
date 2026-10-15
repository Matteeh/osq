import fs from 'node:fs/promises';
import path from 'node:path';

/** The per-file before/after hashes one `measures` end event recorded. */
export interface MeasureSegment {
  before: string | null;
  after: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Read one task's `measures` end events grouped by path, applying the
 * discarded-attempt rule: an end segment whose `before` equals the previous
 * kept segment's `before` replaces that segment, because the earlier attempt's
 * changes were discarded, as a dead task's are in a worktree.
 */
async function readEndScopeHashes(
  specFolderPath: string,
  taskNumber: string,
): Promise<Map<string, MeasureSegment[]>> {
  const raw = await fs
    .readFile(path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  const byPath = new Map<string, MeasureSegment[]>();
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(event) || event.type !== 'measures' || !isRecord(event.data)) continue;
    if (event.data.phase !== 'end' || !isRecord(event.data.scopeHashes)) continue;
    for (const [filePath, entry] of Object.entries(event.data.scopeHashes)) {
      if (!isRecord(entry)) continue;
      const segment: MeasureSegment = {
        before: typeof entry.before === 'string' ? entry.before : null,
        after: typeof entry.after === 'string' ? entry.after : null,
      };
      const kept = byPath.get(filePath) ?? [];
      const previous = kept[kept.length - 1];
      if (previous !== undefined && previous.before === segment.before) {
        kept[kept.length - 1] = segment;
      } else {
        kept.push(segment);
      }
      byPath.set(filePath, kept);
    }
  }
  return byPath;
}

/**
 * @scenario watcher-and-harness: Segments of a discarded attempt
 * @scenario watcher-and-harness: Segments of a kept attempt
 */
export async function readEndSegments(
  specFolderPath: string,
  taskNumber: string,
  filePath: string,
): Promise<MeasureSegment[]> {
  return (await readEndScopeHashes(specFolderPath, taskNumber)).get(filePath) ?? [];
}

/**
 * The paths one task's kept end segments change: at least one segment whose
 * `before` differs from its `after`, read through the same discarded-attempt
 * rule.
 *
 * @scenario watcher-and-harness: Credit from measured hashes
 * @scenario watcher-and-harness: Two later tasks measured the path
 */
export async function readMeasuredPaths(
  specFolderPath: string,
  taskNumber: string,
): Promise<string[]> {
  const byPath = await readEndScopeHashes(specFolderPath, taskNumber);
  const paths: string[] = [];
  for (const [filePath, segments] of byPath) {
    if (segments.some((segment) => segment.before !== segment.after)) paths.push(filePath);
  }
  return paths.sort();
}
