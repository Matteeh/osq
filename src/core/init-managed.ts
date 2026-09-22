import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CLAUDE_PLAN_COMMAND_PATH,
  MANAGED_AGENTS_MD_BODY,
  MANAGED_CLAUDE_PLAN_COMMAND,
  MANAGED_PLANNER_BLOCK,
  OSQ_END_MARKER,
  OSQ_START_MARKER,
} from './init-blocks.js';

/** New-file preamble for the managed Claude command. */
const CLAUDE_PLAN_COMMAND_TITLE = 'Plan a change with osq';

export type ManagedBlockProblem = 'missing-block' | 'partial' | 'reversed' | 'duplicated' | 'stale';

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * Compare one document's osq marker pair against the installed canonical block.
 * Returns `null` only when exactly one well-formed, current pair is present.
 */
export function inspectManagedBlock(
  content: string,
  canonical: string,
): ManagedBlockProblem | null {
  const starts = countOccurrences(content, OSQ_START_MARKER);
  const ends = countOccurrences(content, OSQ_END_MARKER);
  if (starts === 0 && ends === 0) return 'missing-block';
  if (starts > 1 || ends > 1) return 'duplicated';
  if (starts === 0 || ends === 0) return 'partial';
  const start = content.indexOf(OSQ_START_MARKER);
  const end = content.indexOf(OSQ_END_MARKER);
  if (end < start) return 'reversed';
  const block = content.slice(start, end + OSQ_END_MARKER.length);
  return block === canonical ? null : 'stale';
}

interface RemovalRange {
  start: number;
  end: number;
}

/**
 * Locate every removable osq marker range. Well-formed pairs are removed whole;
 * a stray marker (unterminated start, orphan end, or reversed pair) is removed
 * as its own token so repair always converges on exactly one canonical block.
 */
function markerRanges(content: string): RemovalRange[] {
  const markers: Array<{ kind: 'start' | 'end'; index: number }> = [];
  for (const [kind, marker] of [
    ['start', OSQ_START_MARKER],
    ['end', OSQ_END_MARKER],
  ] as const) {
    let from = 0;
    while (true) {
      const index = content.indexOf(marker, from);
      if (index === -1) break;
      markers.push({ kind, index });
      from = index + marker.length;
    }
  }
  markers.sort((a, b) => a.index - b.index);

  const ranges: RemovalRange[] = [];
  let openStart: number | null = null;
  for (const marker of markers) {
    if (marker.kind === 'start') {
      if (openStart !== null) {
        ranges.push({ start: openStart, end: openStart + OSQ_START_MARKER.length });
      }
      openStart = marker.index;
    } else if (openStart !== null) {
      ranges.push({ start: openStart, end: marker.index + OSQ_END_MARKER.length });
      openStart = null;
    } else {
      ranges.push({ start: marker.index, end: marker.index + OSQ_END_MARKER.length });
    }
  }
  if (openStart !== null) {
    ranges.push({ start: openStart, end: openStart + OSQ_START_MARKER.length });
  }
  return ranges.sort((a, b) => a.start - b.start);
}

/** Replace every osq block with exactly one current canonical block. */
function replaceManagedBlock(content: string, block: string): string {
  const ranges = markerRanges(content);
  if (ranges.length === 0) {
    const separator = content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n';
    return `${content}${separator}${block}\n`;
  }

  let result = '';
  let cursor = 0;
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    result += content.slice(cursor, range.start);
    if (index === 0) result += block;
    cursor = range.end;
  }
  return result + content.slice(cursor);
}

async function pathExists(targetPath: string): Promise<boolean> {
  return fs
    .stat(targetPath)
    .then(() => true)
    .catch(() => false);
}

async function writeManagedBlock(filePath: string, title: string, block: string): Promise<boolean> {
  if (!(await pathExists(filePath))) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `# ${title}\n\n${block}\n`, 'utf8');
    return true;
  }

  const currentContent = await fs.readFile(filePath, 'utf8');
  await fs.writeFile(filePath, replaceManagedBlock(currentContent, block), 'utf8');
  return true;
}

export async function updateAgentsMd(targetDir: string): Promise<boolean> {
  return writeManagedBlock(path.join(targetDir, 'AGENTS.md'), 'AGENTS', MANAGED_AGENTS_MD_BODY);
}

export async function updatePlannerMd(targetDir: string): Promise<boolean> {
  return writeManagedBlock(
    path.join(targetDir, 'PLANNER.md'),
    'Planning a change for osq',
    MANAGED_PLANNER_BLOCK,
  );
}

export async function updateClaudePlanCommand(targetDir: string): Promise<boolean> {
  return writeManagedBlock(
    path.join(targetDir, CLAUDE_PLAN_COMMAND_PATH),
    CLAUDE_PLAN_COMMAND_TITLE,
    MANAGED_CLAUDE_PLAN_COMMAND,
  );
}
