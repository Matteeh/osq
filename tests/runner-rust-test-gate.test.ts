import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { gatedTestPathFilter } from '../src/core/run/test-gate.js';
import { approveSpec } from '../src/core/spec/approve.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { languageMap } from '../src/kernel/languages/language-map.js';
import type { RunTaskResult } from '../src/watcher/outcome.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';
import { createRustWorkspace } from './rust-workspace.js';

const execFileAsync = promisify(execFile);

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

/** The test's own git calls ignore redirecting variables, like osq's reads. */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
    Reflect.deleteProperty(env, key);
  }
  return env;
}

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
}

const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const PASSING_VERIFY = 'node verify.cjs';
const CHANGE_ID = '001-rust-gating';

const PROPOSAL = `---
title: Rust test gating
depends_on: []
verify: ${PASSING_VERIFY}
features:
  reads: []
---
## Goal

Gate Rust tests.

## Surface

None.
`;

const TASKS_MD = '# Tasks\n\n- [ ] 1. Rust tests are gated\n';

function taskMarkdown(scope: readonly string[], testsModify: boolean): string {
  const lines = [
    '---',
    'title: Rust tests are gated',
    `verify: ${PASSING_VERIFY}`,
    `scope: [${scope.join(', ')}]`,
    'entry: []',
    'skills: []',
  ];
  if (testsModify) lines.push('tests:', '  modify: true');
  lines.push('---', '## Acceptance', '- [ ] rust tests are gated', '');
  return lines.join('\n');
}

/** Adapter that makes the row's change while the task runs, then writes a result. */
class FileMutatingAdapter implements HarnessAdapter {
  readonly name = 'file-mutating';

  constructor(private readonly mutate: (root: string) => Promise<void>) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await this.mutate(options.projectRoot);
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(
      path.join(resultsDir, `${options.taskNumber}.md`),
      '# Agent result\n',
      'utf8',
    );
    return { exitCode: 0 };
  }
}

interface Case {
  readonly scope: readonly string[];
  readonly testsModify: boolean;
}

interface Project extends Case {
  readonly root: string;
  readonly specFolder: string;
}

/** A committed two-crate workspace with one approved change, run in place. */
async function setupCase(options: Case): Promise<Project> {
  const root = await createRustWorkspace();
  roots.push(root);
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  const specFolder = path.join(root, 'openspec', 'changes', CHANGE_ID);
  await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(specFolder, 'proposal.md'), PROPOSAL, 'utf8');
  await fs.writeFile(path.join(specFolder, 'tasks.md'), TASKS_MD, 'utf8');
  await fs.writeFile(
    path.join(specFolder, 'tasks', '1.md'),
    taskMarkdown(options.scope, options.testsModify),
    'utf8',
  );
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'seed'], root);
  await approveSpec(root, '001', DEFAULT_CONFIG);
  return { ...options, root, specFolder };
}

async function replace(root: string, relative: string, from: string, to: string): Promise<void> {
  const file = path.join(root, relative);
  const content = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, content.replace(from, to), 'utf8');
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

interface Row extends Case {
  readonly label: string;
  readonly change: (root: string) => Promise<void>;
  readonly expected:
    | { readonly state: 'dead'; readonly diagnostic: string }
    | { readonly state: 'done' };
}

const LIB = 'crates/core/src/lib.rs';
const CLI_MAIN = 'crates/cli/src/main.rs';
const CORE_API = 'crates/core/tests/api.rs';
const CLI_RUN = 'crates/cli/tests/run.rs';
const CORE_BENCH = 'crates/core/benches/speed.rs';
const CLI_DATA = 'crates/cli/tests/data/input.txt';

const rows: Row[] = [
  {
    label: 'appending to a crate tests file without tests.modify is dead',
    scope: [],
    testsModify: false,
    change: async (root) => {
      await fs.appendFile(path.join(root, CORE_API), '// appended\n', 'utf8');
    },
    expected: {
      state: 'dead',
      diagnostic: `${CORE_API} (modified); authorizing scope: ${CORE_API}`,
    },
  },
  {
    label: 'deleting a crate tests file without tests.modify is dead',
    scope: [],
    testsModify: false,
    change: async (root) => {
      await fs.rm(path.join(root, CLI_RUN));
    },
    expected: {
      state: 'dead',
      diagnostic: `${CLI_RUN} (deleted); authorizing scope: ${CLI_RUN}`,
    },
  },
  {
    label: 'appending to a crate benches file without tests.modify is dead',
    scope: [],
    testsModify: false,
    change: async (root) => {
      await fs.appendFile(path.join(root, CORE_BENCH), '// appended\n', 'utf8');
    },
    expected: {
      state: 'dead',
      diagnostic: `${CORE_BENCH} (modified); authorizing scope: ${CORE_BENCH}`,
    },
  },
  {
    label: 'appending to data under a crate tests folder without tests.modify is dead',
    scope: [],
    testsModify: false,
    change: async (root) => {
      await fs.appendFile(path.join(root, CLI_DATA), 'more input\n', 'utf8');
    },
    expected: {
      state: 'dead',
      diagnostic: `${CLI_DATA} (modified); authorizing scope: ${CLI_DATA}`,
    },
  },
  {
    label: 'changing an assertion in a test module without tests.modify is dead',
    scope: [LIB],
    testsModify: false,
    change: async (root) => {
      await replace(root, LIB, 'assert_eq!(add(1, 2), 3);', 'assert_eq!(add(1, 2), 4);');
    },
    expected: {
      state: 'dead',
      diagnostic: `${LIB} (test module modified); authorizing scope: ${LIB}`,
    },
  },
  {
    label: 'removing the cfg(test) attribute of a test module without tests.modify is dead',
    scope: [LIB],
    testsModify: false,
    change: async (root) => {
      await replace(root, LIB, '#[cfg(test)]\n', '');
    },
    expected: {
      state: 'dead',
      diagnostic: `${LIB} (test module modified); authorizing scope: ${LIB}`,
    },
  },
  {
    label: 'deleting a source file with a test module without tests.modify is dead',
    scope: [CLI_MAIN],
    testsModify: false,
    change: async (root) => {
      await fs.rm(path.join(root, CLI_MAIN));
    },
    expected: {
      state: 'dead',
      diagnostic: `${CLI_MAIN} (deleted); authorizing scope: ${CLI_MAIN}`,
    },
  },
  {
    label: 'adding a test inside an existing test module is no change',
    scope: [LIB],
    testsModify: false,
    change: async (root) => {
      await replace(root, LIB, '    }\n}\n', '    }\n\n    #[test]\n    fn more() {}\n}\n');
    },
    expected: { state: 'done' },
  },
  {
    label: 'changing code outside the test module is no change',
    scope: [LIB],
    testsModify: false,
    change: async (root) => {
      await replace(root, LIB, '    a + b\n', '    b + a\n');
    },
    expected: { state: 'done' },
  },
  {
    label: 'changing an assertion in a test module with tests.modify and scope is done',
    scope: [LIB],
    testsModify: true,
    change: async (root) => {
      await replace(root, LIB, 'assert_eq!(add(1, 2), 3);', 'assert_eq!(add(1, 2), 4);');
    },
    expected: { state: 'done' },
  },
  {
    label: 'appending to a crate tests file with tests.modify and scope is done',
    scope: [CORE_API],
    testsModify: true,
    change: async (root) => {
      await fs.appendFile(path.join(root, CORE_API), '// appended\n', 'utf8');
    },
    expected: { state: 'done' },
  },
  {
    label: 'creating a brand new crate test file without tests.modify is done',
    scope: [],
    testsModify: false,
    change: async (root) => {
      await fs.writeFile(
        path.join(root, 'crates/core/tests/new.rs'),
        '#[test]\nfn new() {}\n',
        'utf8',
      );
    },
    expected: { state: 'done' },
  },
];

describe('Rust tests in a Cargo workspace', () => {
  for (const row of rows) {
    it(row.label, async () => {
      const project = await setupCase(row);
      const adapter = new FileMutatingAdapter(row.change);
      const result: RunTaskResult = await runTask(
        project.root,
        project.specFolder,
        '1',
        DEFAULT_CONFIG,
        adapter,
      );

      if (row.expected.state === 'done') {
        assert.equal(result.success, true, `${row.label}: ${result.reason ?? ''}`);
        assert.equal(result.reason, undefined, row.label);
        assert.equal(await exists(path.join(project.specFolder, '.run', 'done', '1')), true);
        assert.equal(await exists(path.join(project.specFolder, '.run', 'dead', '1.md')), false);
        return;
      }

      assert.equal(result.success, false, row.label);
      assert.equal(result.reason, 'undeclared_test_change', row.label);
      const marker = await fs.readFile(
        path.join(project.specFolder, '.run', 'dead', '1.md'),
        'utf8',
      );
      assert.match(marker, /reason: undeclared_test_change/);
      assert.ok(marker.includes(`- ${row.expected.diagnostic}`), `${row.label}\n${marker}`);
    });
  }
});

describe('Crate test folders are gated', () => {
  const gated = gatedTestPathFilter(
    languageMap(['Cargo.toml', 'crates/core/Cargo.toml', 'package.json']),
  );
  const cases: ReadonlyArray<readonly [string, boolean]> = [
    ['tests/a.test.ts', true],
    ['crates/core/tests', true],
    ['crates/core/tests/api.rs', true],
    ['crates/core/tests/data/input.txt', true],
    ['crates/core/benches/speed.rs', true],
    ['benches/root.rs', true],
    ['crates/core/src/lib.rs', false],
    ['crates/core/testsuite/a.rs', false],
    ['src/tests/a.ts', false],
  ];
  for (const [relative, expected] of cases) {
    it(`answers ${expected} for ${relative}`, () => {
      assert.equal(gated(relative), expected);
    });
  }
});
