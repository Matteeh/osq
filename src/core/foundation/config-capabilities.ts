/**
 * Config-time check of `traceability.capabilities`. Every listed name must have
 * a living capability spec or be declared in `creates` by an active change; a
 * project with no living capability spec, and the value `'all'`, pass
 * unchecked. The check runs in `loadConfig` after the config is defined, so a
 * typo fails config loading instead of surfacing later.
 */

import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readCreates } from '../spec/capability-relations.js';
import { nearestCapability, readLivingCapabilityNames } from '../spec/digest-capability.js';
import { parseFrontmatter } from '../spec/parser.js';

/** The archive folder never declares a capability for a new change. */
const ARCHIVE_DIR = 'archive';

/** Capability names active changes declare in their proposals' `creates`. */
async function readCreatedCapabilityNames(
  projectRoot: string,
  openspecRoot: string,
): Promise<Set<string>> {
  const changesDir = path.join(projectRoot, openspecRoot, 'changes');
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(changesDir, { withFileTypes: true });
  } catch {
    return new Set();
  }

  const names = new Set<string>();
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ARCHIVE_DIR) continue;
    const proposalPath = path.join(changesDir, entry.name, 'proposal.md');
    const content = await fs.readFile(proposalPath, 'utf8').catch(() => null);
    if (content === null) continue;
    for (const name of readCreates(parseFrontmatter(content).data).names) {
      names.add(name);
    }
  }
  return names;
}

/**
 * The unknown-capability message, with the `; did you mean <nearest>?` suffix
 * left out when there is no living name to point at.
 */
export function unknownCapabilityMessage(name: string, living: readonly string[]): string {
  const nearest = nearestCapability(name, living);
  const suffix = nearest === null ? '' : `; did you mean ${nearest}?`;
  return `traceability.capabilities names unknown capability ${name}${suffix}`;
}

/**
 * Throws when a `traceability.capabilities` name has no living spec and no
 * active change declares it in `creates`. `'all'` and a project with no living
 * capability spec pass unchecked.
 */
export async function checkTraceabilityCapabilities(
  projectRoot: string,
  openspecRoot: string,
  capabilities: 'all' | readonly string[],
): Promise<void> {
  if (capabilities === 'all') return;
  const living = await readLivingCapabilityNames(projectRoot, openspecRoot);
  if (living.length === 0) return;
  const created = await readCreatedCapabilityNames(projectRoot, openspecRoot);

  for (const name of capabilities) {
    if (living.includes(name) || created.has(name)) continue;
    throw new Error(unknownCapabilityMessage(name, living));
  }
}
