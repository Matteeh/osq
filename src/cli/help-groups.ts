import { Help } from 'commander';
import type { Command } from 'commander';
import type { Slice } from './slice-types.js';

export interface CommandGroup {
  readonly title: string;
  readonly commands: readonly string[];
}

/** The mutable group shape `commandGroups` builds before returning it. */
interface MutableCommandGroup {
  title: string;
  commands: string[];
}

export const BARE_OSQ_LINE = 'Run osq with no command first: it shows what needs you.';

export const COMMAND_GROUPS: readonly CommandGroup[] = [
  { title: 'Everyday', commands: ['inbox', 'plan', 'approve', 'land', 'retry', 'reject'] },
  { title: 'Setup and running', commands: ['init', 'setup', 'watch', 'server', 'mcp'] },
  {
    title: 'Inspection',
    commands: ['status', 'show', 'report', 'digest', 'query', 'spec', 'graph', 'serve', 'doctor'],
  },
  {
    title: 'Plumbing',
    commands: ['new', 'lint', 'queue', 'sync', 'message', 'migrate', 'capability'],
  },
];

/**
 * Return the groups of `createProgram`'s own commands with each slice command
 * added: a command `COMMAND_GROUPS` already names keeps its place and must
 * declare that group, and any other is appended to its declared group, in
 * registry order. The returned arrays are new; `COMMAND_GROUPS` is unchanged.
 *
 * @scenario cli-foundation: Slice commands placed by group
 * @scenario cli-foundation: Every command once
 * @adr 016
 */
export function commandGroups(slices: readonly Slice[]): CommandGroup[] {
  const groups: MutableCommandGroup[] = COMMAND_GROUPS.map((group) => ({
    title: group.title,
    commands: [...group.commands],
  }));
  const byTitle = new Map(groups.map((group) => [group.title, group]));
  const named = new Map<string, string>();
  for (const group of groups) {
    for (const name of group.commands) named.set(name, group.title);
  }
  for (const slice of slices) {
    for (const command of slice.commands ?? []) {
      const existing = named.get(command.name);
      if (existing !== undefined) {
        if (existing !== command.group) {
          throw new Error(
            `slice ${slice.name}: command ${command.name} is listed under ${existing}, not ${command.group}`,
          );
        }
        continue;
      }
      byTitle.get(command.group)?.commands.push(command.name);
      named.set(command.name, command.group);
    }
  }
  return groups;
}

/**
 * Register every command each slice declares, in registry order, after
 * `createProgram`'s own commands. A name already on the program, and a
 * register that then adds no command of its name, are both refused.
 *
 * @scenario cli-foundation: A slice command joins its help group
 * @scenario cli-foundation: A slice command that clashes or goes missing
 * @adr 016
 */
export function registerSliceCommands(program: Command, slices: readonly Slice[]): void {
  for (const slice of slices) {
    for (const command of slice.commands ?? []) {
      if (program.commands.some((existing) => existing.name() === command.name)) {
        throw new Error(`slice ${slice.name}: command ${command.name} is already registered`);
      }
      command.register(program);
      if (!program.commands.some((existing) => existing.name() === command.name)) {
        throw new Error(`slice ${slice.name}: register did not add command ${command.name}`);
      }
    }
  }
}

function commandRow(command: Command, helper: Help, termWidth: number): string {
  return helper.formatItem(
    helper.styleSubcommandTerm(helper.subcommandTerm(command)),
    termWidth,
    helper.styleSubcommandDescription(helper.subcommandDescription(command)),
    helper,
  );
}

function formatRootHelp(cmd: Command, helper: Help, groups: readonly CommandGroup[]): string {
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
  for (const group of groups) {
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

/**
 * Install `program`'s root help from `groups`, keeping every subcommand's own
 * help unchanged.
 *
 * @scenario cli-foundation: A slice command joins its help group
 * @scenario cli-foundation: Every command once
 * @adr 016
 */
export function configureGroupedHelp(program: Command, groups: readonly CommandGroup[]): void {
  program.configureHelp({
    formatHelp(cmd, helper) {
      if (cmd !== program) {
        return Help.prototype.formatHelp.call(helper, cmd, helper);
      }
      return formatRootHelp(cmd, helper, groups);
    },
  });
}
