/**
 * `osq migrate sidecars` scaffolds the missing sidecars a project adopting
 * capability groups needs. For every living capability without one it writes
 * `osq.yml` holding the `ungrouped` placeholder, never overwriting an existing
 * sidecar. Living capabilities come from their spec folders, in name order.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { UNGROUPED, formatSidecar, livingSidecarPath } from './capability-sidecar.js';
import { readLivingCapabilityNames } from './digest-capability.js';

export interface MigrateSidecarsOptions {
  readonly cwd: string;
  readonly openspecRoot: string;
}

export interface MigrateSidecarsResult {
  /** Capabilities whose sidecar was written, in name order. */
  readonly written: readonly string[];
}

/** True when `target` exists as a file or directory. */
async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

/**
 * Write `group: ungrouped` to `<openspecRoot>/specs/<capability>/osq.yml` for
 * every living capability that has no sidecar, never overwriting an existing
 * one. Returns the capabilities written, in name order.
 */
export async function migrateSidecars(
  options: MigrateSidecarsOptions,
): Promise<MigrateSidecarsResult> {
  const living = await readLivingCapabilityNames(options.cwd, options.openspecRoot);
  const written: string[] = [];

  for (const capability of living) {
    const filePath = livingSidecarPath(options.cwd, options.openspecRoot, capability);
    if (await exists(filePath)) continue;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, formatSidecar({ group: UNGROUPED }), 'utf8');
    written.push(capability);
  }

  return { written };
}
