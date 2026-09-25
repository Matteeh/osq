import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { type Logger, createLogger } from '../core/foundation/logger.js';
import { findSpecFolder } from '../core/spec/approve.js';
import { buildImportGraph } from '../core/spec/import-graph.js';
import {
  type LintJsonEntry,
  buildLintJson,
  dedupeFindings,
  printChangeFindings,
  printRepositoryFindings,
} from '../core/spec/lint-output.js';
import { type LintResult, lintChangeFolder } from '../core/spec/linter.js';
import { getChangesDir, isActiveChangeFolderName } from '../core/status/layout.js';

export interface LintCommandEntry {
  readonly folder: string;
  readonly result: LintResult;
}

export interface LintCommandResult {
  readonly valid: boolean;
  readonly entries: LintCommandEntry[];
}

export type LintCommandLogger = Pick<Logger, 'info' | 'verbose' | 'warn' | 'error'>;

export interface LintCommandOptions {
  readonly cwd?: string;
  readonly config?: OsqConfig;
  readonly logger?: LintCommandLogger;
  readonly exit?: (code: number) => void;
  /** Write the JSON document to the stdout sink instead of logger lines. */
  readonly json?: boolean;
  readonly stdout?: (text: string) => void;
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
 * root when no IDs are given) and exits non-zero on failure. The exit sink is
 * injectable so callers can test the failure path without terminating the
 * process.
 */
export async function lintCommand(
  specIds: string[] = [],
  options: LintCommandOptions = {},
): Promise<LintCommandResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = options.config ?? (await loadConfig(cwd));
  const specsDir = getChangesDir(config.paths.openspecRoot, cwd);
  const json = options.json === true;
  // JSON mode prints no logger lines and passes no logger into the lint pass,
  // so even the OpenSpec version info line stays out of the document.
  const logger = json ? null : (options.logger ?? createLogger('normal', 'osq'));

  const folders =
    specIds.length > 0
      ? await Promise.all(specIds.map((id) => findSpecFolder(specsDir, id)))
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
    const stdout = options.stdout ?? ((text: string) => process.stdout.write(text));
    stdout(`${JSON.stringify(buildLintJson(valid, lintEntriesToJson(entries)))}\n`);
  } else if (logger) {
    printRepositoryFindings(logger, repository);
  }

  if (!valid) {
    const exit =
      options.exit ??
      ((code: number) => {
        process.exitCode = code;
      });
    exit(1);
  }

  return { valid, entries };
}
