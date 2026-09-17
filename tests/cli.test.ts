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
});
