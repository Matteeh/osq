import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CommandError } from '../src/cli/command-error.js';
import { createProgram } from '../src/cli/index.js';
import { specCommand } from '../src/cli/spec.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { lookupRequirement } from '../src/core/spec/requirement-lookup.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPENSPEC_ROOT = DEFAULT_CONFIG.paths.openspecRoot;

const ALPHA_SPEC = `# alpha Specification

## Purpose

Alpha purpose.

## Requirements

### Requirement: Second rule

The second rule SHALL hold.

#### Scenario: Second holds
- **WHEN** second runs
- **THEN** it holds

### Requirement: First rule

The first rule SHALL hold.

#### Scenario: First holds
- **WHEN** first runs
- **THEN** it holds
`;

const BETA_SPEC = `# beta Specification

## Purpose

Beta purpose.

## Requirements

### Requirement: Beta rule

The beta rule SHALL hold.

#### Scenario: Beta holds
- **WHEN** beta runs
- **THEN** it holds
`;

const FIRST_RULE_BLOCK = `### Requirement: First rule

The first rule SHALL hold.

#### Scenario: First holds
- **WHEN** first runs
- **THEN** it holds`;

/** Write one capability's living spec under the temporary project. */
async function writeSpec(projectRoot: string, capability: string, content: string): Promise<void> {
  const dir = path.join(projectRoot, OPENSPEC_ROOT, 'specs', capability);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'spec.md'), content, 'utf8');
}

describe('osq spec', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-spec-command-'));
    await scaffoldProject(tmpDir);
    await writeSpec(tmpDir, 'alpha', ALPHA_SPEC);
    await writeSpec(tmpDir, 'beta', BETA_SPEC);
    await fs.mkdir(path.join(tmpDir, OPENSPEC_ROOT, 'specs', 'gamma'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('living requirement lookup', () => {
    it('lists the living capabilities in name order and skips empty directories', async () => {
      const result = await lookupRequirement(tmpDir, OPENSPEC_ROOT);

      assert.deepEqual(result, ['alpha', 'beta']);
    });

    it('lists a capability requirement names in spec order', async () => {
      const result = await lookupRequirement(tmpDir, OPENSPEC_ROOT, 'alpha');

      assert.deepEqual(result, ['Second rule', 'First rule']);
    });

    it('returns one requirement block verbatim, without its neighbours', async () => {
      const result = await lookupRequirement(tmpDir, OPENSPEC_ROOT, 'alpha', 'First rule');

      assert.equal(result, FIRST_RULE_BLOCK);
    });

    it('matches a requirement name after trimming', async () => {
      const result = await lookupRequirement(tmpDir, OPENSPEC_ROOT, 'alpha', '  First rule  ');

      assert.equal(result, FIRST_RULE_BLOCK);
    });
  });

  describe('living requirement lookup errors', () => {
    it('refuses an unknown capability without reading a path built from it', async () => {
      await assert.rejects(
        () => lookupRequirement(tmpDir, OPENSPEC_ROOT, '../alpha'),
        new Error('No living capability "../alpha". Capabilities: alpha, beta'),
      );
    });

    it('refuses a requirement the capability does not list', async () => {
      await assert.rejects(
        () => lookupRequirement(tmpDir, OPENSPEC_ROOT, 'alpha', 'first rule'),
        new Error('alpha has no requirement "first rule". osq spec alpha lists them.'),
      );
    });
  });

  describe('command', () => {
    it('registers a spec command with optional capability and requirement arguments', () => {
      const program = createProgram();
      const command = program.commands.find((entry) => entry.name() === 'spec');

      assert.ok(command, 'createProgram must register the spec command');
      assert.equal(
        command.description(),
        'list living capabilities and their requirements, or print one requirement',
      );
      assert.equal(command.registeredArguments[0]?.name(), 'capability');
      assert.equal(command.registeredArguments[0]?.required, false);
      assert.equal(command.registeredArguments[1]?.name(), 'requirement');
      assert.equal(command.registeredArguments[1]?.required, false);
    });

    it('prints one requirement block followed by one newline', async () => {
      const written: string[] = [];

      await specCommand('alpha', 'First rule', {
        cwd: tmpDir,
        config: DEFAULT_CONFIG,
        stdout: (msg) => written.push(msg),
      });

      assert.equal(written.join(''), `${FIRST_RULE_BLOCK}\n`);
    });

    it('prints requirement names one per line', async () => {
      const written: string[] = [];

      await specCommand('alpha', undefined, {
        cwd: tmpDir,
        config: DEFAULT_CONFIG,
        stdout: (msg) => written.push(msg),
      });

      assert.equal(written.join(''), 'Second rule\nFirst rule\n');
    });

    it('rejects an unknown capability with a CommandError and writes nothing', async () => {
      const written: string[] = [];

      await assert.rejects(
        () =>
          specCommand('missing', undefined, {
            cwd: tmpDir,
            config: DEFAULT_CONFIG,
            stdout: (msg) => written.push(msg),
          }),
        (error: unknown) => {
          assert.ok(error instanceof CommandError, 'the command rejects with a CommandError');
          assert.equal(error.message, 'No living capability "missing". Capabilities: alpha, beta');
          assert.equal(error.exitCode, 1);
          return true;
        },
      );
      assert.deepEqual(written, []);
    });
  });
});

describe('osq spec documentation', () => {
  it('names osq spec in the command list and points executors at named requirements', async () => {
    const raw = await fs.readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');
    const readme = raw.replace(/\s+/g, ' ');

    assert.ok(
      raw.split('\n').some((line) => line.startsWith('osq spec')),
      'README command list must have a line starting osq spec',
    );
    assert.ok(
      readme.includes('osq spec <capability> <requirement>'),
      'README must point executors at osq spec <capability> <requirement>',
    );
    assert.ok(
      !readme.includes('the delta specs and capability docs it names'),
      'README must not send agents through whole capability docs',
    );
  });
});
