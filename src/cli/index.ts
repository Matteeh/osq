#!/usr/bin/env node
import { Command } from 'commander';
import { approveCommand } from './approve.js';
import { initCommand } from './init.js';
import { newCommand } from './new.js';

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

  return program;
}

// If executed directly from CLI binary
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const program = createProgram();
  program.parse();
}
