import { Command } from 'commander';
import { approveCommand } from './approve.js';
import { initCommand } from './init.js';
import { newCommand } from './new.js';
import { reportCommand } from './report.js';
import { setupCommand } from './setup.js';
import { showCommand } from './show.js';
import { statusCommand } from './status.js';
import { watchCommand } from './watch.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('osq')
    .description(
      'Strict spec queue. Spec-driven development with two kinds of agent and a human gate.',
    )
    .version('0.1.0');

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
