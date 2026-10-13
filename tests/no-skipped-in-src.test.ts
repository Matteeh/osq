import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { BannedWord } from '../src/core/foundation/config-banned-words.js';
import { loadConfig } from '../src/core/foundation/config.js';
import { resolveScope } from '../src/core/run/scope.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Read every file each ban's paths resolve to and return the offending
 * repository-relative paths. Fails when no ban is configured or a ban's paths
 * match no existing file, so a ban that stops covering anything is caught.
 */
async function findBannedWordFiles(
  projectRoot: string,
  entries: readonly BannedWord[],
): Promise<string[]> {
  assert.ok(entries.length > 0, 'expected at least one bannedWords entry in osq.config.ts');

  const offenders: string[] = [];
  for (const entry of entries) {
    const resolved = await resolveScope(projectRoot, entry.paths);
    const files = resolved.filter((item) => item.absolutePath !== null);
    assert.ok(
      files.length > 0,
      `bannedWords entry "${entry.word}" matches no file under ${entry.paths.join(', ')}`,
    );
    const word = entry.word.toLowerCase();
    for (const file of files) {
      if (file.absolutePath === null) continue;
      const content = await fs.readFile(file.absolutePath, 'utf8');
      if (content.toLowerCase().includes(word)) {
        offenders.push(file.relativePath);
      }
    }
  }
  return offenders;
}

describe('no banned words in the files this project bans', () => {
  it("osq's own config bans no word from the files its paths cover", async () => {
    const config = await loadConfig(REPO_ROOT);

    const offenders = await findBannedWordFiles(REPO_ROOT, config.bannedWords ?? []);

    assert.deepEqual(offenders, [], `banned words found in: ${offenders.join(', ')}`);
  });

  it('fails when no banned word is configured', async () => {
    await assert.rejects(findBannedWordFiles(REPO_ROOT, []), /at least one bannedWords entry/);
  });
});

describe('the ban check itself', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-banned-words-'));
    await fs.mkdir(path.join(tmpDir, 'lib'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("fails when an entry's paths match no file", async () => {
    await assert.rejects(
      findBannedWordFiles(tmpDir, [{ word: 'legacy', paths: ['nowhere/**'] }]),
      /matches no file/,
    );
  });

  it('fails naming the files that contain the entry word, ignoring case', async () => {
    await fs.writeFile(path.join(tmpDir, 'lib', 'clean.ts'), 'const fresh = 1;\n', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'lib', 'one.ts'), 'const LEGACY = 1;\n', 'utf8');

    const offenders = await findBannedWordFiles(tmpDir, [{ word: 'legacy', paths: ['lib/**'] }]);

    assert.deepEqual(offenders, ['lib/one.ts']);
  });
});
