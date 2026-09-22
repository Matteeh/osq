import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';
import { statusCommand } from '../src/cli/status.js';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { acquireLock, releaseLock } from '../src/core/lock.js';
import { createNewSpec } from '../src/core/new.js';
import { formatStatusOverview, getStatusOverview } from '../src/core/status.js';
import { installFakeValidator } from './helpers.js';

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

/** Replace the seeded planning sentinel in the proposal and task 1. */
async function installLocalVerifier(root: string, folderPath: string): Promise<void> {
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  for (const rel of ['proposal.md', path.join('tasks', '1.md')]) {
    const target = path.join(folderPath, rel);
    const content = await fs.readFile(target, 'utf8').catch(() => null);
    if (content === null) {
      continue;
    }
    await fs.writeFile(
      target,
      content.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
      'utf8',
    );
  }
}

describe('osq status', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-status-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('getStatusOverview returns all active specs with derived spec and task states', async () => {
    const spec1 = await createNewSpec(tmpDir, 'First Spec');
    const spec2 = await createNewSpec(tmpDir, 'Second Spec');
    await installLocalVerifier(tmpDir, spec1.folderPath);
    await installLocalVerifier(tmpDir, spec2.folderPath);

    // Add a second task to spec1
    await fs.writeFile(
      path.join(spec1.folderPath, 'tasks', '2.md'),
      `---
title: Task Two
verify: ${PASSING_VERIFY}
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] do something
`,
      'utf8',
    );

    // Approve spec1
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    // Mark task 1 in spec1 as done
    const doneDir = path.join(spec1.folderPath, '.run', 'done');
    await fs.mkdir(doneDir, { recursive: true });
    await fs.writeFile(path.join(doneDir, '1'), '', 'utf8');

    const overview = await getStatusOverview(tmpDir, DEFAULT_CONFIG);

    assert.equal(overview.specs.length, 2);

    const s1 = overview.specs.find((s) => s.id === '001');
    assert.ok(s1);
    assert.equal(s1.title, 'First Spec');
    assert.equal(s1.status, 'pending');
    assert.ok(s1.approvedHash);
    assert.equal(s1.tasks.length, 2);
    assert.equal(s1.tasks[0].taskNumber, '1');
    assert.equal(s1.tasks[0].status, 'done');
    assert.equal(s1.tasks[1].taskNumber, '2');
    assert.equal(s1.tasks[1].status, 'pending');

    const s2 = overview.specs.find((s) => s.id === '002');
    assert.ok(s2);
    assert.equal(s2.title, 'Second Spec');
    assert.equal(s2.status, 'unapproved');
    assert.equal(s2.approvedHash, null);
    assert.equal(s2.tasks.length, 1);
    assert.equal(s2.tasks[0].status, 'pending');
  });

  it('getStatusOverview returns count of archived change folders', async () => {
    // Initially 0 archived
    const initialOverview = await getStatusOverview(tmpDir, DEFAULT_CONFIG);
    assert.equal(initialOverview.archivedCount, 0);

    // Create archived spec folders
    const archiveDir = path.join(tmpDir, 'openspec', 'changes', 'archive');
    await fs.mkdir(path.join(archiveDir, '001-archived-one'), { recursive: true });
    await fs.mkdir(path.join(archiveDir, '002-archived-two'), { recursive: true });
    // Also write a dummy file that is not a directory to ensure it is ignored
    await fs.writeFile(path.join(archiveDir, '.gitkeep'), '', 'utf8');

    const overview = await getStatusOverview(tmpDir, DEFAULT_CONFIG);
    assert.equal(overview.archivedCount, 2);
  });

  it('statusCommand prints formatted status overview with state indicators', async () => {
    const spec = await createNewSpec(tmpDir, 'Payment Gateway');
    await installLocalVerifier(tmpDir, spec.folderPath);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const archiveDir = path.join(tmpDir, 'openspec', 'changes', 'archive');
    await fs.mkdir(path.join(archiveDir, '000-old-spec'), { recursive: true });

    let capturedOutput = '';
    const result = await statusCommand({
      cwd: tmpDir,
      stdout: (msg) => {
        capturedOutput = msg;
      },
    });

    const output = capturedOutput || result;
    assert.ok(output.includes('001-payment-gateway'));
    assert.ok(output.includes('Payment Gateway'));
    assert.ok(output.includes('[pending]'));
    assert.ok(output.includes('(approved)'));
    assert.ok(output.includes('Archived specs: 1'));
  });

  it('CLI registers status command in commander program', () => {
    const program = createProgram();
    const statusCmd = program.commands.find((cmd) => cmd.name() === 'status');

    assert.ok(statusCmd, 'status command should be registered in CLI program');
    assert.ok(statusCmd.description().length > 0, 'status command should have a description');
  });

  it('status output clearly distinguishes pending, running, done, and dead tasks', async () => {
    const spec = await createNewSpec(tmpDir, 'Task Lifecycle Spec');
    await installLocalVerifier(tmpDir, spec.folderPath);

    // Create tasks 2, 3, 4
    for (let i = 2; i <= 4; i++) {
      await fs.writeFile(
        path.join(spec.folderPath, 'tasks', `${i}.md`),
        `---
title: Task Number ${i}
verify: ${PASSING_VERIFY}
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] criteria ${i}
`,
        'utf8',
      );
    }

    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    const runDir = path.join(spec.folderPath, '.run');

    // Task 1: Done
    const doneDir = path.join(runDir, 'done');
    await fs.mkdir(doneDir, { recursive: true });
    await fs.writeFile(path.join(doneDir, '1'), '', 'utf8');

    // Task 2: Running
    await acquireLock(runDir, '2');

    // Task 3: Pending (no markers)

    // Task 4: Dead with reason
    const deadDir = path.join(runDir, 'dead');
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(
      path.join(deadDir, '4.md'),
      `---
reason: verify_red
---
Task 4 verification gate failed
`,
      'utf8',
    );

    const overview = await getStatusOverview(tmpDir, DEFAULT_CONFIG);
    const formatted = formatStatusOverview(overview);

    // Verify indicators and status tags for all states
    // Done: [x] and [done]
    assert.ok(formatted.includes('[x] 1.'));
    assert.ok(formatted.includes('[done]'));

    // Running: [>] and [running]
    assert.ok(formatted.includes('[>] 2.'));
    assert.ok(formatted.includes('[running]'));

    // Pending: [ ] and [pending]
    assert.ok(formatted.includes('[ ] 3.'));
    assert.ok(formatted.includes('[pending]'));

    // Dead: [!] and [dead] and reason
    assert.ok(formatted.includes('[!] 4.'));
    assert.ok(formatted.includes('[dead]'));
    assert.ok(formatted.includes('verify_red'));

    await releaseLock(runDir, '2');
  });
});
