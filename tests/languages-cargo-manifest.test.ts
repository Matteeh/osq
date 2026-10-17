import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scenario } from '@matteeh/osq/testing';
import { languageAdapter } from '../src/kernel/languages/adapter.js';
import { cargoManifestDependencies } from '../src/kernel/languages/cargo-manifest.js';

/** The spec table wraps each cell's text in backticks; read what is inside. */
function cellText(cell: string): string {
  return cell.startsWith('`') && cell.endsWith('`') ? cell.slice(1, -1) : cell;
}

const ERROR_LINE = /^line \d+: /;

scenario(
  'languages',
  'Crates a manifest declares',
  { covers: cargoManifestDependencies },
  ({ run, each }) => {
    each(
      "it returns the row's names, or `ok: false` with an error that starts with the row's line",
      (row) => {
        const source = cellText(row.manifest).replace(/\\n/g, '\n');
        const expected = cellText(row.result);
        const read = run(source);
        if (ERROR_LINE.test(expected)) {
          assert.equal(read.ok, false, expected);
          if (read.ok) return;
          assert.ok(
            read.error.startsWith(expected),
            `${read.error} does not start with ${expected}`,
          );
          return;
        }
        const names = expected === '(none)' ? [] : expected.split(', ');
        assert.deepEqual(read, { ok: true, names });
      },
    );
  },
);

scenario(
  'languages',
  'No manifest reader for other languages',
  { covers: languageAdapter },
  ({ run, then }) => {
    then('its `manifestDependencies` is null', () => {
      for (const language of ['TypeScript/JavaScript', 'Python', 'Go']) {
        assert.equal(run(language).manifestDependencies, null, language);
      }
    });
  },
);

describe('languageAdapter manifest reader', () => {
  it("sets osq's Cargo reader on Rust and null on the others", () => {
    assert.equal(languageAdapter('Rust').manifestDependencies, cargoManifestDependencies);
    assert.equal(languageAdapter('TypeScript/JavaScript').manifestDependencies, null);
    assert.equal(languageAdapter('Python').manifestDependencies, null);
    assert.equal(languageAdapter('Go').manifestDependencies, null);
  });
});
