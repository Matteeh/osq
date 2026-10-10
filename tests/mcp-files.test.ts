import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { McpFolderSource } from '../src/cli/mcp-files.js';
import { deleteFile, editFile, listFiles, readFile, writeFile } from '../src/cli/mcp-files.js';

const FOLDER = '001-demo';

let root: string;
let folder: string;
let outside: string;
let source: McpFolderSource;

/** Write a file under the project root, creating the folders it needs. */
async function write(rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** Every file in a tree, at its relative path with its bytes, as base64. */
async function snapshotTree(dir: string): Promise<string[]> {
  const entries: string[] = [];
  async function walk(current: string): Promise<void> {
    const children = await fs.readdir(current, { withFileTypes: true }).catch(() => null);
    if (children === null) return;
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, child.name);
      if (child.isDirectory()) {
        entries.push(`dir:${path.relative(dir, full)}`);
        await walk(full);
      } else if (child.isFile()) {
        entries.push(
          `file:${path.relative(dir, full)}:${(await fs.readFile(full)).toString('base64')}`,
        );
      }
    }
  }
  await walk(dir);
  return entries;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-mcp-files-'));
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-mcp-files-outside-'));
  folder = path.join(root, 'openspec', 'changes', FOLDER);
  await write(`openspec/changes/${FOLDER}/proposal.md`, 'a b b');
  await write(`openspec/changes/${FOLDER}/brief.md`, '# Brief\n');
  await write(`openspec/changes/${FOLDER}/.run/manifest.json`, '{}\n');
  await fs.symlink(outside, path.join(folder, 'escape'));
  source = { kind: 'local', cwd: root };
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(outside, { recursive: true, force: true });
});

describe('MCP file tools', () => {
  it('refuses every path outside the change folder and changes no file', async () => {
    const rows = [
      '../x.md',
      '/tmp/x.md',
      'tasks/../../x.md',
      '.run/approved',
      'a\\b.md',
      'escape/x.md',
    ];

    for (const bad of rows) {
      const before = await snapshotTree(root);
      const result = await writeFile(source, { change: '001', path: bad, text: 'x' });
      assert.deepEqual(
        result,
        { text: `path outside the change folder: ${bad}\n`, isError: true },
        bad,
      );
      assert.deepEqual(await snapshotTree(root), before, bad);
      assert.deepEqual(await fs.readdir(outside), [], bad);
    }
  });

  it('refuses an approved change and leaves the file unchanged', async () => {
    await write(`openspec/changes/${FOLDER}/.run/approved`, 'sha256:x\n');
    const before = await fs.readFile(path.join(folder, 'proposal.md'), 'utf8');

    const result = await writeFile(source, { change: '001', path: 'proposal.md', text: 'z' });

    assert.deepEqual(result, {
      text: "change 001-demo is approved; only an unapproved change's files move\n",
      isError: true,
    });
    assert.equal(await fs.readFile(path.join(folder, 'proposal.md'), 'utf8'), before);
  });

  it('edits when old_text occurs once and refuses otherwise', async () => {
    const proposal = path.join(folder, 'proposal.md');
    const single = await editFile(source, {
      change: '001',
      path: 'proposal.md',
      old_text: 'a',
      new_text: 'c',
    });
    assert.deepEqual(single, { text: 'edited proposal.md', isError: false });
    assert.equal(await fs.readFile(proposal, 'utf8'), 'c b b');

    await fs.writeFile(proposal, 'a b b', 'utf8');
    const missing = await editFile(source, {
      change: '001',
      path: 'proposal.md',
      old_text: 'z',
      new_text: 'c',
    });
    assert.deepEqual(missing, { text: 'old_text not found in proposal.md\n', isError: true });
    assert.equal(await fs.readFile(proposal, 'utf8'), 'a b b');

    const twice = await editFile(source, {
      change: '001',
      path: 'proposal.md',
      old_text: 'b',
      new_text: 'c',
    });
    assert.deepEqual(twice, { text: 'old_text occurs 2 times in proposal.md\n', isError: true });
    assert.equal(await fs.readFile(proposal, 'utf8'), 'a b b');
  });

  it('round trips a large file and never lists .run', async () => {
    const text = 'x'.repeat(1_000_000);
    const wrote = await writeFile(source, { change: '001', path: 'tasks/2.md', text });
    assert.deepEqual(wrote, { text: `wrote tasks/2.md (${text.length} bytes)`, isError: false });

    const listed = await listFiles(source, { change: '001' });
    assert.equal(listed.isError, false);
    const lines = listed.text.split('\n');
    assert.ok(lines.includes('tasks/2.md'));
    assert.ok(lines.every((line) => !line.startsWith('.run')));

    const read = await readFile(source, { change: '001', path: 'tasks/2.md' });
    assert.deepEqual(read, { text, isError: false });

    const removed = await deleteFile(source, { change: '001', path: 'tasks/2.md' });
    assert.deepEqual(removed, { text: 'deleted tasks/2.md', isError: false });

    const gone = await readFile(source, { change: '001', path: 'tasks/2.md' });
    assert.deepEqual(gone, { text: 'file not found: tasks/2.md\n', isError: true });
  });

  it('fails a missing or non-string argument with the argument name', async () => {
    assert.deepEqual(await listFiles(source, {}), {
      text: 'change must be a string\n',
      isError: true,
    });
    assert.deepEqual(await readFile(source, { change: '001' }), {
      text: 'path must be a string\n',
      isError: true,
    });
    assert.deepEqual(await writeFile(source, { change: '001', path: 'x.md', text: 5 }), {
      text: 'text must be a string\n',
      isError: true,
    });
  });

  it('refuses a remote change with no working copy', async () => {
    const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-mcp-files-work-'));
    try {
      await fs.mkdir(path.join(workRoot, FOLDER), { recursive: true });
      const remote: McpFolderSource = { kind: 'remote', workRoot };
      assert.deepEqual(await listFiles(remote, { change: '002' }), {
        text: 'no working copy of change 002; run the plan tool first\n',
        isError: true,
      });
      const inCopy = await writeFile(remote, { change: '001', path: 'tasks/2.md', text: 'hi' });
      assert.deepEqual(inCopy, { text: 'wrote tasks/2.md (2 bytes)', isError: false });
    } finally {
      await fs.rm(workRoot, { recursive: true, force: true });
    }
  });
});
