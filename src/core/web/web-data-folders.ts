import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { resolveChangeDoc } from '../spec/parser.js';
import { listChanges } from '../status/change-locations.js';
import { getSpecsDir } from '../status/layout.js';
import { compareNumericPrefix } from '../status/state.js';
import { WebDataError, type WebLocation } from './web-data-types.js';

/** One discovered change folder with its deterministic identity. */
export interface DiscoveredChangeFolder {
  readonly folderKey: string;
  readonly folderPath: string;
  readonly location: WebLocation;
  readonly numericId: number | null;
  readonly slug: string;
}

/** One discovered living capability folder. */
export interface DiscoveredCapabilityFolder {
  readonly id: string;
  readonly folderPath: string;
}

const LOCATION_ORDER: readonly WebLocation[] = ['active', 'archived', 'rejected'];

/** Leading digit run of a folder key, or null when it has none. */
export function numericIdOf(folderKey: string): number | null {
  const match = folderKey.match(/^(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/** Folder key without its leading numeric id and separator. */
export function slugOf(folderKey: string): string {
  return folderKey.replace(/^\d+-?/, '');
}

async function listDirectory(dir: string): Promise<string[]> {
  return fs.readdir(dir).catch(() => []);
}

async function isDirectory(target: string): Promise<boolean> {
  const stat = await fs.stat(target).catch(() => null);
  return stat?.isDirectory() ?? false;
}

function compareFolders(a: DiscoveredChangeFolder, b: DiscoveredChangeFolder): number {
  const idA = a.numericId ?? Number.POSITIVE_INFINITY;
  const idB = b.numericId ?? Number.POSITIVE_INFINITY;
  if (idA !== idB) return idA - idB;
  const keyOrder = a.folderKey.localeCompare(b.folderKey);
  if (keyOrder !== 0) return keyOrder;
  return LOCATION_ORDER.indexOf(a.location) - LOCATION_ORDER.indexOf(b.location);
}

/**
 * Every active, archived, and rejected change folder that carries a resolvable
 * change document, ordered independently of directory enumeration.
 */
export async function listChangeFolders(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<DiscoveredChangeFolder[]> {
  const folders: DiscoveredChangeFolder[] = [];
  for (const change of await listChanges(projectRoot, config)) {
    if (!(await resolveChangeDoc(change.folderPath))) continue;
    folders.push({
      folderKey: change.folderName,
      folderPath: change.folderPath,
      location: change.location,
      numericId: numericIdOf(change.folderName),
      slug: slugOf(change.folderName),
    });
  }
  return folders.sort(compareFolders);
}

/**
 * Current `openspec/specs/<id>/spec.md` capability folders, ordered by id.
 */
export async function listCapabilityFolders(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<DiscoveredCapabilityFolder[]> {
  const specsDir = getSpecsDir(config.paths.openspecRoot, projectRoot);
  const folders: DiscoveredCapabilityFolder[] = [];
  for (const entry of await listDirectory(specsDir)) {
    if (entry.startsWith('_') || entry.startsWith('.')) continue;
    const folderPath = path.join(specsDir, entry);
    if (!(await isDirectory(folderPath))) continue;
    const specPath = path.join(folderPath, 'spec.md');
    const stat = await fs.stat(specPath).catch(() => null);
    if (!stat?.isFile()) continue;
    folders.push({ id: entry, folderPath });
  }
  return folders.sort((a, b) => a.id.localeCompare(b.id));
}

/** Read the complete UTF-8 text of a capability node, or null when unreadable. */
export async function readCapabilitySpec(folderPath: string): Promise<string | null> {
  return fs.readFile(path.join(folderPath, 'spec.md'), 'utf8').catch(() => null);
}

/**
 * Resolve one change by exact folder key or unambiguous numeric id across every
 * location. An exact key wins only when unique; numeric lookup collects every
 * matching folder before deciding.
 */
export async function resolveChangeFolder(
  projectRoot: string,
  selector: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<DiscoveredChangeFolder> {
  const folders = await listChangeFolders(projectRoot, config);
  const trimmed = selector.trim();
  if (!trimmed) throw new WebDataError('not-found', 'Change selector is empty');

  const exact = folders.filter((folder) => folder.folderKey === trimmed);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new WebDataError(
      'ambiguous',
      `Change selector "${trimmed}" matches folders in more than one location`,
    );
  }

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number.parseInt(trimmed, 10);
    const matches = folders.filter((folder) => folder.numericId === numeric);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      throw new WebDataError(
        'ambiguous',
        `Change id "${trimmed}" matches ${matches.length} preserved folders`,
      );
    }
  }

  throw new WebDataError('not-found', `Change "${trimmed}" was not found`);
}

/** Compare two folder keys deterministically for stable output ordering. */
export function compareFolderKeys(a: string, b: string): number {
  return compareNumericPrefix(a, b);
}
