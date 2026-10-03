import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import type { Logger } from '../core/foundation/logger.js';
import { findSpecFolder } from '../core/spec/approve.js';
import { buildImportGraph } from '../core/spec/import-graph.js';
import {
  type LintJsonEntry,
  buildLintJson,
  dedupeFindings,
  printChangeFindings,
  printRepositoryCount,
  printRepositoryFindings,
} from '../core/spec/lint-output.js';
import { type LintResult, lintChangeFolder } from '../core/spec/linter.js';
import { getChangesDir, isActiveChangeFolderName } from '../core/status/layout.js';
import { findSteeringChange } from '../core/status/steering-change.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, commandLogger, resolveInputs } from './command-inputs.js';

export interface LintCommandEntry {
  readonly folder: string;
  readonly result: LintResult;
}

export interface LintCommandResult {
  readonly valid: boolean;
  readonly entries: LintCommandEntry[];
}

export type LintCommandLogger = Pick<Logger, 'info' | 'verbose' | 'warn' | 'error'>;

export interface LintCommandOptions extends CommandInputs {
  readonly logger?: LintCommandLogger;
  /** Write the JSON document to the stdout sink instead of logger lines. */
  readonly json?: boolean;
  /** List every repository finding in full instead of the count line. */
  readonly repository?: boolean;
}

/** Project the linted entries onto the JSON builder's view. */
function lintEntriesToJson(entries: readonly LintCommandEntry[]): LintJsonEntry[] {
  return entries.map((entry) => ({
    change: path.basename(entry.folder),
    valid: entry.result.valid,
    findings: entry.result.findings,
    repository: entry.result.repository,
  }));
}

/** Resolve an explicit id in any tree, falling back to the checkout's folder. */
async function resolveLintFolder(
  projectRoot: string,
  specsDir: string,
  config: OsqConfig,
  id: string,
): Promise<string> {
  try {
    const found = await findSteeringChange(projectRoot, config, id);
    if (found !== null) return found.change.folderPath;
    return await findSpecFolder(specsDir, id);
  } catch {
    return findSpecFolder(specsDir, id);
  }
}

async function listChangeFolders(specsDir: string): Promise<string[]> {
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(specsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory() && isActiveChangeFolderName(entry.name))
    .map((entry) => path.join(specsDir, entry.name))
    .sort();
}

/**
 * Lints one or more change folders (or every folder under the configured specs
 * root when no IDs are given), printing findings as before. When any folder is
 * invalid it throws a `CommandError` with an empty message and exit code 1.
 */
export async function lintCommand(
  specIds: string[] = [],
  options: LintCommandOptions = {},
): Promise<LintCommandResult> {
  const inputs = resolveInputs(options);
  const cwd = inputs.cwd;
  const config = await inputs.config();
  const specsDir = getChangesDir(config.paths.openspecRoot, cwd);
  const json = options.json === true;
  // JSON mode prints no logger lines and passes no logger into the lint pass,
  // so even the OpenSpec version info line stays out of the document.
  const logger = json ? null : (options.logger ?? commandLogger(options));

  const folders =
    specIds.length > 0
      ? await Promise.all(specIds.map((id) => resolveLintFolder(cwd, specsDir, config, id)))
      : await listChangeFolders(specsDir);

  const entries: LintCommandEntry[] = [];
  const importGraph =
    folders.length > 0 ? await buildImportGraph(cwd, { skip: [config.paths.openspecRoot] }) : null;
  for (const folder of folders) {
    const result = await lintChangeFolder(cwd, folder, config, {
      ...(logger ? { logger } : {}),
      ...(importGraph ? { importGraph } : {}),
    });
    entries.push({ folder, result });
    if (logger) {
      printChangeFindings(logger, path.basename(folder), result);
    }
  }

  const valid = entries.every((entry) => entry.result.valid);
  const repository = dedupeFindings(entries.flatMap((entry) => [...entry.result.repository]));

  if (json) {
    inputs.stdout(`${JSON.stringify(buildLintJson(valid, lintEntriesToJson(entries)))}\n`);
  } else if (logger) {
    if (options.repository === true) {
      printRepositoryFindings(logger, repository);
    } else {
      printRepositoryCount(logger, repository.length);
    }
  }

  if (!valid) {
    throw new CommandError('', { exitCode: 1 });
  }

  return { valid, entries };
}
