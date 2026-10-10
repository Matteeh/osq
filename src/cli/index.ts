import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { registerApproveCommand } from './approve.js';
import { registerCapabilityCommand } from './capability.js';
import { CommandError } from './command-error.js';
import { registerDigestCommand } from './digest.js';
import { registerDoctorCommand } from './doctor.js';
import { registerGraphCommand } from './graph.js';
import { configureGroupedHelp } from './help-groups.js';
import { registerInboxDispatchCommand } from './inbox-dispatch.js';
import { inboxCommand } from './inbox.js';
import { initCommand } from './init.js';
import { registerLandCommand } from './land.js';
import { lintCommand } from './lint.js';
import { registerMcpCommand } from './mcp.js';
import { registerMessageCommand } from './message.js';
import { migrateCommand } from './migrate.js';
import { newCommand } from './new.js';
import { planCommand } from './plan.js';
import { registerQueryCommand } from './query.js';
import { queueCommand } from './queue.js';
import { parseRejectReason, rejectCommand } from './reject.js';
import { reportCommand } from './report.js';
import { retryCommand } from './retry.js';
import { parsePortArgument, serveCommand } from './serve.js';
import { registerServerCommand } from './server.js';
import { setupCommand } from './setup.js';
import { showCommand } from './show.js';
import { registerSpecCommand } from './spec.js';
import { statusCommand } from './status.js';
import { registerSyncCommand } from './sync.js';
import { watchCommand } from './watch.js';

const PACKAGE_MANIFEST_URL = new URL('../../package.json', import.meta.url);

export function resolvePackageVersion(): string {
  const manifest = JSON.parse(readFileSync(PACKAGE_MANIFEST_URL, 'utf8')) as { version?: string };
  return manifest.version ?? '0.0.0';
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
    .option(
      '--refresh-schema',
      'overwrite scaffolded OpenSpec schema files from installed templates',
    )
    .action(async (options: { refreshSchema?: boolean }) => {
      await initCommand({ refreshSchema: options.refreshSchema });
    });

  program
    .command('new <name>')
    .description('new change folder from template')
    .action(async (name: string) => {
      await newCommand(name);
    });

  program
    .command('plan [name]')
    .description('prepare a change and hand off its opening prompt to your planning tool')
    .option('--brief <file>', 'brief file path or - for stdin')
    .option('-p, --print', 'output opening prompt strictly to stdout without launching session')
    .option('--session', 'launch the configured interactive planner session instead of handing off')
    .option('--next', 'plan the next eligible brief-queue item')
    .option('--replan', 'allow replanning a rejected first eligible queue item')
    .action(
      async (
        name: string | undefined,
        options: {
          brief?: string;
          print?: boolean;
          session?: boolean;
          next?: boolean;
          replan?: boolean;
        },
      ) => {
        try {
          await planCommand(name, options);
        } catch (error) {
          if (error instanceof CommandError) throw error;
          const message = error instanceof Error ? error.message : String(error);
          throw new CommandError(`Error: ${message}`);
        }
      },
    );

  program
    .command('lint [ids...]')
    .description('validate change folders and OpenSpec artifacts')
    .option('--json', 'print findings as JSON')
    .option('--repository', 'list every repository finding')
    .action(async (ids: string[], options: { json?: boolean; repository?: boolean }) => {
      await lintCommand(ids, options);
    });

  program
    .command('queue')
    .description('print the read-only brief queue projection')
    .action(async () => {
      await queueCommand();
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
    .command('watch')
    .description('run the spec watcher loop')
    .option('-o, --once', 'run pending tasks in queue and exit')
    .option('--verbose', 'enable verbose logging')
    .option('-q, --quiet', 'suppress info and verbose logging')
    .option('--allow-stale', 'allow running when dist/ is older than src/')
    .option('--dev', 'run through tsx from src/ and restart the loop when files change')
    .option('--background', 'run the watcher as a background service')
    .option('--stop', 'stop the background service')
    .action(
      async (options: {
        once?: boolean;
        verbose?: boolean;
        quiet?: boolean;
        allowStale?: boolean;
        dev?: boolean;
        background?: boolean;
        stop?: boolean;
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
    .option('--json', 'print change details and digest as JSON')
    .action(async (id: string, options: { json?: boolean }) => {
      await showCommand(id, { json: options.json });
    });

  program
    .command('report')
    .description('display delivery metrics and task completion report')
    .option('--json', 'output report as raw JSON')
    .option('--since <date>', 'start of the Inbox waiting period')
    .option('--until <date>', 'end of the Inbox waiting period')
    .action(async (options: { json?: boolean; since?: string; until?: string }) => {
      await reportCommand(options);
    });

  registerDigestCommand(program);
  registerDoctorCommand(program);
  registerQueryCommand(program);

  program
    .command('serve')
    .description(
      'serve the delivery dashboard on loopback; approve, land, reject and retry from the browser',
    )
    .option('--port <n>', 'loopback port from 0 through 65535', parsePortArgument)
    .option('--open', 'open the dashboard URL in the default browser')
    .option('--export <dir>', 'write a static dashboard snapshot to <dir> and exit')
    .action(async (options: { port?: number; open?: boolean; exportDir?: string }) => {
      try {
        await serveCommand(options);
      } catch (error) {
        if (error instanceof CommandError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new CommandError(`Error: ${message}`);
      }
    });
  registerApproveCommand(program);
  registerCapabilityCommand(program);
  registerGraphCommand(program);
  registerInboxDispatchCommand(program);
  registerLandCommand(program);
  registerMcpCommand(program);
  registerMessageCommand(program);
  registerServerCommand(program);
  registerSpecCommand(program);
  registerSyncCommand(program);
  configureGroupedHelp(program);
  const normalize = (argv: readonly string[]): string[] =>
    argv.map((arg) => (arg === '-print' ? '--print' : arg));
  const origParse = program.parse.bind(program);
  program.parse = (argv, parseOptions) => origParse(normalize(argv || process.argv), parseOptions);
  const origParseAsync = program.parseAsync.bind(program);
  program.parseAsync = async (argv, parseOptions) =>
    await origParseAsync(normalize(argv || process.argv), parseOptions);

  return program;
}
