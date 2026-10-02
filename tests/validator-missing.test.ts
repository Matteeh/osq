import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import { lintCommand } from '../src/cli/lint.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { OPENSPEC_EXPECTED_VERSION, validateWithOpenSpec } from '../src/core/spec/linter.js';

const ADR_FRAGMENT = 'ADR 004 (decisions/004-pinned-openspec-validator.md)';
const INSTALL_COMMAND = 'pnpm add -D @fission-ai/openspec@1.13.1';

const PROPOSAL = `---
title: Validator pin enforcement
depends_on: []
features:
  reads: []
verify: node -e "process.exit(0)"
---
## Goal

Enforce the pinned OpenSpec validator.

## Contract

| Input | Expected Output |
|---|---|
| --help | usage |

## Non-goals

None.

## Delta

Enforce the pinned validator.
`;

const TASK = `---
title: Validator is enforced
verify: node -e "process.exit(0)"
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] validator enforced
`;

async function writeChange(projectRoot: string): Promise<string> {
  const folder = path.join(projectRoot, 'openspec', 'changes', '001-validator-pin');
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), PROPOSAL, 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), TASK, 'utf8');
  return folder;
}

/** Installs a project-local `openspec` binary reporting the given version. */
async function installFakeValidator(projectRoot: string, version: string): Promise<void> {
  const binDir = path.join(projectRoot, 'node_modules', '.bin');
  await fs.mkdir(binDir, { recursive: true });
  await fs.writeFile(
    path.join(binDir, 'openspec'),
    "#!/usr/bin/env node\nprocess.stdout.write('{}');\n",
    { mode: 0o755 },
  );

  const manifestDir = path.join(projectRoot, 'node_modules', '@fission-ai', 'openspec');
  await fs.mkdir(manifestDir, { recursive: true });
  await fs.writeFile(
    path.join(manifestDir, 'package.json'),
    JSON.stringify({ name: '@fission-ai/openspec', version }),
    'utf8',
  );
}

describe('pinned OpenSpec validator failure gating', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-validator-'));
    await writeChange(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('fails validateWithOpenSpec when the validator binary is missing', async () => {
    const outcome = await validateWithOpenSpec(tmpDir, DEFAULT_CONFIG);

    assert.equal(outcome.ran, false);
    assert.equal(outcome.bin, null);
    assert.equal(outcome.version, null);
    assert.ok(
      outcome.errors.some(
        (error) =>
          error.includes('unavailable') &&
          error.includes(ADR_FRAGMENT) &&
          error.includes(INSTALL_COMMAND),
      ),
      JSON.stringify(outcome.errors),
    );
  });

  it('fails validateWithOpenSpec when the validator version drifts', async () => {
    await installFakeValidator(tmpDir, '1.12.0');

    const outcome = await validateWithOpenSpec(tmpDir, DEFAULT_CONFIG);

    assert.equal(outcome.ran, true);
    assert.ok(
      outcome.errors.some(
        (error) =>
          error.includes('1.12.0') &&
          error.includes(`pinned ${OPENSPEC_EXPECTED_VERSION}`) &&
          error.includes(ADR_FRAGMENT) &&
          error.includes(INSTALL_COMMAND),
      ),
      JSON.stringify(outcome.errors),
    );
  });

  it('passes validateWithOpenSpec when the pinned version is installed', async () => {
    await installFakeValidator(tmpDir, OPENSPEC_EXPECTED_VERSION);

    const outcome = await validateWithOpenSpec(tmpDir, DEFAULT_CONFIG);

    assert.equal(outcome.ran, true);
    assert.deepEqual(outcome.errors, []);
  });

  it('fails osq lint when the validator binary is missing', async () => {
    const logged: string[] = [];
    await assert.rejects(
      lintCommand(['001'], {
        cwd: tmpDir,
        config: DEFAULT_CONFIG,
        logger: {
          info: () => {},
          verbose: () => {},
          warn: () => {},
          error: (message: string) => logged.push(message),
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof CommandError);
        assert.equal(error.message, '');
        assert.equal(error.exitCode, 1);
        return true;
      },
    );

    assert.ok(
      logged.some((line) => line.includes(ADR_FRAGMENT) && line.includes(INSTALL_COMMAND)),
      JSON.stringify(logged),
    );
  });

  it('fails osq approve when the validator binary is missing', async () => {
    await assert.rejects(approveSpec(tmpDir, '001', DEFAULT_CONFIG), (error: Error) => {
      assert.match(error.message, /ADR 004/);
      assert.ok(error.message.includes(INSTALL_COMMAND), error.message);
      return true;
    });
  });

  it('fails osq lint when the validator version drifts', async () => {
    await installFakeValidator(tmpDir, '1.12.0');

    const logged: string[] = [];
    await assert.rejects(
      lintCommand(['001'], {
        cwd: tmpDir,
        config: DEFAULT_CONFIG,
        logger: {
          info: () => {},
          verbose: () => {},
          warn: () => {},
          error: (message: string) => logged.push(message),
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof CommandError);
        assert.equal(error.exitCode, 1);
        return true;
      },
    );

    assert.ok(
      logged.some(
        (line) =>
          line.includes('1.12.0') && line.includes(ADR_FRAGMENT) && line.includes(INSTALL_COMMAND),
      ),
      JSON.stringify(logged),
    );
  });

  it('fails osq approve when the validator version drifts', async () => {
    await installFakeValidator(tmpDir, '1.12.0');

    await assert.rejects(approveSpec(tmpDir, '001', DEFAULT_CONFIG), (error: Error) => {
      assert.match(error.message, /1\.12\.0/);
      assert.match(error.message, /ADR 004/);
      assert.ok(error.message.includes(INSTALL_COMMAND), error.message);
      return true;
    });
  });
});
