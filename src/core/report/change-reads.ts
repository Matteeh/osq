/** Shared, frozen brief and manifest reads for one report run. */

import path from 'node:path';
import { parseFrontmatter } from '../spec/parser.js';
import { freezeDeep, readSharedFile } from './stream-reads.js';

const BRIEF_FILENAME = 'brief.md';
const RUN_DIR = '.run';
const MANIFEST_FILENAME = 'manifest.json';

/** Parses a `brief.md` and returns its frontmatter data. */
function parseBriefData(content: string): Record<string, unknown> {
  return parseFrontmatter(content).data;
}

/** Parses a manifest as a JSON object; null when it is not a plain object. */
function parseManifestObject(content: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

/**
 * Reads one change's `brief.md` frontmatter data through the shared scope,
 * deep-frozen, or null when the brief is missing or unreadable.
 */
export async function readBriefData(
  folderPath: string,
): Promise<Readonly<Record<string, unknown>> | null> {
  const filePath = path.join(folderPath, BRIEF_FILENAME);
  return readSharedFile(filePath, parseBriefData)
    .then((data) => freezeDeep(data))
    .catch(() => null);
}

/**
 * Reads one change's `.run/manifest.json` as a deep-frozen object through the
 * shared scope, or null when it is missing, unreadable, malformed, or not a
 * plain object.
 */
export async function readManifestObject(
  folderPath: string,
): Promise<Readonly<Record<string, unknown>> | null> {
  const filePath = path.join(folderPath, RUN_DIR, MANIFEST_FILENAME);
  return readSharedFile(filePath, parseManifestObject)
    .then((value) => freezeDeep(value))
    .catch(() => null);
}
