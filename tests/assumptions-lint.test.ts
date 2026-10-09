import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { readAssumptions } from '../src/core/spec/assumptions.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { installFakeValidator } from './helpers.js';

const CHANGE_ID = '001-assumptions';

const ASSUMPTIONS_ERROR =
  "proposal.md's ## Assumptions section is empty: write None or one line per assumption";

/**
 * Build an inline proposal. `assumptions` is the raw `## Assumptions` body:
 * `null` omits the section entirely, and any string (including empty) is
 * written verbatim between the heading and the next section.
 */
function proposal(assumptions: string | null): string {
  const sections = [
    '---',
    'title: Assumptions Probe',
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    '',
    'Probe the proposal assumptions declaration.',
    '',
    '## Non-goals',
    '',
    'None.',
    '',
    '## Surface',
    '',
    'None',
    '',
  ];
  if (assumptions !== null) {
    sections.push('## Assumptions', '', assumptions, '');
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
title: When the assumptions probe runs, it passes
verify: node verify.cjs
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] passes
`;

async function writeChangeFolder(root: string, assumptions: string | null): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', CHANGE_ID);
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposal(assumptions), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), TASK, 'utf8');
  return folder;
}

describe('Proposal assumptions section', () => {
  describe('readAssumptions', () => {
    const cases: ReadonlyArray<{
      readonly name: string;
      readonly body: string;
      readonly expected: readonly string[] | null;
    }> = [
      {
        name: 'an absent section',
        body: '## Goal\n\nNothing here.\n',
        expected: null,
      },
      {
        name: 'None',
        body: '# Proposal\n\n## Assumptions\n\nNone\n',
        expected: [],
      },
      {
        name: 'a bullet and a plain line',
        body: '## Assumptions\n\n- The cache is per process.\nEvery caller passes an absolute path.\n',
        expected: ['The cache is per process.', 'Every caller passes an absolute path.'],
      },
      {
        name: 'an HTML comment and None',
        body: '## Assumptions\n\n<!-- write one line per assumption, or None -->\nNone\n',
        expected: [],
      },
    ];

    for (const testCase of cases) {
      it(`reads ${testCase.name}`, () => {
        assert.deepEqual(readAssumptions(testCase.body), testCase.expected);
      });
    }
  });

  describe('lintChangeFolder', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-assumptions-lint-'));
      await installFakeValidator(tmpDir);
      await scaffoldProject(tmpDir);
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('fails a proposal whose Assumptions section holds only an HTML comment', async () => {
      const folder = await writeChangeFolder(
        tmpDir,
        '<!-- Add assumptions here, or replace None. -->',
      );

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(ASSUMPTIONS_ERROR), result.errors.join('\n'));
      const finding = result.findings.find((entry) => entry.section === 'Assumptions');
      assert.ok(finding);
      assert.equal(finding.severity, 'error');
      assert.equal(finding.message, ASSUMPTIONS_ERROR);
    });

    it('reports no assumptions finding for a proposal without the section', async () => {
      const folder = await writeChangeFolder(tmpDir, null);

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(result.valid, true, result.errors.join('\n'));
      assert.ok(!result.errors.includes(ASSUMPTIONS_ERROR));
      assert.ok(!result.findings.some((entry) => entry.section === 'Assumptions'));
    });

    it('accepts a proposal whose Assumptions section says None', async () => {
      const folder = await writeChangeFolder(tmpDir, 'None');

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(result.valid, true, result.errors.join('\n'));
    });

    it('accepts a proposal whose Assumptions section lists assumptions', async () => {
      const folder = await writeChangeFolder(
        tmpDir,
        '- The cache is per process.\nEvery caller passes an absolute path.',
      );

      const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);

      assert.equal(result.valid, true, result.errors.join('\n'));
    });
  });
});
