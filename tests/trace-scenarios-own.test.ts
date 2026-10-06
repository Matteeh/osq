import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenario } from '@matteeh/osq/testing';
import { scanSource } from '../src/core/trace/tag-scan.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const OWN_LINKS_TEST = /^trace-own-links-.*\.test\.ts$/;

/** Every `tests/trace-own-links-*.test.ts` file, relative to the repository root. */
function ownLinksFiles(): string[] {
  return readdirSync(path.join(ROOT, 'tests'))
    .filter((name) => OWN_LINKS_TEST.test(name))
    .sort()
    .map((name) => `tests/${name}`);
}

scenario('traceability', 'Tag read', { covers: scanSource }, async ({ run, then }) => {
  const file = 'src/core/trace/test-path.ts';
  const scan = run(file, readFileSync(path.join(ROOT, file), 'utf8'));
  await then('it records `isTestPath` serving `traceability: Test and source paths`', () => {
    const found = scan.functions.find((candidate) => candidate.name === 'isTestPath');
    assert.ok(found, `${file} does not declare isTestPath`);
    assert.deepEqual(found.scenarios, [
      { capability: 'traceability', name: 'Test and source paths' },
    ]);
  });
});

scenario(
  'traceability',
  'Source checks outside scenario tests',
  { covers: readFileSync },
  async ({ run, then }) => {
    const files = ownLinksFiles();
    const texts = files.map((file) => run(path.join(ROOT, file), 'utf8'));
    await then('none mentions `@matteeh/osq/testing`', () => {
      assert.ok(files.length > 0, 'no tests/trace-own-links-*.test.ts files');
      for (const [index, file] of files.entries()) {
        assert.ok(
          !String(texts[index]).includes('@matteeh/osq/testing'),
          `${file} mentions the testing helper`,
        );
      }
    });
  },
);
