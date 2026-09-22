import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { type Logger, createLogger } from '../core/foundation/logger.js';
import { findSpecFolder } from '../core/spec/approve.js';
import { type LintResult, lintChangeFolder } from '../core/spec/linter.js';
import { getChangesDir } from '../core/status/layout.js';

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
}

async function listChangeFolders(specsDir: string): Promise<string[]> {
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(specsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter(
      (entry) => entry.isDirectory() && entry.name !== 'archive' && !entry.name.startsWith('_'),
    )
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
  const logger = options.logger ?? createLogger('normal', 'osq');
  const specsDir = getChangesDir(config.paths.openspecRoot, cwd);

  const folders =
    specIds.length > 0
      ? await Promise.all(specIds.map((id) => findSpecFolder(specsDir, id)))
      : await listChangeFolders(specsDir);

  const entries: LintCommandEntry[] = [];
  for (const folder of folders) {
    const name = path.basename(folder);
    const result = await lintChangeFolder(cwd, folder, config, { logger });

    for (const error of result.errors) {
      logger.error(`${name}: ${error}`);
    }
    for (const warning of result.warnings) {
      logger.warn(`${name}: ${warning}`);
    }
    if (result.valid) {
      logger.info(`${name}: valid`);
    }

    entries.push({ folder, result });
  }

  const valid = entries.every((entry) => entry.result.valid);
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
