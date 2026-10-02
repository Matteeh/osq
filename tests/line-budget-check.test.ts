import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { checkLineBudget } from './line-budget-check.js';

const MAX_LINES = 250;
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
});

/** Build `<tmp>/src` with the given files, each `lines` counted lines long. */
async function makeTree(files: Record<string, number>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-line-budget-'));
  roots.push(root);
  const sourceDir = path.join(root, 'src');
  for (const [relative, lines] of Object.entries(files)) {
    const file = path.join(sourceDir, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Array(lines).fill('x').join('\n'));
  }
  return sourceDir;
}

describe('checkLineBudget', () => {
  it('fails a same-named unlisted file over the limit and names its path', async () => {
    const sourceDir = await makeTree({
      'harness/types.ts': MAX_LINES + 50,
      'core/foo/types.ts': 300,
    });

    const violations = await checkLineBudget(sourceDir, ['harness/types.ts'], MAX_LINES);

    assert.deepEqual(violations, [`src/core/foo/types.ts has 300 lines (max ${MAX_LINES})`]);
  });

  it('exempts a listed path that is over the limit', async () => {
    const sourceDir = await makeTree({ 'harness/types.ts': 300 });

    const violations = await checkLineBudget(sourceDir, ['harness/types.ts'], MAX_LINES);

    assert.deepEqual(violations, []);
  });

  it('fails a listed path that is within the budget', async () => {
    const sourceDir = await makeTree({ 'harness/types.ts': 10 });

    const violations = await checkLineBudget(sourceDir, ['harness/types.ts'], MAX_LINES);

    assert.deepEqual(violations, [
      `src/harness/types.ts has 10 lines, within the ${MAX_LINES}-line budget; remove it from the allow list`,
    ]);
  });

  it('fails a listed path that no longer exists', async () => {
    const sourceDir = await makeTree({ 'harness/types.ts': 10 });

    const violations = await checkLineBudget(sourceDir, ['core/spec/gone.ts'], MAX_LINES);

    assert.deepEqual(violations, ['src/core/spec/gone.ts no longer exists']);
  });

  it('returns no violations for a clean tree', async () => {
    const sourceDir = await makeTree({ 'core/a.ts': 200, 'harness/b.ts': 20 });

    const violations = await checkLineBudget(sourceDir, [], MAX_LINES);

    assert.deepEqual(violations, []);
  });

  it('ignores declaration files', async () => {
    const sourceDir = await makeTree({ 'harness/types.d.ts': 300, 'harness/types.ts': 5 });

    const violations = await checkLineBudget(sourceDir, [], MAX_LINES);

    assert.deepEqual(violations, []);
  });
});
