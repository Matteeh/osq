import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { installFakeValidator } from './helpers.js';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

const CHANGE_ID = '001-brace-scope';

const PROPOSAL = `---
title: Brace scope
depends_on: []
verify: node verify.cjs
features:
  reads: []
---
## Goal

Reject brace groups in task paths.

## Surface

None.
`;

const TASKS_MD = '# Tasks\n\n- [ ] 1. Reject brace groups\n';

type Field = 'scope' | 'entry';

/** Task 1 frontmatter listing `value` in `field` and a plain existing path elsewhere. */
function taskMarkdown(field: Field, value: string): string {
  const scope = field === 'scope' ? value : 'verify.cjs';
  const entry = field === 'entry' ? value : 'verify.cjs';
  return [
    '---',
    'title: Reject brace groups',
    'verify: node verify.cjs',
    'scope:',
    `  - '${scope}'`,
    'entry:',
    `  - '${entry}'`,
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] brace groups are refused',
    '',
  ].join('\n');
}

/**
 * A scaffolded project with one unapproved change whose task 1 lists `value`
 * in `field`. The other field names the existing `verify.cjs`, so only the
 * row's entry can produce a brace group error.
 */
async function setupProject(
  field: Field,
  value: string,
): Promise<{ root: string; specFolder: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-lint-brace-'));
  roots.push(root);
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  const specFolder = path.join(root, 'openspec', 'changes', CHANGE_ID);
  await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(specFolder, 'proposal.md'), PROPOSAL, 'utf8');
  await fs.writeFile(path.join(specFolder, 'tasks.md'), TASKS_MD, 'utf8');
  await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), taskMarkdown(field, value), 'utf8');
  return { root, specFolder };
}

/** The brace group errors lint gives the one-task change. */
async function braceErrors(field: Field, value: string): Promise<readonly string[]> {
  const { root, specFolder } = await setupProject(field, value);
  const result = await lintChangeFolder(root, specFolder, DEFAULT_CONFIG);
  return result.errors.filter((error) => error.includes('holds a brace group'));
}

function message(field: Field, value: string): string {
  const label = field === 'scope' ? 'scope entry' : 'entry';
  return `Task in 1.md ${label} "${value}" holds a brace group, which osq scope globs do not expand; they support only *, **, ? and a trailing /. Use a folder glob such as dir/** or one entry per file`;
}

describe('Brace group cases', () => {
  // The delta spec's row table: field, entry, and the brace group error lint
  // gives, or none.
  const cases: ReadonlyArray<readonly [Field, string, string | null]> = [
    ['scope', 'tests/golden/{a,b}.json', message('scope', 'tests/golden/{a,b}.json')],
    ['scope', 'src/{core,cli}/**', message('scope', 'src/{core,cli}/**')],
    ['entry', 'src/{a,b}.ts', message('entry', 'src/{a,b}.ts')],
    ['scope', 'app/[id]/page.tsx', null],
    ['scope', 'src/{single}.ts', null],
    ['scope', 'tests/golden/events/**', null],
  ];

  for (const [field, value, expected] of cases) {
    it(`${field} "${value}" yields ${expected === null ? 'no brace group error' : 'a brace group error'}`, async () => {
      assert.deepEqual(await braceErrors(field, value), expected === null ? [] : [expected]);
    });
  }
});
