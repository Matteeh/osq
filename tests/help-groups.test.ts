import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BARE_OSQ_LINE, COMMAND_GROUPS } from '../src/cli/help-groups.js';
import { createProgram } from '../src/cli/index.js';

const EXPECTED_GROUPS = [
  { title: 'Everyday', commands: ['inbox', 'plan', 'approve', 'land', 'retry', 'reject'] },
  { title: 'Setup and running', commands: ['init', 'setup', 'watch', 'server', 'mcp'] },
  {
    title: 'Inspection',
    commands: ['status', 'show', 'report', 'digest', 'query', 'spec', 'graph', 'serve', 'doctor'],
  },
  { title: 'Plumbing', commands: ['new', 'lint', 'queue', 'sync', 'message', 'migrate'] },
] as const;

const HEADINGS = EXPECTED_GROUPS.map((group) => `${group.title} commands:`);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function section(output: string, heading: string): string {
  const lines = output.split('\n');
  const start = lines.findIndex((line) => line === heading);
  assert.notEqual(start, -1, `missing heading: ${heading}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.endsWith(' commands:') || line === 'Options:');
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

function firstTokens(block: string): string[] {
  return block
    .split('\n')
    .filter((line) => /^ {2}\S/.test(line))
    .map((line) => {
      const match = line.trimStart().match(/^\S+/);
      return match ? match[0] : '';
    })
    .filter((token) => token.length > 0);
}

describe('root help command groups', () => {
  it('prints the bare-osq line after the description and before the options', () => {
    const help = createProgram('0.0.0').helpInformation();
    const bare = help.indexOf(BARE_OSQ_LINE);
    const options = help.indexOf('Options:');
    assert.ok(bare >= 0, 'bare-osq line is missing');
    assert.ok(options >= 0, 'Options: heading is missing');
    assert.ok(bare < options, 'bare-osq line must come before the options');
  });

  it('prints the four group headings in order', () => {
    const help = createProgram('0.0.0').helpInformation();
    const positions = HEADINGS.map((heading) => help.indexOf(`\n${heading}\n`));
    assert.ok(
      positions.every((position) => position >= 0),
      `one or more headings are missing: ${HEADINGS.join(', ')}`,
    );
    for (let index = 1; index < positions.length; index += 1) {
      assert.ok(
        positions[index] > positions[index - 1],
        `${HEADINGS[index]} must come after ${HEADINGS[index - 1]}`,
      );
    }
  });

  it('lists the everyday commands in order', () => {
    const help = createProgram('0.0.0').helpInformation();
    assert.deepEqual(firstTokens(section(help, 'Everyday commands:')), [
      'inbox',
      'plan',
      'approve',
      'land',
      'retry',
      'reject',
    ]);
  });

  it('starts exactly one row for every registered command', () => {
    const program = createProgram('0.0.0');
    const help = program.helpInformation();
    for (const command of program.commands) {
      const name = command.name();
      const pattern = new RegExp(`^ {2}${escapeRegExp(name)}(?:\\s|$)`, 'gm');
      const matches = help.match(pattern) ?? [];
      assert.equal(
        matches.length,
        1,
        `${name} must start exactly one row, found ${matches.length}`,
      );
    }
  });

  it('prints no flat Commands or Other commands heading', () => {
    const help = createProgram('0.0.0').helpInformation();
    const trimmed = help.split('\n').map((line) => line.trim());
    assert.ok(!trimmed.includes('Commands:'), 'flat Commands: heading must be gone');
    assert.ok(!trimmed.includes('Other commands:'), 'Other commands: heading must not print');
  });

  it('COMMAND_GROUPS names exactly the registered commands', () => {
    const program = createProgram('0.0.0');
    const registered = program.commands.map((command) => command.name()).sort();
    const named = COMMAND_GROUPS.flatMap((group) => [...group.commands]);
    assert.deepEqual([...named].sort(), registered);
    assert.equal(new Set(named).size, named.length, 'a command is named in more than one group');
  });

  it('COMMAND_GROUPS matches the required groups in order', () => {
    assert.deepEqual(COMMAND_GROUPS, EXPECTED_GROUPS);
  });
});

describe('subcommand help', () => {
  it('keeps commander default help with no group heading or bare-osq line', () => {
    const program = createProgram('0.0.0');
    for (const command of program.commands) {
      const help = command.helpInformation();
      assert.ok(
        help.startsWith(`Usage: osq ${command.name()}`),
        `${command.name()} help must start with its usage line, got: ${help.slice(0, 40)}`,
      );
      assert.ok(!help.includes(' commands:'), `${command.name()} help must carry no group heading`);
      assert.ok(
        !help.includes(BARE_OSQ_LINE),
        `${command.name()} help must carry no bare-osq line`,
      );
    }
  });
});
