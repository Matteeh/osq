import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { installFakeValidator } from './helpers.js';
import { createRustWorkspace } from './rust-workspace.js';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

const PASSING_VERIFY = 'node verify.cjs';
const CHANGE_ID = '001-rust-lint';

const PROPOSAL = `---
title: Rust lint
depends_on: []
verify: ${PASSING_VERIFY}
features:
  reads: []
---
## Goal

Lint a crate test in scope.

## Surface

None.
`;

const TASKS_MD = '# Tasks\n\n- [ ] 1. Rust tests are gated\n';

function taskMarkdown(scope: string): string {
  return [
    '---',
    'title: Rust tests are gated',
    `verify: ${PASSING_VERIFY}`,
    `scope: [${scope}]`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] rust tests are gated',
    '',
  ].join('\n');
}

/** The committed two-crate workspace with one change whose task 1 scopes `scope`. */
async function setupCase(scope: string): Promise<{ root: string; specFolder: string }> {
  const root = await createRustWorkspace();
  roots.push(root);
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  const specFolder = path.join(root, 'openspec', 'changes', CHANGE_ID);
  await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(specFolder, 'proposal.md'), PROPOSAL, 'utf8');
  await fs.writeFile(path.join(specFolder, 'tasks.md'), TASKS_MD, 'utf8');
  await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), taskMarkdown(scope), 'utf8');
  return { root, specFolder };
}

describe('Existing crate test lacks declaration', () => {
  const cases: ReadonlyArray<readonly [string, string | null]> = [
    [
      'crates/core/tests/api.rs',
      'Task in 1.md scope touches existing test files (crates/core/tests/api.rs) without tests.modify: true',
    ],
    ['crates/core/src/lib.rs', null],
  ];

  for (const [scope, expected] of cases) {
    it(`${scope} yields ${expected === null ? 'no tests.modify error' : 'a tests.modify error'}`, async () => {
      const { root, specFolder } = await setupCase(scope);
      const result = await lintChangeFolder(root, specFolder, DEFAULT_CONFIG);
      const modifyErrors = result.errors.filter((error) => error.includes('tests.modify'));
      assert.deepEqual(modifyErrors, expected === null ? [] : [expected]);
    });
  }
});
