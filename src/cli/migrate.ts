import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { type Logger, createLogger } from '../core/foundation/logger.js';
import { type MigrateSidecarsResult, migrateSidecars } from '../core/spec/migrate-sidecars.js';
import { type MigrateResult, migrateToOpenSpec } from '../core/spec/migrate.js';
import { CommandError } from './command-error.js';

export interface MigrateCommandOptions {
  readonly cwd?: string;
  readonly config?: OsqConfig;
  readonly logger?: Pick<Logger, 'info' | 'error'>;
}

export type MigrateCommandLogger = Pick<Logger, 'info' | 'error'>;

/**
 * Runs `osq migrate <target>`. The `openspec` target moves the legacy layout to
 * `openspec/`, converts `spec.md` to `proposal.md`, ticks archived tasks, and
 * creates the next-spec stub; the `sidecars` target scaffolds an `osq.yml` for
 * every living capability without one. Returns the migration's result on
 * success; an unsupported target or a failed migration logs as before and
 * throws a `CommandError` with an empty message and exit code 1.
 */
export function migrateCommand(
  target: 'openspec',
  options?: MigrateCommandOptions,
): Promise<MigrateResult>;
export function migrateCommand(
  target: 'sidecars',
  options?: MigrateCommandOptions,
): Promise<MigrateSidecarsResult>;
export function migrateCommand(
  target: string,
  options?: MigrateCommandOptions,
): Promise<MigrateResult | MigrateSidecarsResult>;
export async function migrateCommand(
  target: string,
  options: MigrateCommandOptions = {},
): Promise<MigrateResult | MigrateSidecarsResult> {
  const cwd = options.cwd ?? process.cwd();
  const logger = options.logger ?? createLogger('normal', 'osq');

  if (target !== 'openspec' && target !== 'sidecars') {
    logger.error(`unsupported migrate target "${target}"; expected "openspec" or "sidecars"`);
    throw new CommandError('', { exitCode: 1 });
  }

  try {
    const config = options.config ?? (await loadConfig(cwd));

    if (target === 'sidecars') {
      const result = await migrateSidecars({ cwd, openspecRoot: config.paths.openspecRoot });
      logger.info(`wrote ${result.written.length} sidecar(s)`);
      for (const capability of result.written) {
        logger.info(`  ${capability}`);
      }
      return result;
    }

    const result = await migrateToOpenSpec({ cwd, config });

    logger.info(`migrated ${result.migratedFeatures.length} feature doc(s) to openspec/specs/`);
    logger.info(`migrated ${result.migratedChanges.length} active change(s) to openspec/changes/`);
    logger.info(
      `migrated ${result.migratedArchives.length} archived change(s) to openspec/changes/archive/`,
    );
    logger.info(`converted ${result.convertedProposals.length} spec.md file(s) to proposal.md`);
    logger.info(`ticked ${result.tickedTasks.length} archived tasks.md file(s)`);
    if (result.createdStub) {
      logger.info(`created next-spec stub ${result.createdStub}`);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`migration failed: ${message}`);
    throw new CommandError('', { exitCode: 1 });
  }
}
