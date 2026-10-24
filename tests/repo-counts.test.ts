import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, mock } from 'node:test';
import { gatherRepoCounts } from '../src/watcher/repo-counts.js';

const roots: string[] = [];

afterEach(async () => {
  mock.restoreAll();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

/** A temporary folder registered for cleanup. */
async function tempDir(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

/** Run one git command in `cwd`, failing the test on a non-zero exit. */
function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

/**
 * A git repository tracking `src/a.ts` (`a\nb\n`), `notes.txt` (`hello`),
 * `logo.bin` (`x\u0000y`) and the `link.txt` symlink. Git ignores `target/`,
 * which holds 200 build files, and `scratch.txt` is untracked.
 */
async function richRepo(): Promise<string> {
  const root = await tempDir('osq-repo-counts-');
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'Test']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'a.ts'), 'a\nb\n', 'utf8');
  await fs.writeFile(path.join(root, 'notes.txt'), 'hello', 'utf8');
  await fs.writeFile(path.join(root, 'logo.bin'), Buffer.from('x\u0000y', 'utf8'));
  await fs.symlink('notes.txt', path.join(root, 'link.txt'));
  const debugDir = path.join(root, 'target', 'debug');
  await fs.mkdir(debugDir, { recursive: true });
  for (let index = 0; index < 200; index += 1) {
    await fs.writeFile(path.join(debugDir, `file-${index}.o`), 'junk\n', 'utf8');
  }
  await fs.writeFile(path.join(root, '.git', 'info', 'exclude'), 'target/\n', 'utf8');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'seed']);
  await fs.writeFile(path.join(root, 'scratch.txt'), 'one\ntwo\n', 'utf8');
  return root;
}

/** Count `fs.readFile` calls by path while delegating to the real implementation. */
function countReads(): Map<string, number> {
  const reads = new Map<string, number>();
  const original = fs.readFile.bind(fs);
  mock.method(fs, 'readFile', (...args: unknown[]) => {
    const filePath = String(args[0]);
    reads.set(filePath, (reads.get(filePath) ?? 0) + 1);
    return (original as (...rest: unknown[]) => Promise<unknown>)(...args);
  });
  return reads;
}

describe('gatherRepoCounts', () => {
  it('counts only tracked text files, never ignored or untracked ones', async () => {
    const root = await richRepo();
    const reads = countReads();

    const counts = await gatherRepoCounts(root);

    assert.deepEqual(counts, { files: 2, lines: 4 });
    const underIgnored = [...reads.keys()].filter((file) =>
      file.startsWith(path.join(root, 'target') + path.sep),
    );
    assert.deepEqual(underIgnored, []);
    assert.equal(reads.has(path.join(root, 'scratch.txt')), false);
    assert.equal(reads.has(path.join(root, 'src', 'a.ts')), true);
    assert.equal(reads.has(path.join(root, 'notes.txt')), true);
    assert.equal(reads.has(path.join(root, 'logo.bin')), true);
  });

  it('reads no tracked file on a warm run and gives the same counts', async () => {
    const root = await richRepo();
    const first = await gatherRepoCounts(root);
    const reads = countReads();

    const second = await gatherRepoCounts(root);

    assert.deepEqual(second, first);
    assert.deepEqual([...reads], []);
  });

  it('reads a changed tracked file and skips a deleted one, committed or not', async () => {
    const root = await richRepo();
    await gatherRepoCounts(root);
    await fs.writeFile(path.join(root, 'src', 'a.ts'), 'a\n', 'utf8');
    await fs.rm(path.join(root, 'notes.txt'));

    const uncommitted = await gatherRepoCounts(root);
    assert.deepEqual(uncommitted, { files: 1, lines: 2 });

    git(root, ['commit', '-a', '-m', 'shrink']);

    const committed = await gatherRepoCounts(root);
    assert.deepEqual(committed, { files: 1, lines: 2 });
  });

  it('recreates a deleted index and gives the same counts', async () => {
    const root = await richRepo();
    const first = await gatherRepoCounts(root);
    await fs.rm(path.join(root, '.osq', 'index.sqlite'), { force: true });

    const second = await gatherRepoCounts(root);

    assert.deepEqual(second, first);
    await fs.access(path.join(root, '.osq', 'index.sqlite'));
  });

  it('reads every tracked path when the index cannot open', async () => {
    const root = await richRepo();
    await fs.writeFile(path.join(root, '.osq'), 'not a folder', 'utf8');

    const counts = await gatherRepoCounts(root);

    assert.deepEqual(counts, { files: 2, lines: 4 });
  });

  it('walks a folder with no git repository', async () => {
    const root = await tempDir('osq-repo-counts-plain-');
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'a.ts'), 'a\n', 'utf8');
    await fs.writeFile(path.join(root, 'notes.txt'), 'hello', 'utf8');
    await fs.mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
    await fs.writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), 'junk\n', 'utf8');

    const counts = await gatherRepoCounts(root);

    assert.deepEqual(counts, { files: 2, lines: 3 });
  });
});
