import { readFileSync } from 'node:fs';
import { Command, InvalidArgumentError } from 'commander';
import { approveCommand } from './approve.js';
import { doctorCommand } from './doctor.js';
import { doneCommand } from './done.js';
import { inboxCommand } from './inbox.js';
import { initCommand } from './init.js';
import { lintCommand } from './lint.js';
import { migrateCommand } from './migrate.js';
import { newCommand } from './new.js';
import { planCommand } from './plan.js';
import { queueCommand } from './queue.js';
import { rejectCommand } from './reject.js';
import { reportCommand } from './report.js';
import { retryCommand } from './retry.js';
import { setupCommand } from './setup.js';
import { showCommand } from './show.js';
import { statusCommand } from './status.js';
import { watchCommand } from './watch.js';

const PACKAGE_MANIFEST_URL = new URL('../../package.json', import.meta.url);

export function resolvePackageVersion(): string {
  const manifest = JSON.parse(readFileSync(PACKAGE_MANIFEST_URL, 'utf8')) as { version?: string };
  return manifest.version ?? '0.0.0';
}

/** Commander-level guard rejecting an empty or whitespace-only rejection reason. */
function parseRejectReason(value: string): string {
  if (!value || !value.trim()) {
    throw new InvalidArgumentError('a non-empty rejection reason is required');
  }
  return value;
}

export function createProgram(version?: string): Command {
  const program = new Command();
  // Keep root options (notably `--json`) from shadowing the identically named
  // option on subcommands such as `report --json`.
  program.enablePositionalOptions();

  program
    .name('osq')
    .description(
      'Strict spec queue. Spec-driven development with two kinds of agent and a human gate.',
    )
    .version(version ?? resolvePackageVersion())
    .option('--json', 'print the human attention inbox as JSON')
    .action(async (options: { json?: boolean }) => {
      await inboxCommand({ json: options.json });
    });

  program
    .command('init')
    .description('scaffold osq folders and configuration')
    .action(async () => {
      await initCommand();
    });

  program
    .command('new <name>')
    .description('new change folder from template')
    .action(async (name: string) => {
      await newCommand(name);
    });

  program
    .command('plan [name]')
    .description('initialize change, write brief, and open interactive planner session')
    .option('--brief <file>', 'brief file path or - for stdin')
    .option('-p, --print', 'output opening prompt strictly to stdout without launching session')
    .option('--next', 'plan the next eligible brief-queue item')
    .option('--replan', 'allow replanning a rejected first eligible queue item')
    .action(
      async (
        name: string | undefined,
        options: { brief?: string; print?: boolean; next?: boolean; replan?: boolean },
      ) => {
        try {
          await planCommand(name, options);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Error: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  program
    .command('lint [ids...]')
    .description('validate change folders and OpenSpec artifacts')
    .action(async (ids: string[]) => {
      await lintCommand(ids);
    });

  program
    .command('queue')
    .description('print the read-only brief queue projection')
    .action(async () => {
      await queueCommand();
    });

  program
    .command('approve <ids...>')
    .description('lint, hash, and approve change folders')
    .action(async (ids: string[]) => {
      await approveCommand(ids);
    });

  program
    .command('retry <id> <target>')
    .description('retry a dead or regressed task or change without deleting diagnostics')
    .action(async (id: string, target: string) => {
      await retryCommand(id, target);
    });

  program
    .command('reject <id>')
    .description('move an eligible active change intact into rejected history')
    .requiredOption('--reason <text>', 'reason for rejecting the change', parseRejectReason)
    .action(async (id: string, options: { reason: string }) => {
      await rejectCommand(id, options);
    });

  program
    .command('done <id> <task>')
    .description('mark a task done manually with required justification')
    .requiredOption('--manual <reason>', 'reason for manual completion')
    .action(async (id: string, task: string, options: { manual: string }) => {
      await doneCommand(id, task, options);
    });

  program
    .command('watch')
    .description('run the spec watcher loop')
    .option('-o, --once', 'run pending tasks in queue and exit')
    .option('--verbose', 'enable verbose logging')
    .option('-q, --quiet', 'suppress info and verbose logging')
    .option('--allow-stale', 'allow running when dist/ is older than src/')
    .option('--dev', 'run through tsx from src/ and restart the loop when files change')
    .action(
      async (options: {
        once?: boolean;
        verbose?: boolean;
        quiet?: boolean;
        allowStale?: boolean;
        dev?: boolean;
      }) => {
        await watchCommand(options);
      },
    );

  program
    .command('setup')
    .description('configure harness environment and configuration')
    .action(async () => {
      await setupCommand();
    });

  program
    .command('migrate <target>')
    .description('migrate a legacy layout to an OpenSpec layout')
    .action(async (target: string) => {
      await migrateCommand(target);
    });

  program
    .command('status')
    .description('show status overview of change folders and tasks')
    .action(async () => {
      await statusCommand();
    });

  program
    .command('show <id>')
    .description('show detailed change information, tasks, and event timeline')
    .action(async (id: string) => {
      await showCommand(id);
    });

  program
    .command('report')
    .description('display delivery metrics and task completion report')
    .option('--json', 'output report as raw JSON')
    .action(async (options: { json?: boolean }) => {
      await reportCommand(options);
    });

  program
    .command('doctor')
    .description('validate repository health, configuration, and archives')
    .action(async () => {
      await doctorCommand();
    });

  const origParse = program.parse.bind(program);
  program.parse = (argv?: readonly string[], parseOptions?: Parameters<Command['parse']>[1]) => {
    const raw = argv || process.argv;
    const normalized = raw.map((arg) => (arg === '-print' ? '--print' : arg));
    return origParse(normalized, parseOptions);
  };

  const origParseAsync = program.parseAsync.bind(program);
  program.parseAsync = async (
    argv?: readonly string[],
    parseOptions?: Parameters<Command['parseAsync']>[1],
  ) => {
    const raw = argv || process.argv;
    const normalized = raw.map((arg) => (arg === '-print' ? '--print' : arg));
    return await origParseAsync(normalized, parseOptions);
  };

  return program;
}
