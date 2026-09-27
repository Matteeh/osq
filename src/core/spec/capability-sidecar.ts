/**
 * The osq-owned capability sidecar, `osq.yml` beside a living capability spec.
 * It holds the metadata the OpenSpec format has no place for: a required
 * `group` and optional `tags`. A capability's description stays in the spec's
 * `## Purpose`; the sidecar never carries one. Reading is strict: a malformed
 * sidecar yields the problems lint reports, never a partial result.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

/** The placeholder group `osq migrate sidecars` writes for an ungrouped capability. */
export const UNGROUPED = 'ungrouped';

/** A parsed sidecar: a required group and optional tags. */
export interface CapabilitySidecar {
  readonly group: string;
  readonly tags?: readonly string[];
}

/** The parse result: the sidecar, or the problems that kept it from parsing. */
export interface SidecarParseResult {
  readonly sidecar: CapabilitySidecar | null;
  readonly problems: readonly string[];
}

const NOT_A_MAPPING = 'not a YAML mapping';
const GROUP_PROBLEM = 'group must be a non-empty string';
const TAGS_PROBLEM = 'tags must be a list of non-empty strings';

/** True for a string that holds something after trimming. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** The living sidecar path under `<openspecRoot>/specs/<capability>/osq.yml`. */
export function livingSidecarPath(
  projectRoot: string,
  openspecRoot: string,
  capability: string,
): string {
  return path.join(projectRoot, openspecRoot, 'specs', capability, 'osq.yml');
}

/**
 * Parse a sidecar's content into its sidecar or the problems found, each one of
 * `not a YAML mapping`, `group must be a non-empty string`,
 * `tags must be a list of non-empty strings`, and `unknown key <key>`.
 */
export function parseSidecar(content: string): SidecarParseResult {
  let parsed: unknown;
  try {
    parsed = YAML.parse(content);
  } catch {
    return { sidecar: null, problems: [NOT_A_MAPPING] };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { sidecar: null, problems: [NOT_A_MAPPING] };
  }

  const record = parsed as Record<string, unknown>;
  const problems: string[] = [];

  const group = record.group;
  if (!isNonEmptyString(group)) {
    problems.push(GROUP_PROBLEM);
  }

  let tags: string[] | undefined;
  if (record.tags !== undefined) {
    if (Array.isArray(record.tags) && record.tags.every(isNonEmptyString)) {
      tags = record.tags.map((tag) => (tag as string).trim());
    } else {
      problems.push(TAGS_PROBLEM);
    }
  }

  for (const key of Object.keys(record)) {
    if (key !== 'group' && key !== 'tags') {
      problems.push(`unknown key ${key}`);
    }
  }

  if (problems.length > 0) {
    return { sidecar: null, problems };
  }
  const groupText = typeof group === 'string' ? group.trim() : '';
  const sidecar: CapabilitySidecar =
    tags === undefined ? { group: groupText } : { group: groupText, tags };
  return { sidecar, problems: [] };
}

/**
 * Write a sidecar: `group: <group>` and, when there are tags, `tags:` with one
 * `  - <tag>` line each.
 */
export function formatSidecar(sidecar: CapabilitySidecar): string {
  const lines = [`group: ${sidecar.group}`];
  if (sidecar.tags !== undefined && sidecar.tags.length > 0) {
    lines.push('tags:');
    for (const tag of sidecar.tags) {
      lines.push(`  - ${tag}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Read a capability's living sidecar. A missing sidecar and a sidecar with a
 * problem both return null; lint reports the latter's problems.
 */
export async function readLivingSidecar(
  projectRoot: string,
  openspecRoot: string,
  capability: string,
): Promise<CapabilitySidecar | null> {
  const content = await fs
    .readFile(livingSidecarPath(projectRoot, openspecRoot, capability), 'utf8')
    .catch(() => null);
  if (content === null) {
    return null;
  }
  return parseSidecar(content).sidecar;
}
