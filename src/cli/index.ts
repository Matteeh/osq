import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { approveCommand } from './approve.js';
import { initCommand } from './init.js';
import { lintCommand } from './lint.js';
import { migrateCommand } from './migrate.js';
import { newCommand } from './new.js';
import { reportCommand } from './report.js';
import { setupCommand } from './setup.js';
import { showCommand } from './show.js';
import { statusCommand } from './status.js';
import { watchCommand } from './watch.js';

const PACKAGE_MANIFEST_URL = new URL('../../package.json', import.meta.url);

export function resolvePackageVersion(): string {
  const manifest = JSON.parse(readFileSync(PACKAGE_MANIFEST_URL, 'utf8')) as { version?: string };
  return manifest.version ?? '0.0.0';
}

export function createProgram(version?: string): Command {
  const program = new Command();

  program
    .name('osq')
    .description(
      'Strict spec queue. Spec-driven development with two kinds of agent and a human gate.',
    )
    .version(version ?? resolvePackageVersion());

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
    .command('lint [ids...]')
    .description('validate change folders and OpenSpec artifacts')
    .action(async (ids: string[]) => {
      await lintCommand(ids);
    });

  program
    .command('approve <ids...>')
    .description('lint, hash, and approve change folders')
    .action(async (ids: string[]) => {
      await approveCommand(ids);
    });

  program
    .command('watch')
    .description('run the spec watcher loop')
    .option('-o, --once', 'run pending tasks in queue and exit')
    .option('--verbose', 'enable verbose logging')
    .option('-q, --quiet', 'suppress info and verbose logging')
    .action(async (options: { once?: boolean; verbose?: boolean; quiet?: boolean }) => {
      await watchCommand(options);
    });

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

  return program;
}
