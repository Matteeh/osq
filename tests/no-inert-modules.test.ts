import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPO_SOURCE_DIRS = [path.join(ROOT, 'src'), path.join(ROOT, 'tests')];
const HUMAN_STEPS = path.join(ROOT, 'src', 'core', 'spec', 'human-steps.ts');

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

/** Recursively collect every `.ts` and `.tsx` file under `dir`. */
async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(fullPath)));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Remove line comments and block comments, keeping string and template
 * literal contents so a `//` inside a string is not mistaken for a comment.
 */
function stripComments(source: string): string {
  let result = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      index += 2;
      while (index < source.length && source[index] !== '\n') index += 1;
    } else if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1;
      }
      index += 2;
    } else if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      result += char;
      index += 1;
      while (index < source.length) {
        const inner = source[index];
        result += inner;
        index += 1;
        if (inner === '\\') {
          if (index < source.length) {
            result += source[index];
            index += 1;
          }
        } else if (inner === quote) {
          break;
        }
      }
    } else {
      result += char;
      index += 1;
    }
  }
  return result;
}

/** True when `source` is only comments, blank lines, and `export {};`. */
function isInertStandIn(source: string): boolean {
  return stripComments(source).replace(/\s/g, '') === 'export{};';
}

/** Every `.ts`/`.tsx` file under `dirs` whose only code is `export {};`. */
async function findInertStandIns(dirs: readonly string[]): Promise<string[]> {
  const files = (await Promise.all(dirs.map(listSourceFiles))).flat();
  const offenders: string[] = [];
  for (const file of files) {
    if (isInertStandIn(await fs.readFile(file, 'utf8'))) offenders.push(file);
  }
  return offenders;
}

describe('no inert modules', () => {
  it('names a stand-in left behind', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inert-'));
    tmpDirs.push(root);
    const standIn = path.join(root, 'stand-in.ts');
    await fs.writeFile(standIn, '// removed by a change\nexport {};\n');

    assert.deepEqual(await findInertStandIns([root]), [standIn]);
  });

  it('finds no inert stand-in under src/ or tests/', async () => {
    const offenders = await findInertStandIns(REPO_SOURCE_DIRS);
    assert.deepEqual(offenders, [], `inert stand-ins: ${offenders.join(', ')}`);
  });

  it('removed VerificationRequirement from human-steps.ts', async () => {
    const source = await fs.readFile(HUMAN_STEPS, 'utf8');
    assert.equal(source.includes('VerificationRequirement'), false);
  });
});
