import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveCommand } from '../src/cli/approve.js';
import { CommandError } from '../src/cli/command-error.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { writePlanRunRecord } from '../src/core/run/plan-run-record.js';
import { installFakeValidator } from './helpers.js';

/** The record's start time both scenarios pin. */
const AT = '2026-10-14T09:30:00.000Z';
const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

/** Replace the seeded planning sentinel with a real local verifier. */
async function installLocalVerifier(root: string, folderPath: string): Promise<void> {
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  for (const rel of ['proposal.md', path.join('tasks', '1.md')]) {
    const target = path.join(folderPath, rel);
    const content = await fs.readFile(target, 'utf8').catch(() => null);
    if (content === null) continue;
    await fs.writeFile(
      target,
      content.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
      'utf8',
    );
  }
}

/** A pid whose process has exited. */
async function exitedPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', '']);
  const pid = child.pid as number;
  await once(child, 'exit');
  return pid;
}

/** The captured writers one `approveCommand` call prints to. */
interface Captured {
  readonly stdout: string[];
  readonly stderr: string[];
}

describe('osq approve while a planner runs', () => {
  let projectRoot: string;
  let specFolder: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-run-approve-'));
    await installFakeValidator(projectRoot);
    await scaffoldProject(projectRoot);
    const spec = await createNewSpec(projectRoot, 'Demo');
    specFolder = spec.folderPath;
    await installLocalVerifier(projectRoot, specFolder);
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  function capture(): Captured {
    const stdout: string[] = [];
    const stderr: string[] = [];
    return { stdout, stderr };
  }

  /** Run `approveCommand 001` with captured output and return what it threw. */
  async function runApprove(cap: Captured): Promise<unknown> {
    try {
      await approveCommand(['001'], {
        cwd: projectRoot,
        config: DEFAULT_CONFIG,
        stdout: (text) => cap.stdout.push(text),
        stderr: (text) => cap.stderr.push(text),
        planningReaders: [],
      });
      return null;
    } catch (error) {
      return error;
    }
  }

  it('Approve while planning: a live planner refuses the change before anything is written', async () => {
    await writePlanRunRecord(specFolder, {
      outcome: 'running',
      changed: [],
      at: AT,
      pid: process.pid,
    });
    const cap = capture();

    const error = await runApprove(cap);

    assert.ok(error instanceof CommandError);
    assert.equal(
      error.message,
      'Error approving 001:\n  a planner is running for 001-demo since 2026-10-14 09:30 UTC; approve after it finishes',
    );
    assert.equal(error.next, 'planning (since 2026-10-14 09:30 UTC) — osq show 001');
    assert.equal(cap.stderr.join(''), '');
    assert.equal(await fs.stat(path.join(specFolder, '.run', 'approved')).catch(() => null), null);
  });

  it('Approve after the planner stopped: the change approves', async () => {
    const pid = await exitedPid();
    await writePlanRunRecord(specFolder, { outcome: 'running', changed: [], at: AT, pid });
    const cap = capture();

    const error = await runApprove(cap);

    assert.equal(error, null);
    const approved = await fs.readFile(path.join(specFolder, '.run', 'approved'), 'utf8');
    assert.ok(approved.trim().startsWith('sha256:'), approved);
  });
});
