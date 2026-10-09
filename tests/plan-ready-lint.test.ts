import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import { lintCommand } from '../src/cli/lint.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { type NewSpecResult, createNewSpec } from '../src/core/foundation/new.js';
import { readPlanRecords } from '../src/core/report/planning-records.js';
import { buildApprovalDigest } from '../src/core/spec/digest.js';
import { hashChangeFolder } from '../src/core/spec/hasher.js';
import { buildApprovalNotices, recordNotices } from '../src/core/spec/notices.js';
import { countPlanRevisions, readPlanReady } from '../src/core/spec/plan-ready.js';
import { installFakeValidator } from './helpers.js';

const VERIFY = 'node verify.cjs';

const silentLogger = {
  info: () => {},
  verbose: () => {},
  warn: () => {},
  error: () => {},
};

/** Create a change whose proposal runs the local verifier and whose task runs `verify`. */
async function createChange(root: string, title: string, verify: string): Promise<NewSpecResult> {
  const spec = await createNewSpec(root, title);
  const proposalPath = path.join(spec.folderPath, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(proposalPath, proposal.replace(/^verify:.*$/m, `verify: ${VERIFY}`), 'utf8');

  const taskPath = path.join(spec.folderPath, 'tasks', '1.md');
  const task = await fs.readFile(taskPath, 'utf8');
  await fs.writeFile(taskPath, task.replace(/^verify:.*$/m, `verify: ${verify}`), 'utf8');

  return spec;
}

describe('plan ready records from lint', () => {
  let root: string;
  let valid: NewSpecResult;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-ready-lint-'));
    await installFakeValidator(root);
    await scaffoldProject(root);
    await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
    valid = await createChange(root, 'Valid Change', VERIFY);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('records one plan_ready line with the folder hash and the change notices', async () => {
    const folder = valid.folderPath;
    const expectedHash = await hashChangeFolder(folder);
    const digest = await buildApprovalDigest(root, folder, DEFAULT_CONFIG);
    const expectedNotices = recordNotices(
      await buildApprovalNotices(root, folder, DEFAULT_CONFIG, digest),
    );
    assert.deepEqual(await readPlanReady(folder), [], 'no record before the clean lint');

    await lintCommand([valid.specId], { cwd: root, config: DEFAULT_CONFIG, logger: silentLogger });

    const records = await readPlanReady(folder);
    assert.equal(records.length, 1);
    assert.equal(records[0].type, 'plan_ready');
    assert.equal(records[0].data.hash, expectedHash);
    assert.deepEqual(records[0].data.notices, expectedNotices);
  });

  it('appends no record when lint runs again with nothing changed', async () => {
    await lintCommand([valid.specId], { cwd: root, config: DEFAULT_CONFIG, logger: silentLogger });
    await lintCommand([valid.specId], { cwd: root, config: DEFAULT_CONFIG, logger: silentLogger });

    const records = await readPlanReady(valid.folderPath);
    assert.equal(records.length, 1);
    assert.equal(countPlanRevisions(records, records[0].data.hash), 0);
  });

  it('appends a second record and counts one revision after the plan changes', async () => {
    await lintCommand([valid.specId], { cwd: root, config: DEFAULT_CONFIG, logger: silentLogger });
    const taskPath = path.join(valid.folderPath, 'tasks', '1.md');
    await fs.appendFile(taskPath, '\n', 'utf8');

    await lintCommand([valid.specId], { cwd: root, config: DEFAULT_CONFIG, logger: silentLogger });

    const records = await readPlanReady(valid.folderPath);
    assert.equal(records.length, 2);
    assert.notEqual(records[0].data.hash, records[1].data.hash);
    assert.equal(countPlanRevisions(records, await hashChangeFolder(valid.folderPath)), 1);
  });

  it('appends no record when lint fails', async () => {
    const invalid = await createChange(root, 'Invalid Change', '');
    await assert.rejects(
      lintCommand([invalid.specId], {
        cwd: root,
        config: DEFAULT_CONFIG,
        logger: { ...silentLogger, error: () => {} },
      }),
      (error: unknown) => error instanceof CommandError,
    );

    assert.deepEqual(await readPlanReady(invalid.folderPath), []);
  });

  it('appends no record for an approved change', async () => {
    await fs.mkdir(path.join(valid.folderPath, '.run'), { recursive: true });
    await fs.writeFile(path.join(valid.folderPath, '.run', 'approved'), 'sha256:sealed\n', 'utf8');

    await lintCommand([valid.specId], { cwd: root, config: DEFAULT_CONFIG, logger: silentLogger });

    assert.deepEqual(await readPlanReady(valid.folderPath), []);
  });

  it('appends no record for a rejected change', async () => {
    await fs.mkdir(path.join(valid.folderPath, '.run'), { recursive: true });
    await fs.writeFile(path.join(valid.folderPath, '.run', 'rejected.md'), 'reason: no\n', 'utf8');

    await lintCommand([valid.specId], { cwd: root, config: DEFAULT_CONFIG, logger: silentLogger });

    assert.deepEqual(await readPlanReady(valid.folderPath), []);
  });

  it('appends no record when lint runs without explicit ids', async () => {
    await lintCommand([], { cwd: root, config: DEFAULT_CONFIG, logger: silentLogger });

    assert.deepEqual(await readPlanReady(valid.folderPath), []);
  });

  it('records in JSON mode too', async () => {
    const stdout: string[] = [];
    await lintCommand([valid.specId], {
      cwd: root,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: (text: string) => stdout.push(text),
    });

    const records = await readPlanReady(valid.folderPath);
    assert.equal(records.length, 1);
    assert.ok(stdout.join('').includes('"valid":true'), stdout.join(''));
  });

  it('readPlanRecords still returns only the planning-session records', async () => {
    await lintCommand([valid.specId], { cwd: root, config: DEFAULT_CONFIG, logger: silentLogger });
    const planPath = path.join(valid.folderPath, '.run', 'plan.jsonl');
    await fs.appendFile(
      planPath,
      `${JSON.stringify({
        type: 'plan_started',
        sessionId: 'session-1',
        timestamp: '2026-01-01T00:00:00.000Z',
        data: { harness: 'pi', model: null, osqVersion: '0.0.0', briefHash: 'x' },
      })}\n`,
      'utf8',
    );

    const records = await readPlanRecords(valid.folderPath);
    assert.equal(records.length, 1);
    assert.equal(records[0].type, 'plan_started');
  });
});
