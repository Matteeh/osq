/**
 * The two committed trial label files, read on every `osq query` call and
 * written by `osq label`. A label lives only in its file (ADR 008).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { OsqConfig } from '../foundation/config.js';
import { QueryError } from './query-run.js';

/** Which trial a label belongs to: validator findings, or traceability items. */
export type TrialLabelKind = 'validator' | 'traceability';

/** The ids labelled true or false in each file. */
export interface TrialLabels {
  readonly validator: ReadonlyMap<string, boolean>;
  readonly traceability: ReadonlyMap<string, boolean>;
}

/**
 * The labels file's absolute path: `<openspecRoot>/trials/<kind>.json`.
 *
 * @scenario metrics-and-reporting: Labelling items
 * @scenario metrics-and-reporting: Malformed label file
 * @adr 008
 */
export function trialLabelPath(
  projectRoot: string,
  config: OsqConfig,
  kind: TrialLabelKind,
): string {
  return path.resolve(projectRoot, config.paths.openspecRoot, 'trials', `${kind}.json`);
}

/**
 * The labels file's path relative to the project root, with `/` separators.
 *
 * @scenario metrics-and-reporting: Labelling items
 * @scenario metrics-and-reporting: Malformed label file
 * @adr 008
 */
export function trialLabelRelativePath(
  projectRoot: string,
  config: OsqConfig,
  kind: TrialLabelKind,
): string {
  const relative = path.relative(
    path.resolve(projectRoot),
    trialLabelPath(projectRoot, config, kind),
  );
  return relative.split(path.sep).join('/');
}

/** The one malformed-file message, naming the file's project-relative path. */
function malformed(relativePath: string): QueryError {
  return new QueryError(`${relativePath} must be a JSON object of true or false labels`);
}

/** One labels file as a map, an empty map when it is missing, or a QueryError. */
async function readLabelFile(
  filePath: string,
  relativePath: string,
): Promise<Map<string, boolean>> {
  const text = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (text === null) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw malformed(relativePath);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw malformed(relativePath);
  }
  const labels = new Map<string, boolean>();
  for (const [id, value] of Object.entries(parsed)) {
    if (typeof value !== 'boolean') throw malformed(relativePath);
    labels.set(id, value);
  }
  return labels;
}

/**
 * Reads both label files under the openspec root. A missing file reads as no
 * labels; a file that is not a JSON object whose values are all true or false
 * fails with the delta's message.
 *
 * @scenario metrics-and-reporting: Labels in the tables
 * @scenario metrics-and-reporting: Malformed label file
 * @scenario metrics-and-reporting: Labelling items
 * @adr 008
 */
export async function readTrialLabels(
  projectRoot: string,
  config: OsqConfig,
): Promise<TrialLabels> {
  const validatorPath = trialLabelPath(projectRoot, config, 'validator');
  const traceabilityPath = trialLabelPath(projectRoot, config, 'traceability');
  const [validator, traceability] = await Promise.all([
    readLabelFile(validatorPath, trialLabelRelativePath(projectRoot, config, 'validator')),
    readLabelFile(traceabilityPath, trialLabelRelativePath(projectRoot, config, 'traceability')),
  ]);
  return { validator, traceability };
}

/** Sets the `label` column of one table for each labelled id. */
function applyLabels(
  stmt: ReturnType<DatabaseSync['prepare']>,
  labels: ReadonlyMap<string, boolean>,
): void {
  for (const [id, value] of labels) stmt.run(value ? 1 : 0, id);
}

/**
 * Fills the `label` columns of `validator_findings`, `mutation_survivors` and
 * `link_findings` after their rows are in: 1 for an id labelled true, 0 for
 * false, and null for an id with no label. A label whose id names no row is
 * kept and ignored.
 *
 * @scenario metrics-and-reporting: Labels in the tables
 * @adr 008
 */
export async function applyTrialLabels(
  db: DatabaseSync,
  projectRoot: string,
  config: OsqConfig,
): Promise<void> {
  const labels = await readTrialLabels(projectRoot, config);
  const validator = db.prepare('UPDATE validator_findings SET label = ? WHERE id = ?');
  const survivors = db.prepare('UPDATE mutation_survivors SET label = ? WHERE id = ?');
  const links = db.prepare('UPDATE link_findings SET label = ? WHERE id = ?');
  applyLabels(validator, labels.validator);
  applyLabels(survivors, labels.traceability);
  applyLabels(links, labels.traceability);
}

/**
 * Writes one labels file as JSON with keys sorted, two-space indents and a
 * trailing newline, creating the folder and file when missing.
 *
 * @scenario metrics-and-reporting: Labelling items
 * @adr 008
 */
export async function writeTrialLabels(
  projectRoot: string,
  config: OsqConfig,
  kind: TrialLabelKind,
  labels: ReadonlyMap<string, boolean>,
): Promise<string> {
  const filePath = trialLabelPath(projectRoot, config, kind);
  const sorted: Record<string, boolean> = {};
  for (const id of [...labels.keys()].sort()) sorted[id] = labels.get(id) as boolean;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
  return trialLabelRelativePath(projectRoot, config, kind);
}
