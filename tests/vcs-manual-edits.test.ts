import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { CommandError } from '../src/cli/command-error.js';
import { manualCommand } from '../src/cli/manual.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { MANUAL_KEEP_ADVICE, keepManualEdits } from '../src/core/vcs/manual-edits.js';
import { readManualEditRecords } from '../src/core/vcs/manual-records.js';

const execFileAsync = promisify(execFile);
const CONFIG_PATH = 'osq.config.ts';
const MANUAL_DIR = path.posix.join('openspec', 'manual');

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
    Reflect.deleteProperty(env, key);
  }
  return env;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
  return stdout.trim();
}

async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function headFiles(root: string): Promise<string[]> {
  const out = await git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], root);
  return out.split('\n').filter((line) => line.length > 0);
}

async function statusLines(root: string): Promise<string[]> {
  const out = await git(['status', '--porcelain=v1', '--untracked-files=all'], root);
  return out.split('\n').filter((line) => line.length > 0);
}

/** A living cli-foundation spec whose Code ownership covers `osq.config.ts`. */
const CLI_OWNERSHIP_SPEC = `# cli-foundation Specification

## Purpose

Owns configuration.

## Requirements

### Requirement: Code ownership
<!-- source: osq.config.ts -->
The cli-foundation capability SHALL own \`osq.config.ts\`.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved
- **THEN** system maps \`osq.config.ts\` to cli-foundation
`;

async function makeRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-manual-'));
  tmpDirs.push(root);
  await scaffoldProject(root);
  await writeAt(root, 'openspec/specs/cli-foundation/spec.md', CLI_OWNERSHIP_SPEC);
  await writeAt(root, CONFIG_PATH, 'export default { seed: true };\n');
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'Test User'], root);
  await git(['config', 'user.email', 'test@example.invalid'], root);
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'seed'], root);
  return root;
}

/** A repo whose tracked `osq.config.ts` is edited. */
async function refusalRepo(): Promise<string> {
  const root = await makeRepo();
  await writeAt(root, CONFIG_PATH, 'export default { changed: true };\n');
  return root;
}

function makeConfig(vcs: Partial<VcsConfig> = {}): OsqConfig {
  return defineConfig({
    vcs: { enabled: true, author: 'osq <osq@example.invalid>', ...vcs },
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  });
}

interface Capture {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

async function captureManual(
  root: string,
  config: OsqConfig,
  comment: string,
  paths: string[] = [],
): Promise<Capture> {
  let stdout = '';
  let stderr = '';
  try {
    await manualCommand(comment, paths, {
      cwd: root,
      config,
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    stderr += error.message.length > 0 ? `${error.message}\n` : '';
    return { stdout, stderr, exitCode: error.exitCode };
  }
}

describe('Manual edit keeping', () => {
  it('Named untracked file', async () => {
    const root = await makeRepo();
    await writeAt(root, CONFIG_PATH, 'export default { changed: true };\n');
    await writeAt(root, 'notes.txt', 'notes\n');
    const before = await git(['rev-parse', 'HEAD'], root);

    const lines = await keepManualEdits(root, makeConfig(), {
      comment: 'add notes',
      paths: ['notes.txt'],
    });

    const head = await git(['rev-parse', 'HEAD'], root);
    assert.notEqual(head, before, 'a commit was made');
    const files = await headFiles(root);
    assert.ok(files.includes('notes.txt'), 'the new commit holds notes.txt');
    assert.ok(
      files.some((file) => file.startsWith(`${MANUAL_DIR}/`) && file.endsWith('.md')),
      'the new commit holds a record',
    );
    assert.ok(!files.includes(CONFIG_PATH), 'osq.config.ts is not committed');
    assert.ok(
      (await statusLines(root)).some((line) => line.includes(CONFIG_PATH)),
      'osq.config.ts is still modified and uncommitted',
    );
    assert.deepEqual(lines, [
      `Kept notes.txt as ${await git(['rev-parse', '--short', 'HEAD'], root)}`,
    ]);
  });

  it('Change folders are never kept', async () => {
    const root = await makeRepo();
    await writeAt(root, 'openspec/changes/005-draft/proposal.md', '# draft\n');
    const before = await git(['rev-parse', 'HEAD'], root);

    await assert.rejects(() => keepManualEdits(root, makeConfig(), { comment: 'tidy' }), {
      message: 'nothing to keep: the checkout has no uncommitted edits outside openspec/changes',
    });

    assert.equal(await git(['rev-parse', 'HEAD'], root), before);
    assert.deepEqual(await readManualEditRecords(root, makeConfig()), []);
  });

  it('vcs off refuses', async () => {
    const root = await refusalRepo();
    await assert.rejects(
      () => keepManualEdits(root, makeConfig({ enabled: false }), { comment: 'x' }),
      { message: 'osq manual needs vcs.enabled and a git checkout' },
    );
  });

  describe('Manual edit refusals', () => {
    interface Row {
      readonly name: string;
      readonly config: (root: string) => OsqConfig;
      readonly comment: string;
      readonly paths: string[];
      readonly message: string;
    }

    const rows: Row[] = [
      {
        name: 'block mode',
        config: () => makeConfig({ manualEdits: 'block' }),
        comment: 'x',
        paths: [],
        message:
          'vcs.manualEdits is "block" in osq.config.ts; plan a change for these edits instead',
      },
      {
        name: 'empty comment',
        config: () => makeConfig(),
        comment: '   ',
        paths: [],
        message: 'osq manual needs a comment: osq manual "<why>"',
      },
      {
        name: 'named path under the changes folder',
        config: () => makeConfig(),
        comment: 'x',
        paths: ['openspec/changes/005-draft/proposal.md'],
        message:
          'openspec/changes/005-draft/proposal.md belongs to a change; osq manual keeps edits outside openspec/changes',
      },
      {
        name: 'named path with no uncommitted edits',
        config: () => makeConfig(),
        comment: 'x',
        paths: ['src/none.ts'],
        message: 'src/none.ts has no uncommitted edits',
      },
    ];

    for (const row of rows) {
      it(row.name, async () => {
        const root = await refusalRepo();
        const before = await git(['rev-parse', 'HEAD'], root);

        await assert.rejects(
          () => keepManualEdits(root, row.config(root), { comment: row.comment, paths: row.paths }),
          { message: row.message },
        );

        assert.equal(await git(['rev-parse', 'HEAD'], root), before, 'HEAD is unchanged');
        assert.deepEqual(await readManualEditRecords(root, makeConfig()), [], 'no record exists');
      });
    }
  });
});

describe('Manual edit commit', () => {
  it('Keep tracked edits', async () => {
    const root = await makeRepo();
    await writeAt(root, CONFIG_PATH, 'export default { changed: true };\n');
    await writeAt(root, 'notes.txt', 'notes\n');

    const lines = await keepManualEdits(root, makeConfig(), {
      comment: 'raise the verify timeout',
    });

    assert.equal(
      await git(['log', '-1', '--format=%s'], root),
      'osq: manual raise the verify timeout',
    );
    assert.equal(
      await git(['log', '-1', '--format=%an <%ae>'], root),
      'Test User <test@example.invalid>',
    );

    const files = await headFiles(root);
    assert.ok(files.includes(CONFIG_PATH), 'the commit holds osq.config.ts');
    assert.ok(
      files.some((file) => file.startsWith(`${MANUAL_DIR}/`) && file.endsWith('.md')),
      'the commit holds the record',
    );
    assert.ok(!files.includes('notes.txt'), 'notes.txt is left out');

    assert.ok(
      (await statusLines(root)).some((line) => line.includes('notes.txt')),
      'notes.txt is still untracked',
    );

    const short = await git(['rev-parse', '--short', 'HEAD'], root);
    assert.deepEqual(lines, [
      `Kept osq.config.ts as ${short}`,
      'Left out untracked: notes.txt; name them to keep them',
    ]);
  });
});

describe('Manual edit record', () => {
  it('Record of a kept edit', async () => {
    const root = await makeRepo();
    await writeAt(root, CONFIG_PATH, 'export default { changed: true };\n');

    await keepManualEdits(root, makeConfig(), {
      comment: 'raise the verify timeout',
      now: '2026-10-15T20:01:02.123Z',
    });

    const content = await fs.readFile(
      path.join(root, MANUAL_DIR, '2026-10-15T20-01-02-123Z.md'),
      'utf8',
    );
    const { data, body } = parseFrontmatter(content);
    assert.equal(data.kept_at, '2026-10-15T20:01:02.123Z');
    assert.deepEqual(data.paths, ['osq.config.ts']);
    assert.deepEqual(data.capabilities, ['cli-foundation']);
    assert.equal(body.trim(), 'raise the verify timeout');

    const records = await readManualEditRecords(root, makeConfig());
    assert.equal(records.length, 1);
    assert.equal(records[0]?.file, '2026-10-15T20-01-02-123Z.md');
    assert.equal(records[0]?.keptAt, '2026-10-15T20:01:02.123Z');
    assert.deepEqual(records[0]?.paths, ['osq.config.ts']);
    assert.deepEqual(records[0]?.capabilities, ['cli-foundation']);
    assert.equal(records[0]?.comment, 'raise the verify timeout');
  });

  it('Edit no capability owns', async () => {
    const root = await makeRepo();
    await writeAt(root, 'notes/todo.txt', 'todo\n');

    await keepManualEdits(root, makeConfig(), {
      comment: 'typo',
      paths: ['notes/todo.txt'],
      now: '2026-10-14T08:00:00.000Z',
    });

    const records = await readManualEditRecords(root, makeConfig());
    assert.deepEqual(records[0]?.capabilities, []);
  });
});

describe('Manual command', () => {
  it('Manual command keeps edits', async () => {
    const root = await makeRepo();
    await writeAt(root, CONFIG_PATH, 'export default { changed: true };\n');

    const capture = await captureManual(root, makeConfig(), 'raise the verify timeout');

    assert.equal(capture.exitCode, 0);
    assert.equal(capture.stderr, '');
    const short = await git(['rev-parse', '--short', 'HEAD'], root);
    assert.equal(capture.stdout, `Kept osq.config.ts as ${short}\n`);
  });

  it('Manual command refusal', async () => {
    const root = await refusalRepo();

    const capture = await captureManual(root, makeConfig(), '   ');

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.equal(capture.stderr, 'osq manual needs a comment: osq manual "<why>"\n');
  });
});

describe('Manual keep advice', () => {
  it('names the manual command', () => {
    assert.equal(MANUAL_KEEP_ADVICE, 'keep them with osq manual "<why>"');
  });
});
