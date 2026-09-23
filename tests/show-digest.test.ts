import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';
import { showCommand } from '../src/cli/show.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { createChange, createProject, restoreEnv } from './planning-observed-helpers.js';

describe('osq show approval digest', () => {
  let root = '';

  beforeEach(() => {
    restoreEnv();
  });
  afterEach(async () => {
    restoreEnv();
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('registers --json on osq show', () => {
    const program = createProgram();
    const show = program.commands.find((command) => command.name() === 'show');
    assert.ok(show);
    assert.ok(show.options.some((option) => option.long === '--json'));
  });

  it('appends the digest and flag lines for an unapproved change', async () => {
    root = await createProject();
    const change = await createChange(root, 'Show Digest');

    const text = await showCommand(change.specId, {
      cwd: root,
      config: DEFAULT_CONFIG,
      stdout: () => {},
    });

    assert.ok(text.includes(`Change: ${path.basename(change.folderPath)}`));
    assert.ok(text.endsWith('Flag: verify without a test in the proposal \u2014 node verify.cjs'));
    assert.ok(text.includes('Flag: verify without a test in task 1 \u2014 node verify.cjs'));
    assert.ok(text.includes('Approval: unapproved'));
  });

  it('omits the digest and flags for an approved change', async () => {
    root = await createProject();
    const change = await createChange(root, 'Approved Show');
    await approveSpec(root, change.specId, DEFAULT_CONFIG, { planningReaders: [] });

    const text = await showCommand(change.specId, {
      cwd: root,
      config: DEFAULT_CONFIG,
      stdout: () => {},
    });

    assert.equal(text.includes('Flag:'), false);
    assert.equal(text.includes(`Change: ${path.basename(change.folderPath)}`), false);
  });

  it('prints the details plus a digest object as JSON for an unapproved change', async () => {
    root = await createProject();
    const change = await createChange(root, 'JSON Digest');
    let captured = '';

    await showCommand(change.specId, {
      cwd: root,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: (msg) => {
        captured = msg;
      },
    });

    const doc = JSON.parse(captured) as {
      id: string;
      folderName: string;
      digest: { change: string; flags: { id: string }[] } | null;
    };
    assert.equal(doc.id, change.specId);
    assert.equal(doc.folderName, path.basename(change.folderPath));
    assert.ok(doc.digest, 'an unapproved change should carry a digest');
    assert.equal(doc.digest.change, path.basename(change.folderPath));
    assert.deepEqual(
      doc.digest.flags.map((flag) => flag.id),
      ['verify_without_test', 'verify_without_test'],
    );
  });

  it('prints a null digest as JSON for an approved change', async () => {
    root = await createProject();
    const change = await createChange(root, 'JSON Approved');
    await approveSpec(root, change.specId, DEFAULT_CONFIG, { planningReaders: [] });
    let captured = '';

    await showCommand(change.specId, {
      cwd: root,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: (msg) => {
        captured = msg;
      },
    });

    const doc = JSON.parse(captured) as { id: string; digest: unknown };
    assert.equal(doc.id, change.specId);
    assert.equal(doc.digest, null);
  });
});
