/**
 * Capability groups for architecture decision records. An `applies_to` entry
 * `group:<name>` names every capability whose sidecar group is `<name>`: the
 * living capabilities' `osq.yml` first, then an active change folder's
 * `specs/<capability>/osq.yml` for a capability no living sidecar covers.
 */

import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSidecar } from '../spec/capability-sidecar.js';
import { getSpecsDir, isActiveChangeFolderName } from '../status/layout.js';
import type { OsqConfig } from './config.js';

/** A group entry: `group:<name>`. Every other entry is a capability name. */
const GROUP_ENTRY = /^group:(.+)$/;

/**
 * The group a `group:<name>` entry names, or null for a capability name.
 *
 * @scenario cli-foundation: ADR applying to a group
 */
export function appliesToGroup(entry: string): string | null {
  const match = GROUP_ENTRY.exec(entry);
  return match ? match[1] : null;
}

/** True when `target` is a regular file. */
async function fileExists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then((stat) => stat.isFile())
    .catch(() => false);
}

/** The group a sidecar file names, or null when it is missing or has a problem. */
async function readSidecarGroup(filePath: string): Promise<string | null> {
  const content = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (content === null) return null;
  return parseSidecar(content).sidecar?.group ?? null;
}

/**
 * Capability directories under a `specs` root that hold `osq.yml`, sorted by
 * name. A living root also requires the `spec.md` that makes it a capability.
 */
async function sidecarCapabilities(specsDir: string, requireSpec: boolean): Promise<string[]> {
  const entries: Dirent[] = await fs.readdir(specsDir, { withFileTypes: true }).catch(() => []);
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!(await fileExists(path.join(specsDir, entry.name, 'osq.yml')))) continue;
    if (requireSpec && !(await fileExists(path.join(specsDir, entry.name, 'spec.md')))) continue;
    names.push(entry.name);
  }
  return names.sort();
}

/**
 * Read every capability's group: each living capability's `osq.yml`, then each
 * active change folder's `specs/<capability>/osq.yml` for a capability no
 * living sidecar covered, change folders in name order and `archive` left out.
 * A sidecar with a problem gives no group.
 *
 * @scenario cli-foundation: ADR applying to a group
 * @scenario cli-foundation: Group ADR governs a change
 * @scenario cli-foundation: Group validation
 */
export async function readCapabilityGroups(
  projectRoot: string,
  config: OsqConfig,
): Promise<ReadonlyMap<string, string>> {
  const groups = new Map<string, string>();
  const specsDir = getSpecsDir(config.paths.openspecRoot, projectRoot);
  for (const capability of await sidecarCapabilities(specsDir, true)) {
    const group = await readSidecarGroup(path.join(specsDir, capability, 'osq.yml'));
    if (group !== null) groups.set(capability, group);
  }

  // Active change folders directly under `<openspecRoot>/changes`, in name
  // order; `isActiveChangeFolderName` leaves out `archive` and `rejected`.
  const changesDir = path.join(projectRoot, config.paths.openspecRoot, 'changes');
  const entries: Dirent[] = await fs.readdir(changesDir, { withFileTypes: true }).catch(() => []);
  const folders = entries
    .filter((entry) => entry.isDirectory() && isActiveChangeFolderName(entry.name))
    .map((entry) => entry.name)
    .sort();
  for (const folder of folders) {
    const changeSpecs = path.join(changesDir, folder, 'specs');
    for (const capability of await sidecarCapabilities(changeSpecs, false)) {
      if (groups.has(capability)) continue;
      const group = await readSidecarGroup(path.join(changeSpecs, capability, 'osq.yml'));
      if (group !== null) groups.set(capability, group);
    }
  }
  return groups;
}

/**
 * The capabilities an `applies_to` value names: `all`, or the capability names
 * and group members it lists, sorted and without repeats.
 *
 * @scenario cli-foundation: ADR applying to a group
 */
export function resolveGoverns(
  appliesTo: 'all' | readonly string[] | null,
  groups: ReadonlyMap<string, string>,
): 'all' | readonly string[] {
  if (appliesTo === 'all') return 'all';
  if (appliesTo === null) return [];
  const resolved = new Set<string>();
  for (const entry of appliesTo) {
    const group = appliesToGroup(entry);
    if (group === null) {
      resolved.add(entry);
      continue;
    }
    for (const [capability, capabilityGroup] of groups) {
      if (capabilityGroup === group) resolved.add(capability);
    }
  }
  return [...resolved].sort();
}
