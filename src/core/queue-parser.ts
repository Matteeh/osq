import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from './config.js';

export interface QueueItem {
  readonly slug: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
  readonly body: string;
  readonly hash: string;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEADING_RE = /^##[ \t]+\[([^\]\r\n]+)\][ \t]+(\S.*?)[ \t\r]*$/;
const ITEM_LIKE_RE = /^##[ \t]*\[.*$/gm;
const DEP_LINE_RE = /^Depends on:[ \t]*(.*?)[ \t\r]*$/;

export function getQueuePath(projectRoot: string, config: OsqConfig = DEFAULT_CONFIG): string {
  return path.join(projectRoot, config.paths.openspecRoot, 'queue.md');
}

function parseSection(raw: string, queuePath: string, seen: ReadonlySet<string>): QueueItem {
  const fail = (detail: string): Error => new Error(`${queuePath}: ${detail}`);
  const lines = raw.split('\n');
  const heading = lines[0].replace(/\r$/, '');
  const match = HEADING_RE.exec(heading);
  if (!match) throw fail(`malformed queue item heading ${JSON.stringify(heading.trim())}`);
  const slug = match[1].trim();
  if (!SLUG_RE.test(slug)) throw fail(`invalid queue item slug ${JSON.stringify(slug)}`);
  const title = match[2].trim();
  if (!title) throw fail(`queue item "${slug}" has an empty title`);
  if (seen.has(slug)) throw fail(`duplicate queue item slug "${slug}"`);
  const depIndex = lines.findIndex((line, index) => index > 0 && line.trim() !== '');
  if (depIndex === -1) throw fail(`queue item "${slug}" is missing its Depends on: line`);
  const depMatch = DEP_LINE_RE.exec(lines[depIndex].replace(/\r$/, ''));
  if (!depMatch) throw fail(`queue item "${slug}" has a malformed dependency line`);
  const depValue = depMatch[1].trim();
  if (!depValue) throw fail(`queue item "${slug}" has an empty dependency line`);
  const dependsOn: string[] = [];
  const seenDeps = new Set<string>();
  if (depValue !== 'nothing') {
    for (const token of depValue.split(',').map((entry) => entry.trim())) {
      if (!SLUG_RE.test(token)) {
        throw fail(`queue item "${slug}" has an invalid dependency ${JSON.stringify(token)}`);
      }
      if (seenDeps.has(token)) throw fail(`queue item "${slug}" repeats dependency "${token}"`);
      seenDeps.add(token);
      if (token === slug || !seen.has(token)) {
        throw fail(`queue item "${slug}" dependency "${token}" must reference an earlier item`);
      }
      dependsOn.push(token);
    }
  }
  const depLineEnd = lines.slice(0, depIndex + 1).reduce((sum, line) => sum + line.length + 1, 0);
  const body = raw.slice(depLineEnd).trim();
  if (!body) throw fail(`queue item "${slug}" has an empty brief body`);
  if (/^\s*Depends on:/m.test(body)) {
    throw fail(`queue item "${slug}" has more than one Depends on: line`);
  }
  return {
    slug,
    title,
    dependsOn,
    body,
    hash: `sha256:${createHash('sha256').update(raw, 'utf8').digest('hex')}`,
  };
}

export function parseQueue(content: string, queuePath = 'openspec/queue.md'): QueueItem[] {
  const headings = [...content.matchAll(ITEM_LIKE_RE)];
  const items: QueueItem[] = [];
  const seen = new Set<string>();
  for (const [index, heading] of headings.entries()) {
    const start = heading.index as number;
    const end = headings[index + 1]?.index ?? content.length;
    const item = parseSection(content.slice(start, end), queuePath, seen);
    seen.add(item.slug);
    items.push(item);
  }
  return items;
}

/** Read and parse `<openspecRoot>/queue.md`; throws when it is missing. */
export async function readQueue(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<QueueItem[]> {
  const queuePath = getQueuePath(projectRoot, config);
  const content = await fs.readFile(queuePath, 'utf8').catch(() => null);
  if (content === null) throw new Error(`Queue file not found: ${queuePath}`);
  return parseQueue(content, queuePath);
}
