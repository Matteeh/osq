import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { initCommand } from '../src/cli/init.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { GITATTRIBUTES_BLOCK } from '../src/core/foundation/gitattributes-block.js';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const B = GITATTRIBUTES_BLOCK;
const UPDATED_LINE = '  updated  .gitattributes (line endings)';

/** Run `osq init` in `cwd`, returning each printed stdout line without its newline. */
async function runInit(cwd: string): Promise<string[]> {
  const lines: string[] = [];
  await initCommand({
    cwd,
    config: DEFAULT_CONFIG,
    stdout: (text) => lines.push(text.replace(/\n$/, '')),
  });
  return lines;
}

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-gitattributes-'));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function readGitattributes(dir: string): Promise<string> {
  return fs.readFile(path.join(dir, '.gitattributes'), 'utf8');
}

describe('gitattributes block', () => {
  it('Gitattributes block written by init', async () => {
    const rows: Array<{
      name: string;
      before: string | null;
      after: string;
      updated: boolean;
    }> = [
      { name: 'missing', before: null, after: `${B}\n`, updated: true },
      { name: 'empty', before: '', after: `${B}\n`, updated: true },
      {
        name: 'no block',
        before: '*.png binary\n',
        after: `${B}\n\n*.png binary\n`,
        updated: true,
      },
      {
        name: 'stale block',
        before: `*.png binary\n${B.replace('* text=auto', '* text=auto eol=lf')}\n*.md text\n`,
        after: `*.png binary\n${B}\n*.md text\n`,
        updated: true,
      },
      {
        name: 'current block at the top',
        before: `${B}\n\n*.png binary\n`,
        after: `${B}\n\n*.png binary\n`,
        updated: false,
      },
      {
        name: 'current block below text',
        before: `*.png binary\n${B}\n`,
        after: `*.png binary\n${B}\n`,
        updated: false,
      },
    ];

    for (const row of rows) {
      await withTempDir(async (dir) => {
        if (row.before !== null) {
          await fs.writeFile(path.join(dir, '.gitattributes'), row.before, 'utf8');
        }
        const lines = await runInit(dir);
        assert.equal(await readGitattributes(dir), row.after, `after for ${row.name}`);
        assert.equal(lines.includes(UPDATED_LINE), row.updated, `updated line for ${row.name}`);
      });
    }
  });

  it('Gitattributes block on a second init', async () => {
    await withTempDir(async (dir) => {
      await runInit(dir);
      const second = await runInit(dir);

      assert.equal(await readGitattributes(dir), `${B}\n`);
      assert.equal(second.includes(UPDATED_LINE), false);
    });
  });
});

describe('repository scaffold', () => {
  it('keeps the osq line endings block at the top of .gitattributes', async () => {
    const content = await fs.readFile(path.join(REPO_ROOT, '.gitattributes'), 'utf8');

    assert.ok(
      content.startsWith(B),
      `.gitattributes should start with the managed block, got:\n${content.slice(0, 120)}`,
    );
  });

  it('names .gitattributes in the README file list', async () => {
    const readme = await fs.readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');

    assert.ok(
      readme.includes(
        '.gitattributes *   a managed block, * text=auto, so git stores text files with LF',
      ),
      'README should describe the .gitattributes block',
    );
  });
});
