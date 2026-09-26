import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ts from 'typescript';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { GitVcs, runGit } from '../src/core/vcs/git-vcs.js';
import { NoVcs } from '../src/core/vcs/no-vcs.js';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const VCS_SRC = path.join(ROOT, 'src', 'core', 'vcs');
const GIT_AUTHOR = 'Osq Author <author@example.invalid>';

/** Argument literals no git argument list under `src/core/vcs/` may contain. */
const FORBIDDEN_ARGUMENTS = [
  '--force',
  '--amend',
  '--hard',
  '-D',
  '-x',
  'rebase',
  'reset',
  'filter-branch',
  'push',
  '--no-verify',
];

/** The exact members the `Vcs` port is allowed to expose. */
const PORT_MEMBERS = [
  'kind',
  'unavailableReason',
  'root',
  'head',
  'indexDigest',
  'stashList',
  'status',
  'configValue',
  'hookNames',
  'listBranches',
  'createBranch',
  'worktreeAdd',
  'worktreeRemove',
  'worktreeList',
  'commit',
  'patch',
  'discard',
];

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** The test's own git calls ignore redirecting variables, like osq's reads. */
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

/** Create a temporary repository, with a local identity and one commit. */
async function initRepo(dir: string): Promise<string> {
  await git(['init', '-q', '-b', 'main'], dir);
  await git(['config', 'user.name', 'osq'], dir);
  await git(['config', 'user.email', 'osq@example.invalid'], dir);
  await fs.writeFile(path.join(dir, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], dir);
  await git(['commit', '-qm', 'init'], dir);
  return git(['rev-parse', 'HEAD'], dir);
}

interface Scenario {
  readonly parent: string;
  readonly root: string;
  readonly vcs: GitVcs;
}

/** A temp parent holding a git repository and the worktrees its tests add. */
async function makeRepo(prefix: string): Promise<Scenario> {
  const parent = await makeTempDir(prefix);
  const root = path.join(parent, 'repo');
  await fs.mkdir(root);
  await initRepo(root);
  return { parent, root, vcs: new GitVcs(root, DEFAULT_CONFIG) };
}

/** Write an executable hook into a repository's hooks directory. */
async function writeHook(root: string, name: string, body: string): Promise<void> {
  const dir = path.resolve(root, await git(['rev-parse', '--git-path', 'hooks'], root));
  const file = path.join(dir, name);
  await fs.writeFile(file, `#!/bin/sh\n${body}\n`, 'utf8');
  await fs.chmod(file, 0o755);
}

function relative(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

describe('GitResult and runGit', () => {
  it('keeps git stderr and merges the extra environment over the cleaned one', async () => {
    const dir = await makeTempDir('osq-vcsw-run-');
    const result = await runGit(
      'node',
      ['-e', 'console.error("boom"); console.log(process.env.OSQ_EXTRA)'],
      dir,
      5,
      { OSQ_EXTRA: 'present' },
    );
    assert.equal(result.code, 0);
    assert.match(result.stdout, /present/);
    assert.match(result.stderr, /boom/);
  });
});

describe('Vcs write operations', () => {
  it('creates a branch at a base commit and fails when it already exists', async () => {
    const { root, vcs } = await makeRepo('osq-vcsw-branch-');
    const sha = await git(['rev-parse', 'HEAD'], root);
    await vcs.createBranch('osq/new', sha);
    assert.equal(await git(['rev-parse', 'osq/new'], root), sha);

    await assert.rejects(() => vcs.createBranch('osq/new', sha), /already exists/);
    assert.equal(await git(['rev-parse', 'osq/new'], root), sha);
  });

  it('adds a worktree for an existing branch and lists its path, branch, and HEAD', async () => {
    const { parent, vcs } = await makeRepo('osq-vcsw-add-');
    const wt = path.join(parent, 'wt');
    await vcs.createBranch('osq/add', 'main');
    await vcs.worktreeAdd(wt, 'osq/add');

    const entry = (await vcs.worktreeList()).find((tree) => tree.branch === 'osq/add');
    assert.ok(entry, 'expected the new worktree in the list');
    assert.equal(await fs.realpath(entry.path), await fs.realpath(wt));
    assert.match(entry.head ?? '', /^[0-9a-f]{40}$/);
  });

  it('removes a clean worktree and keeps a dirty one with its file', async () => {
    const { parent, vcs } = await makeRepo('osq-vcsw-remove-');
    const dirty = path.join(parent, 'dirty');
    const clean = path.join(parent, 'clean');
    await vcs.createBranch('osq/dirty', 'main');
    await vcs.createBranch('osq/clean', 'main');
    await vcs.worktreeAdd(dirty, 'osq/dirty');
    await vcs.worktreeAdd(clean, 'osq/clean');
    await fs.writeFile(path.join(dirty, 'seed.txt'), 'dirty\n', 'utf8');

    await assert.rejects(() => vcs.worktreeRemove(dirty));
    assert.equal(await fs.readFile(path.join(dirty, 'seed.txt'), 'utf8'), 'dirty\n');
    assert.ok((await vcs.worktreeList()).some((tree) => tree.branch === 'osq/dirty'));

    await vcs.worktreeRemove(clean);
    assert.ok(!(await vcs.worktreeList()).some((tree) => tree.branch === 'osq/clean'));
  });

  it('commits exactly the given paths with the given author and returns the commit', async () => {
    const { root, vcs } = await makeRepo('osq-vcsw-commit-');
    await fs.writeFile(path.join(root, 'a.txt'), 'a\n', 'utf8');
    await fs.writeFile(path.join(root, 'b.txt'), 'b\n', 'utf8');

    const sha = await vcs.commit(['a.txt'], 'add a', GIT_AUTHOR);
    assert.match(sha, /^[0-9a-f]{40}$/);
    const show = await git(['show', '--name-only', '--format=%an <%ae>%n%s', sha], root);
    assert.match(show, /Osq Author <author@example\.invalid>/);
    assert.match(show, /add a/);
    const tree = await git(['ls-tree', '-r', '--name-only', sha], root);
    assert.ok(tree.split('\n').includes('a.txt'));
    assert.ok(!tree.split('\n').includes('b.txt'));
  });

  it('fails with the hook output when a pre-commit hook rejects the commit', async () => {
    const { root, vcs } = await makeRepo('osq-vcsw-hook-');
    const before = await git(['rev-parse', 'HEAD'], root);
    await writeHook(root, 'pre-commit', 'echo "blocked by hook"\nexit 1');
    await fs.writeFile(path.join(root, 'file.txt'), 'x\n', 'utf8');

    await assert.rejects(() => vcs.commit(['file.txt'], 'message', GIT_AUTHOR), /blocked by hook/);
    assert.equal(await git(['rev-parse', 'HEAD'], root), before);
  });

  it('fails a commit that exceeds timeouts.gitCommitSeconds', async () => {
    const parent = await makeTempDir('osq-vcsw-slow-');
    const root = path.join(parent, 'repo');
    await fs.mkdir(root);
    await initRepo(root);
    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      timeouts: { ...DEFAULT_CONFIG.timeouts, gitCommitSeconds: 0.2 },
    };
    const vcs = new GitVcs(root, config);
    await writeHook(root, 'pre-commit', 'sleep 5');
    await fs.writeFile(path.join(root, 'slow.txt'), 'x\n', 'utf8');

    const started = Date.now();
    await assert.rejects(() => vcs.commit(['slow.txt'], 'slow', GIT_AUTHOR));
    assert.ok(Date.now() - started < 4000, 'commit was not bounded by the timeout');
  });

  it('patches modified and untracked files through a temporary index', async () => {
    const { parent, root, vcs } = await makeRepo('osq-vcsw-patch-');
    await fs.writeFile(path.join(root, 'seed.txt'), 'changed\n', 'utf8');
    await fs.writeFile(path.join(root, 'new.txt'), 'brand new\n', 'utf8');
    const before = await vcs.indexDigest();

    const patch = await vcs.patch();
    assert.match(patch, /seed\.txt/);
    assert.match(patch, /new\.txt/);
    assert.equal(await vcs.indexDigest(), before);

    const clone = path.join(parent, 'clean');
    await git(['clone', '-q', root, clone], parent);
    const patchFile = path.join(parent, 'change.patch');
    await fs.writeFile(patchFile, patch, 'utf8');
    await git(['apply', patchFile], clone);
    assert.equal(await fs.readFile(path.join(clone, 'seed.txt'), 'utf8'), 'changed\n');
    assert.equal(await fs.readFile(path.join(clone, 'new.txt'), 'utf8'), 'brand new\n');
  });

  it('discards nothing in a checkout or a linked worktree off an osq branch', async () => {
    const { parent, root, vcs } = await makeRepo('osq-vcsw-outside-');
    await fs.writeFile(path.join(root, 'seed.txt'), 'changed\n', 'utf8');
    await assert.rejects(() => vcs.discard(['seed.txt']));
    assert.equal(await fs.readFile(path.join(root, 'seed.txt'), 'utf8'), 'changed\n');

    const wt = path.join(parent, 'wt');
    await vcs.createBranch('feature/x', 'main');
    await vcs.worktreeAdd(wt, 'feature/x');
    await fs.writeFile(path.join(wt, 'seed.txt'), 'changed\n', 'utf8');
    const worktreeVcs = new GitVcs(wt, DEFAULT_CONFIG);
    await assert.rejects(() => worktreeVcs.discard(['seed.txt']));
    assert.equal(await fs.readFile(path.join(wt, 'seed.txt'), 'utf8'), 'changed\n');
  });

  it('restores tracked files, removes untracked ones, and keeps ignored ones', async () => {
    const { parent, root, vcs } = await makeRepo('osq-vcsw-discard-');
    await fs.writeFile(path.join(root, '.gitignore'), 'ignored.txt\n', 'utf8');
    await vcs.commit(['.gitignore'], 'ignore', GIT_AUTHOR);
    const wt = path.join(parent, 'wt');
    await vcs.createBranch('osq/discard', 'main');
    await vcs.worktreeAdd(wt, 'osq/discard');
    const worktreeVcs = new GitVcs(wt, DEFAULT_CONFIG);

    await fs.writeFile(path.join(wt, 'seed.txt'), 'modified\n', 'utf8');
    await fs.writeFile(path.join(wt, 'untracked.txt'), 'new\n', 'utf8');
    await fs.writeFile(path.join(wt, 'ignored.txt'), 'ignored\n', 'utf8');
    await worktreeVcs.discard(['seed.txt', 'untracked.txt', 'ignored.txt']);

    assert.equal(await fs.readFile(path.join(wt, 'seed.txt'), 'utf8'), 'seed\n');
    await assert.rejects(() => fs.readFile(path.join(wt, 'untracked.txt')));
    assert.equal(await fs.readFile(path.join(wt, 'ignored.txt'), 'utf8'), 'ignored\n');
  });
});

describe('Vcs port reads for writes', () => {
  it('lists only executable, non-sample hooks', async () => {
    const { root, vcs } = await makeRepo('osq-vcsw-hooks-');
    await writeHook(root, 'pre-commit', 'exit 0');
    await writeHook(root, 'pre-push.sample', 'exit 0');
    assert.deepEqual(await vcs.hookNames(), ['pre-commit']);
  });

  it('filters branches by prefix and reads git config values', async () => {
    const { root, vcs } = await makeRepo('osq-vcsw-config-');
    const sha = await git(['rev-parse', 'HEAD'], root);
    await vcs.createBranch('osq/one', sha);
    await vcs.createBranch('osq/two', sha);
    await vcs.createBranch('other', sha);
    assert.deepEqual(await vcs.listBranches('osq/'), ['osq/one', 'osq/two']);

    await git(['config', 'commit.gpgsign', 'true'], root);
    assert.equal(await vcs.configValue('commit.gpgsign'), 'true');
    assert.equal(await vcs.configValue('does.not.exist'), null);
  });

  it('reports a worktree on a detached HEAD with a null branch', async () => {
    const { parent, root, vcs } = await makeRepo('osq-vcsw-detached-');
    const sha = await git(['rev-parse', 'HEAD'], root);
    const wt = path.join(parent, 'detached');
    await vcs.createBranch('osq/detached', sha);
    await vcs.worktreeAdd(wt, 'osq/detached');
    await git(['checkout', '-q', sha], wt);

    const entry = (await vcs.worktreeList()).find((tree) => tree.branch === null);
    assert.ok(entry, 'expected the detached worktree');
    assert.equal(entry.head, sha);
  });
});

describe('NoVcs writes', () => {
  it('rejects every write naming the reason and answers new reads emptily', async () => {
    const vcs = new NoVcs('not a git repository');
    assert.equal(await vcs.configValue('x'), null);
    assert.deepEqual(await vcs.hookNames(), []);
    assert.deepEqual(await vcs.listBranches('osq/'), []);
    assert.deepEqual(await vcs.worktreeList(), []);

    const writes = [
      () => vcs.createBranch('osq/x', 'main'),
      () => vcs.worktreeAdd('/tmp/x', 'osq/x'),
      () => vcs.worktreeRemove('/tmp/x'),
      () => vcs.commit([], 'm', GIT_AUTHOR),
      () => vcs.patch(),
      () => vcs.discard([]),
    ];
    for (const write of writes) {
      await assert.rejects(write, /not a git repository/);
    }
  });
});

describe('Operations osq never runs', () => {
  it('has no forbidden git argument literal under src/core/vcs', async () => {
    const entries = await fs.readdir(VCS_SRC, { withFileTypes: true });
    const findings: string[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
      const file = path.join(VCS_SRC, entry.name);
      const source = await fs.readFile(file, 'utf8');
      const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (
          (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
          FORBIDDEN_ARGUMENTS.includes(node.text)
        ) {
          findings.push(`${relative(file)}: ${node.text}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(parsed);
    }
    assert.deepEqual(findings, []);
  });

  it('exposes exactly the intended members on the port', async () => {
    const file = path.join(VCS_SRC, 'vcs.ts');
    const source = await fs.readFile(file, 'utf8');
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const members: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isInterfaceDeclaration(node) && node.name.text === 'Vcs') {
        for (const member of node.members) {
          if (member.name !== undefined && ts.isIdentifier(member.name)) {
            members.push(member.name.text);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(parsed);
    assert.deepEqual(members.sort(), [...PORT_MEMBERS].sort());
  });
});
