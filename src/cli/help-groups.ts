import { Help } from 'commander';
import type { Command } from 'commander';

export interface CommandGroup {
  readonly title: string;
  readonly commands: readonly string[];
}

export const BARE_OSQ_LINE = 'Run osq with no command first: it shows what needs you.';

export const COMMAND_GROUPS: readonly CommandGroup[] = [
  { title: 'Everyday', commands: ['inbox', 'plan', 'approve', 'land', 'retry', 'reject'] },
  { title: 'Setup and running', commands: ['init', 'setup', 'watch'] },
  {
    title: 'Inspection',
    commands: ['status', 'show', 'report', 'digest', 'query', 'spec', 'graph', 'serve', 'doctor'],
  },
  { title: 'Plumbing', commands: ['new', 'lint', 'queue', 'sync', 'message', 'migrate'] },
];

function commandRow(command: Command, helper: Help, termWidth: number): string {
  return helper.formatItem(
    helper.styleSubcommandTerm(helper.subcommandTerm(command)),
    termWidth,
    helper.styleSubcommandDescription(helper.subcommandDescription(command)),
    helper,
  );
}

function formatRootHelp(cmd: Command, helper: Help): string {
  const termWidth = helper.padWidth(cmd, helper);
  const helpWidth = helper.helpWidth ?? 80;
  const output: string[] = [
    `${helper.styleTitle('Usage:')} ${helper.styleUsage(helper.commandUsage(cmd))}`,
    '',
  ];

  const description = helper.commandDescription(cmd);
  if (description.length > 0) {
    output.push(helper.boxWrap(helper.styleCommandDescription(description), helpWidth), '');
  }
  output.push(helper.boxWrap(helper.styleDescriptionText(BARE_OSQ_LINE), helpWidth), '');

  const optionRows = helper.visibleOptions(cmd).map((option) => {
    return helper.formatItem(
      helper.styleOptionTerm(helper.optionTerm(option)),
      termWidth,
      helper.styleOptionDescription(helper.optionDescription(option)),
      helper,
    );
  });
  if (optionRows.length > 0) {
    output.push(helper.styleTitle('Options:'), ...optionRows, '');
  }

  const visible = helper.visibleCommands(cmd);
  const byName = new Map(visible.map((command) => [command.name(), command]));
  const grouped = new Set<string>();
  for (const group of COMMAND_GROUPS) {
    const rows: string[] = [];
    for (const name of group.commands) {
      grouped.add(name);
      const command = byName.get(name);
      if (command) rows.push(commandRow(command, helper, termWidth));
    }
    if (rows.length > 0) {
      output.push(helper.styleTitle(`${group.title} commands:`), ...rows, '');
    }
  }

  const other = visible.filter((command) => !grouped.has(command.name()));
  if (other.length > 0) {
    output.push(
      helper.styleTitle('Other commands:'),
      ...other.map((command) => commandRow(command, helper, termWidth)),
      '',
    );
  }

  return output.join('\n');
}

export function configureGroupedHelp(program: Command): void {
  program.configureHelp({
    formatHelp(cmd, helper) {
      if (cmd !== program) {
        return Help.prototype.formatHelp.call(helper, cmd, helper);
      }
      return formatRootHelp(cmd, helper);
    },
  });
}
