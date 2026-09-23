import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { installFakeValidator } from './helpers.js';

const CHANGE_ID = '001-surface';

const SURFACE_ERROR =
  'proposal.md needs a ## Surface section: list the commands, flags, config keys, frontmatter fields, document sections, dead reasons, and event types this change adds, changes, or removes, or write None';

const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

/**
 * Build an inline proposal. `surface` is the raw `## Surface` body: `null`
 * omits the section entirely, and any string (including empty) is written
 * verbatim between the heading and the next section.
 */
function proposal(surface: string | null): string {
  const sections = [
    '---',
    'title: Surface Probe',
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    '',
    'Probe the proposal surface declaration.',
    '',
    '## Non-goals',
    '',
    'None.',
    '',
  ];
  if (surface !== null) {
    sections.push('## Surface', '', surface, '');
  }
  sections.push(
    '## Contract',
    '',
    '### Requirement: Probe behavior',
    '',
    'The system SHALL probe deterministically.',
    '',
    '#### Scenario: Probe works',
    '- **WHEN** invoked',
    '- **THEN** it works',
    '',
    '## Delta',
    '',
    'Delta specs declare behavior.',
    '',
  );
  return sections.join('\n');
}

const TASK = `---
title: When the surface probe runs, it passes
verify: node verify.cjs
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] passes
`;

async function writeChangeFolder(root: string, surface: string | null): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', CHANGE_ID);
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposal(surface), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), TASK, 'utf8');
  return folder;
}

/** Replace the seeded planning sentinel with a real local verifier. */
async function installLocalVerifier(root: string, folderPath: string): Promise<void> {
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  for (const rel of ['proposal.md', path.join('tasks', '1.md')]) {
    const target = path.join(folderPath, rel);
    const content = await fs.readFile(target, 'utf8');
    await fs.writeFile(target, content.replace(/^verify:.*$/m, 'verify: node verify.cjs'), 'utf8');
  }
}

describe('proposal surface declaration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-surface-lint-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('lintChangeFolder', () => {
    it('rejects a missing Surface section with the fix-it error', async () => {
      const folder = await writeChangeFolder(tmpDir, null);

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(SURFACE_ERROR), result.errors.join('\n'));
    });

    it('rejects an empty Surface section', async () => {
      const folder = await writeChangeFolder(tmpDir, '');

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(SURFACE_ERROR), result.errors.join('\n'));
    });

    it('rejects a comment-only Surface section', async () => {
      const folder = await writeChangeFolder(
        tmpDir,
        '<!-- Add user-facing names here, or replace None. -->',
      );

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(SURFACE_ERROR), result.errors.join('\n'));
    });

    it('accepts a Surface section holding None', async () => {
      const folder = await writeChangeFolder(tmpDir, 'None');

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(result.valid, true, result.errors.join('\n'));
    });

    it('accepts a Surface section holding a list', async () => {
      const folder = await writeChangeFolder(
        tmpDir,
        '- Added: `osq surface` (command)\n- Changed: `--refresh` (flag)',
      );

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(result.valid, true, result.errors.join('\n'));
    });

    it('accepts the seeded comment followed by None', async () => {
      const folder = await writeChangeFolder(tmpDir, '<!-- names go here -->\nNone');

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(result.valid, true, result.errors.join('\n'));
    });
  });

  describe('approveSpec', () => {
    it('refuses a proposal with no Surface section', async () => {
      await writeChangeFolder(tmpDir, null);

      await assert.rejects(
        () => approveSpec(tmpDir, '001', DEFAULT_CONFIG),
        (error: unknown) => error instanceof Error && error.message.includes(SURFACE_ERROR),
      );
    });

    it('refuses a proposal with a comment-only Surface section', async () => {
      await writeChangeFolder(tmpDir, '<!-- only a comment -->');

      await assert.rejects(
        () => approveSpec(tmpDir, '001', DEFAULT_CONFIG),
        (error: unknown) => error instanceof Error && error.message.includes(SURFACE_ERROR),
      );
    });

    it('approves a proposal whose Surface section says None', async () => {
      await writeChangeFolder(tmpDir, 'None');

      const result = await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

      assert.equal(result.specId, '001');
      assert.ok(result.hash.startsWith('sha256:'));
    });

    it('approves a proposal whose Surface section lists names', async () => {
      await writeChangeFolder(tmpDir, '- Added: `osq surface` (command)');

      const result = await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

      assert.equal(result.specId, '001');
      assert.ok(result.hash.startsWith('sha256:'));
    });

    it('lints and approves a fresh createNewSpec proposal', async () => {
      const spec = await createNewSpec(tmpDir, 'Seeded surface');
      await installLocalVerifier(tmpDir, spec.folderPath);

      const lintResult = await lintChangeFolder(tmpDir, spec.folderPath, DEFAULT_CONFIG);
      assert.equal(lintResult.valid, true, lintResult.errors.join('\n'));

      const result = await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
      assert.equal(result.specId, '001');
      assert.ok(result.hash.startsWith('sha256:'));
    });
  });
});
