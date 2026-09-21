import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';

describe('osq CLI', () => {
  it('configures program metadata and registered commands', () => {
    const program = createProgram();

    assert.equal(program.name(), 'osq');
    assert.ok(program.description().includes('Strict spec queue'));

    const commandNames = program.commands.map((cmd) => cmd.name());
    assert.ok(commandNames.includes('init'));
    assert.ok(commandNames.includes('new'));
    assert.ok(commandNames.includes('approve'));
    assert.ok(commandNames.includes('watch'));
    assert.ok(commandNames.includes('setup'));
  });

  it('configures new command with required argument <name>', () => {
    const program = createProgram();
    const newCmd = program.commands.find((cmd) => cmd.name() === 'new');

    assert.ok(newCmd);
    assert.equal(newCmd.registeredArguments[0].name(), 'name');
    assert.equal(newCmd.registeredArguments[0].required, true);
  });

  it('configures approve command with variadic argument <ids...>', () => {
    const program = createProgram();
    const approveCmd = program.commands.find((cmd) => cmd.name() === 'approve');

    assert.ok(approveCmd);
    assert.equal(approveCmd.registeredArguments[0].name(), 'ids');
    assert.equal(approveCmd.registeredArguments[0].variadic, true);
  });

  it('configures watch command with once option', () => {
    const program = createProgram();
    const watchCmd = program.commands.find((cmd) => cmd.name() === 'watch');

    assert.ok(watchCmd);
    const onceOption = watchCmd.options.find((o) => o.short === '-o' || o.long === '--once');
    assert.ok(onceOption);
  });

  it('configures reject command with required id argument and required reason option', () => {
    const program = createProgram();
    const rejectCmd = program.commands.find((cmd) => cmd.name() === 'reject');

    assert.ok(rejectCmd);
    assert.equal(rejectCmd.registeredArguments[0].name(), 'id');
    assert.equal(rejectCmd.registeredArguments[0].required, true);

    const reasonOption = rejectCmd.options.find((o) => o.long === '--reason');
    assert.ok(reasonOption);
    assert.equal(reasonOption.required, true);
  });

  it('rejects an empty or whitespace-only reason at the CLI boundary', async () => {
    const whitespace = createProgram();
    whitespace.exitOverride();
    whitespace.commands.find((cmd) => cmd.name() === 'reject')?.exitOverride();
    await assert.rejects(() =>
      whitespace.parseAsync(['node', 'osq', 'reject', '001', '--reason', '   ']),
    );

    const empty = createProgram();
    empty.exitOverride();
    empty.commands.find((cmd) => cmd.name() === 'reject')?.exitOverride();
    await assert.rejects(() => empty.parseAsync(['node', 'osq', 'reject', '001', '--reason', '']));
  });

  it('requires the reject reason option to be supplied', async () => {
    const program = createProgram();
    program.exitOverride();
    program.commands.find((cmd) => cmd.name() === 'reject')?.exitOverride();
    await assert.rejects(() => program.parseAsync(['node', 'osq', 'reject', '001']));
  });

  it('gives the root command an action and a --json inbox option', () => {
    const program = createProgram();

    assert.ok(program.options.some((option) => option.long === '--json'));
    assert.equal(
      typeof (program as unknown as { _actionHandler?: unknown })._actionHandler,
      'function',
      'bare osq should run the inbox instead of Commander help',
    );
  });

  it('keeps report --json scoped to the report subcommand', () => {
    const program = createProgram();
    const report = program.commands.find((cmd) => cmd.name() === 'report');

    assert.ok(report?.options.some((option) => option.long === '--json'));
  });
});
