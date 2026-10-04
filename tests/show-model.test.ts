import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { showCommand } from '../src/cli/show.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { approveSpec } from '../src/core/spec/approve.js';
import {
  buildApprovalDigest,
  formatApprovalDigest,
  formatApprovalFlags,
} from '../src/core/spec/digest.js';
import { getSpecDetails, getSpecDetailsFromFolder } from '../src/core/status/show.js';
import { createChange, createProject, restoreEnv } from './planning-observed-helpers.js';

const STATUS_DIR = path.join(process.cwd(), 'src', 'core', 'status');

const SURFACE = '- Added: `osq show --surface` (flag)';
const DECISIONS = 'ADR 147: the model carries the digest.';
const BEFORE_APPROVAL = 'Read the Surface line, then approve.';

/** Write the proposal sections the change detail model reads. */
async function writeProposalSections(folderPath: string): Promise<void> {
  const proposalPath = path.join(folderPath, 'proposal.md');
  let proposal = await fs.readFile(proposalPath, 'utf8');
  proposal = proposal.replace(/## Surface\n[\s\S]*?\nNone\n/, `## Surface\n\n${SURFACE}\n`);
  proposal = proposal.replace(/## Decisions\n[\s\S]*?\nNone\n/, `## Decisions\n\n${DECISIONS}\n`);
  proposal = proposal.replace(
    /## Human steps\n[\s\S]*?\nNone\n/,
    `## Human steps\n\n### Before approval\n\n${BEFORE_APPROVAL}\n\n### After landing\n\nNone\n`,
  );
  await fs.writeFile(proposalPath, proposal, 'utf8');
}

/** Every renderer module: the text/renderer modules and the output module. */
const RENDERER_FILES = [
  'show-output.ts',
  'show-text.ts',
  'show-run-lines.ts',
  'show-task-lines.ts',
];

describe('osq show change detail model', () => {
  let root = '';

  beforeEach(() => {
    restoreEnv();
  });
  afterEach(async () => {
    restoreEnv();
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('carries the proposal sections and the digest for an unapproved change', async () => {
    root = await createProject();
    const change = await createChange(root, 'Model Unapproved');
    await writeProposalSections(change.folderPath);

    const details = await getSpecDetails(root, change.specId, DEFAULT_CONFIG);
    assert.equal(details.surface, SURFACE);
    assert.equal(details.decisions, DECISIONS);
    assert.equal(details.beforeApproval, BEFORE_APPROVAL);
    assert.deepEqual(
      details.digest,
      await buildApprovalDigest(root, change.folderPath, DEFAULT_CONFIG),
    );
  });

  it('has a null digest and keeps the proposal text once approved', async () => {
    root = await createProject();
    const change = await createChange(root, 'Model Approved');
    await writeProposalSections(change.folderPath);
    await approveSpec(root, change.specId, DEFAULT_CONFIG, { planningReaders: [] });

    const byId = await getSpecDetails(root, change.specId, DEFAULT_CONFIG);
    assert.equal(byId.digest, null);
    assert.equal(byId.surface, SURFACE);
    assert.equal(byId.decisions, DECISIONS);
    assert.equal(byId.beforeApproval, BEFORE_APPROVAL);

    const byFolder = await getSpecDetailsFromFolder(
      root,
      change.folderPath,
      'active',
      DEFAULT_CONFIG,
    );
    assert.equal(byFolder.digest, null);
    assert.equal(byFolder.surface, SURFACE);
    assert.equal(byFolder.decisions, DECISIONS);
    assert.equal(byFolder.beforeApproval, BEFORE_APPROVAL);
  });

  it('reads no files in the renderers and defines no function in show.ts', async () => {
    for (const file of RENDERER_FILES) {
      const source = await fs.readFile(path.join(STATUS_DIR, file), 'utf8');
      assert.doesNotMatch(source, /node:fs/, `${file} imports node:fs`);
    }

    const facade = await fs.readFile(path.join(STATUS_DIR, 'show.ts'), 'utf8');
    assert.doesNotMatch(facade, /\bfunction\b/, 'show.ts defines a function');
    assert.doesNotMatch(facade, /=>/, 'show.ts defines an arrow function');
    assert.doesNotMatch(facade, /\basync\b/, 'show.ts defines an async function');
  });

  it('prints JSON without the proposal fields and with digest last', async () => {
    root = await createProject();
    const change = await createChange(root, 'Model JSON');
    await writeProposalSections(change.folderPath);
    let captured = '';

    await showCommand(change.specId, {
      cwd: root,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: (msg) => {
        captured = msg;
      },
    });

    const doc = JSON.parse(captured) as Record<string, unknown>;
    assert.equal('surface' in doc, false);
    assert.equal('decisions' in doc, false);
    assert.equal('beforeApproval' in doc, false);
    const keys = Object.keys(doc);
    assert.equal(keys[keys.length - 1], 'digest');
    assert.ok(doc.digest, 'an unapproved change should carry a digest');
  });

  it('ends the text with the digest and flag lines approve would print', async () => {
    root = await createProject();
    const change = await createChange(root, 'Model Text');
    await writeProposalSections(change.folderPath);
    const details = await getSpecDetails(root, change.specId, DEFAULT_CONFIG);
    assert.ok(details.digest, 'an unapproved change should carry a digest');

    const text = await showCommand(change.specId, {
      cwd: root,
      config: DEFAULT_CONFIG,
      stdout: () => {},
    });

    let tail = formatApprovalDigest(details.digest);
    for (const line of formatApprovalFlags(details.digest.flags)) tail += `\n${line}`;
    assert.ok(text.endsWith(tail), 'text does not end with the digest and flag lines');
  });
});
