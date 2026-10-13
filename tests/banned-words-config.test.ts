import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BannedWord } from '../src/core/foundation/config-banned-words.js';
import { DEFAULT_CONFIG, defineConfig } from '../src/core/foundation/config.js';

const ERROR = /bannedWords must be a list of \{ word, paths \} entries/;

describe('Banned words configuration', () => {
  it('No banned words by default: defineConfig({}) resolves bannedWords []', () => {
    assert.deepEqual(defineConfig({}).bannedWords, []);
    assert.deepEqual(DEFAULT_CONFIG.bannedWords, []);
  });

  const validRows: Array<{ bannedWords: unknown; result: readonly BannedWord[] }> = [
    {
      bannedWords: [{ word: 'legacy', paths: ['src/**'] }],
      result: [{ word: 'legacy', paths: ['src/**'] }],
    },
    {
      bannedWords: [{ word: ' legacy ', paths: [' src/** ', 'lib/**'] }],
      result: [{ word: 'legacy', paths: ['src/**', 'lib/**'] }],
    },
    { bannedWords: [], result: [] },
  ];
  for (const row of validRows) {
    it(`A project bans words: ${JSON.stringify(row.bannedWords)} resolves to the row result`, () => {
      assert.deepEqual(
        defineConfig({ bannedWords: row.bannedWords } as never).bannedWords,
        row.result,
      );
    });
  }

  const invalidRows: unknown[] = [
    'legacy',
    ['legacy'],
    [{ word: '', paths: ['src/**'] }],
    [{ word: 'legacy' }],
    [{ word: 'legacy', paths: [] }],
    [{ word: 'legacy', paths: ['src/**', ''] }],
  ];
  for (const bannedWords of invalidRows) {
    it(`Invalid banned words: ${JSON.stringify(bannedWords)} is rejected`, () => {
      assert.throws(() => defineConfig({ bannedWords } as never), ERROR);
    });
  }
});
