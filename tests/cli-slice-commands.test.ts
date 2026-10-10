import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Command } from 'commander';
import { COMMAND_GROUPS, commandGroups } from '../src/cli/help-groups.js';
import { createProgram } from '../src/cli/index.js';
import type { HelpGroupTitle, Slice, SliceCommand } from '../src/cli/slice-types.js';

/** One slice command that adds a described commander command, unless `add` is false. */
function sliceCommand(
  name: string,
  group: HelpGroupTitle,
  options: { description?: string; add?: boolean } = {},
): SliceCommand {
  const { description = name, add = true } = options;
  return {
    name,
    group,
    register: (program: Command) => {
      if (add) program.command(name).description(description);
    },
  };
}

/** One hand-built slice with the commands it declares. */
function slice(name: string, commands: SliceCommand[]): Slice {
  return { name, commands };
}

/** The non-empty command rows of one group block in a root help string. */
function groupRows(help: string, heading: string): string[] {
  const lines = help.split('\n');
  const start = lines.indexOf(heading);
  assert.notEqual(start, -1, `missing heading: ${heading}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.endsWith(' commands:') || line === 'Options:');
  const block = end === -1 ? rest : rest.slice(0, end);
  return block.filter((line) => /^ {2}\S/.test(line));
}

/** Commander's own help for a subcommand named `name`. */
function defaultSubcommandHelp(name: string, description: string): string {
  const program = new Command();
  program.name('osq');
  program.command(name).description(description);
  const child = program.commands.find((command) => command.name() === name);
  assert.ok(child, `reference program has no ${name} command`);
  return child.helpInformation();
}

describe('A slice command joins its help group', () => {
  it('registers the command and lists it last in its declared group', () => {
    const widgets = slice('widgets', [
      sliceCommand('widgets', 'Plumbing', { description: 'list the widgets' }),
    ]);
    const program = createProgram('0.0.0', [widgets]);

    const added = program.commands.find((command) => command.name() === 'widgets');
    assert.ok(added, 'the program has a widgets command');
    assert.equal(added.description(), 'list the widgets');

    const help = program.helpInformation();
    const rows = groupRows(help, 'Plumbing commands:');
    const last = rows.at(-1);
    assert.ok(last, 'the Plumbing group has rows');
    assert.ok(last.startsWith('  widgets'), `last Plumbing row is ${JSON.stringify(last)}`);
    assert.ok(last.includes('list the widgets'), `last Plumbing row is ${JSON.stringify(last)}`);
  });

  it("prints commander's own default help for the command", () => {
    const widgets = slice('widgets', [
      sliceCommand('widgets', 'Plumbing', { description: 'list the widgets' }),
    ]);
    const program = createProgram('0.0.0', [widgets]);
    const added = program.commands.find((command) => command.name() === 'widgets');
    assert.ok(added, 'the program has a widgets command');

    assert.equal(added.helpInformation(), defaultSubcommandHelp('widgets', 'list the widgets'));
  });
});

describe('Slice commands placed by group', () => {
  it('returns COMMAND_GROUPS for no slices', () => {
    assert.deepEqual(commandGroups([]), COMMAND_GROUPS);
  });

  it('appends a slice command after the last command of its group', () => {
    const widgets = slice('widgets', [sliceCommand('widgets', 'Plumbing')]);
    const plumbing = commandGroups([widgets]).find((group) => group.title === 'Plumbing');
    assert.deepEqual(plumbing?.commands, [
      'new',
      'lint',
      'queue',
      'sync',
      'message',
      'migrate',
      'capability',
      'widgets',
    ]);
  });

  it('keeps registry order for two slice commands in one group', () => {
    const slices = [
      slice('widgets', [sliceCommand('widgets', 'Plumbing')]),
      slice('gizmos', [sliceCommand('gizmos', 'Plumbing')]),
    ];
    const plumbing = commandGroups(slices).find((group) => group.title === 'Plumbing');
    assert.deepEqual(plumbing?.commands.slice(-3), ['capability', 'widgets', 'gizmos']);
  });

  it('keeps an existing command in place when it declares its group', () => {
    const landing = slice('landing', [sliceCommand('land', 'Everyday')]);
    assert.deepEqual(commandGroups([landing]), COMMAND_GROUPS);
  });

  it('throws when an existing command declares another group', () => {
    const landing = slice('landing', [sliceCommand('land', 'Plumbing')]);
    assert.throws(
      () => commandGroups([landing]),
      /^Error: slice landing: command land is listed under Everyday, not Plumbing$/,
    );
  });

  it('returns new arrays and leaves COMMAND_GROUPS unchanged', () => {
    assert.notEqual(commandGroups([]), COMMAND_GROUPS);
    assert.notEqual(commandGroups([])[0]?.commands, COMMAND_GROUPS[0]?.commands);
    const before = JSON.stringify(COMMAND_GROUPS);
    commandGroups([slice('widgets', [sliceCommand('widgets', 'Plumbing')])]);
    assert.equal(JSON.stringify(COMMAND_GROUPS), before);
  });
});

describe('A slice command that clashes or goes missing', () => {
  it('throws when a command of that name is already registered', () => {
    const widgets = slice('widgets', [sliceCommand('status', 'Inspection', { add: false })]);
    assert.throws(
      () => createProgram('0.0.0', [widgets]),
      /^Error: slice widgets: command status is already registered$/,
    );
  });

  it('throws when register adds no command of that name', () => {
    const widgets = slice('widgets', [sliceCommand('widgets', 'Plumbing', { add: false })]);
    assert.throws(
      () => createProgram('0.0.0', [widgets]),
      /^Error: slice widgets: register did not add command widgets$/,
    );
  });
});
