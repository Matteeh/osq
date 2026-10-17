/**
 * The queue approval record: `<openspecRoot>/.run/queue-approval.md`. A human
 * approves the whole queue once, and the record maps every queue item's slug to
 * the hash of its raw queue section at that moment, in queue order. Its hash is
 * the `sha256:` of the file's own text, so a reader compares an item's current
 * section hash with the recorded one to see whether it changed.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { parseFrontmatter } from '../spec/parser.js';

/** How one queue item stands against the queue approval. */
export type ItemApproval = 'approved' | 'changed' | 'unapproved';

/** One queue item's slug and the hash of its section at approval time. */
export interface QueueApprovalEntry {
  readonly slug: string;
  readonly hash: string;
}

/** One `.run/queue-approval.md` record. */
export interface QueueApproval {
  /** ISO time the queue was approved. */
  readonly approvedAt: string;
  /** The git user as `Name <email>`, or empty without one. */
  readonly approver: string;
  /** Each item's slug mapped to its hash, in queue order. */
  readonly items: readonly QueueApprovalEntry[];
  /** `sha256:` and the hex SHA-256 of the file's text. */
  readonly hash: string;
}

/** `<openspecRoot>/.run/queue-approval.md`. */
export function queueApprovalPath(projectRoot: string, config: OsqConfig = DEFAULT_CONFIG): string {
  return path.join(projectRoot, config.paths.openspecRoot, '.run', 'queue-approval.md');
}

function hashText(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

/**
 * Write the queue approval record and return it with the hash of the exact text
 * written, read back from the file.
 *
 * @scenario status-inspection: Item approval
 * @scenario status-inspection: Queue view with an approval
 * @scenario cli-foundation: Queue approved
 * @adr 021
 */
export async function writeQueueApproval(
  projectRoot: string,
  config: OsqConfig,
  items: readonly QueueApprovalEntry[],
  approver: string,
  approvedAt: string = new Date().toISOString(),
): Promise<QueueApproval> {
  const target = queueApprovalPath(projectRoot, config);
  const itemMap: Record<string, string> = {};
  for (const item of items) itemMap[item.slug] = item.hash;
  const frontmatter = YAML.stringify({
    approved_at: approvedAt,
    approver,
    items: itemMap,
  }).trimEnd();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `---\n${frontmatter}\n---\n`, 'utf8');
  const written = await fs.readFile(target, 'utf8');
  return {
    approvedAt,
    approver,
    items: items.map((item) => ({ slug: item.slug, hash: item.hash })),
    hash: hashText(written),
  };
}

function parseApproval(content: string): QueueApproval | null {
  const { data } = parseFrontmatter(content);
  const { approved_at: approvedAt, approver, items } = data;
  if (typeof approvedAt !== 'string' || typeof approver !== 'string') return null;
  if (items === null || typeof items !== 'object' || Array.isArray(items)) return null;
  const entries: QueueApprovalEntry[] = [];
  for (const [slug, hash] of Object.entries(items as Record<string, unknown>)) {
    if (typeof hash !== 'string') return null;
    entries.push({ slug, hash });
  }
  return { approvedAt, approver, items: entries, hash: hashText(content) };
}

/**
 * Read the queue approval record; null for a missing or unparsable file.
 *
 * @scenario status-inspection: Item approval
 * @scenario status-inspection: Queue view without an approval
 * @adr 021
 */
export async function readQueueApproval(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<QueueApproval | null> {
  const content = await fs
    .readFile(queueApprovalPath(projectRoot, config), 'utf8')
    .catch(() => null);
  return content === null ? null : parseApproval(content);
}

/**
 * One item's approval: `unapproved` without a record or with the slug absent,
 * `approved` when the recorded hash matches its current section hash, and
 * `changed` otherwise.
 *
 * @scenario status-inspection: Item approval
 * @scenario status-inspection: Queue view with an approval
 * @adr 021
 */
export function itemApproval(
  approval: QueueApproval | null,
  item: QueueApprovalEntry,
): ItemApproval {
  if (approval === null) return 'unapproved';
  const recorded = approval.items.find((entry) => entry.slug === item.slug);
  if (recorded === undefined) return 'unapproved';
  return recorded.hash === item.hash ? 'approved' : 'changed';
}
