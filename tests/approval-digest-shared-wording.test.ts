import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { buildApprovalDigest } from '../src/core/spec/digest.js';

const RUNNER_VERIFY = 'node --import tsx --test tests/placeholder.test.ts';

function taskContent(title: string): string {
  return `---\ntitle: ${title}\nverify: ${RUNNER_VERIFY}\nscope:\n  - src/a.ts\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] one line\n`;
}

describe('shared file approval flag wording', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-shared-wording-'));
    await fs.mkdir(path.join(projectRoot, 'openspec', 'changes'), { recursive: true });
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it("says the watcher re-runs the first task's verify for a shared file", async () => {
    const folderPath = path.join(projectRoot, 'openspec', 'changes', '001-shared');
    await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
    await fs.writeFile(
      path.join(folderPath, 'proposal.md'),
      '---\ntitle: Fixture\nverify: pnpm verify\n---\n## Goal\n\nShare a file.\n',
      'utf8',
    );
    await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskContent('First'), 'utf8');
    await fs.writeFile(path.join(folderPath, 'tasks', '2.md'), taskContent('Second'), 'utf8');

    const digest = await buildApprovalDigest(projectRoot, folderPath, DEFAULT_CONFIG);
    const shared = digest.flags.find((flag) => flag.id === 'shared_file');

    assert.ok(shared, 'a shared scope path must raise a shared_file flag');
    assert.equal(shared.label, 'shared files in tasks 1 and 2');
    assert.equal(
      shared.excerpt,
      "src/a.ts; when task 2 changes them, the watcher re-runs task 1's verify and halts only if it fails",
    );
    assert.deepEqual(
      digest.flags.map((flag) => flag.id),
      ['shared_file'],
    );
  });
});
