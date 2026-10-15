/**
 * Manual edit records: one file per `osq manual` run, under
 * `<openspecRoot>/manual/`. A record names the paths a human kept and the
 * living capabilities whose Code ownership covers them, so the next planner
 * can bring the specs in line with the edit.
 */

import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import type { OsqConfig } from '../foundation/config.js';
import { parseFrontmatter } from '../spec/parser.js';

/** One manual edit record. */
export interface ManualEditRecord {
  /** The record's file name, without its folder. */
  readonly file: string;
  /** The keep time, ISO-8601 UTC. */
  readonly keptAt: string;
  /** The kept paths and rename sources, sorted. */
  readonly paths: readonly string[];
  /** The sorted living capabilities whose Code ownership covers a kept path. */
  readonly capabilities: readonly string[];
  /** The trimmed comment. */
  readonly comment: string;
}

/** The fields one record file is rendered from. */
export interface ManualRecordFields {
  readonly keptAt: string;
  readonly paths: readonly string[];
  readonly capabilities: readonly string[];
  readonly comment: string;
}

/** `<openspecRoot>/manual`, where the record files live. */
export function manualRecordsDir(projectRoot: string, config: OsqConfig): string {
  return path.resolve(projectRoot, config.paths.openspecRoot, 'manual');
}

/** The record's file name: its keep time with every `:` and `.` replaced by `-`. */
export function manualRecordFileName(keptAt: string): string {
  return `${keptAt.replace(/[:.]/g, '-')}.md`;
}

/** Render one record file's text from its fields. */
export function renderManualEditRecord(fields: ManualRecordFields): string {
  const frontmatter = YAML.stringify({
    kept_at: fields.keptAt,
    paths: [...fields.paths].sort(),
    capabilities: [...fields.capabilities].sort(),
  }).trimEnd();
  return `---\n${frontmatter}\n---\n${fields.comment}\n`;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Read every manual edit record, in `kept_at` order, leaving out a file without
 * a string `kept_at` or a `paths` list.
 *
 * @scenario version-control: Record of a kept edit
 * @adr 003
 */
export async function readManualEditRecords(
  projectRoot: string,
  config: OsqConfig,
): Promise<ManualEditRecord[]> {
  const dir = manualRecordsDir(projectRoot, config);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const records: ManualEditRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const content = await fs.readFile(path.join(dir, entry.name), 'utf8').catch(() => null);
    if (content === null) continue;
    const { data, body } = parseFrontmatter(content);
    const keptAt = data.kept_at;
    if (typeof keptAt !== 'string' || !Array.isArray(data.paths)) continue;
    records.push({
      file: entry.name,
      keptAt,
      paths: stringList(data.paths),
      capabilities: stringList(data.capabilities),
      comment: body.trim(),
    });
  }

  records.sort((a, b) => (a.keptAt < b.keptAt ? -1 : a.keptAt > b.keptAt ? 1 : 0));
  return records;
}
