import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type LineRange, languageAdapter } from '../src/kernel/languages/adapter.js';
import { languageMap } from '../src/kernel/languages/language-map.js';

describe('languageMap test folders', () => {
  it('lists the test folders of a Cargo workspace', () => {
    const paths = [
      'package.json',
      'Cargo.toml',
      'crates/core/Cargo.toml',
      'crates/core/src/lib.rs',
      'crates/cli/Cargo.toml',
      'crates/cli/tests/run.rs',
    ];
    const map = languageMap(paths);
    assert.deepEqual(map.testFolders, [
      'benches',
      'crates/cli/benches',
      'crates/cli/tests',
      'crates/core/benches',
      'crates/core/tests',
      'tests',
    ]);
    assert.deepEqual(map.paths, paths);
  });

  it('has no test folders for TypeScript packages', () => {
    const map = languageMap(['package.json', 'packages/ui/package.json']);
    assert.deepEqual(map.testFolders, []);
  });
});

interface RangeRow {
  readonly source: string;
  readonly ranges: readonly LineRange[];
}

const RANGE_ROWS: readonly RangeRow[] = [
  {
    source: 'fn a() {}\n#[cfg(test)]\nmod tests {\n    fn t() {}\n}\n',
    ranges: [{ start: 2, end: 5 }],
  },
  {
    source: '#[cfg(test)]\n#[allow(dead_code)]\n// unit tests\npub(crate) mod tests {\n}\n',
    ranges: [{ start: 1, end: 5 }],
  },
  {
    source:
      '#[cfg(test)]\nmod tests {\n    const S: &str = "}";\n    const C: char = \'}\';\n    // }\n    /* } /* } */ */\n    const R: &str = r#"}"#;\n}\nfn after() {}\n',
    ranges: [{ start: 1, end: 8 }],
  },
  {
    source: "#[cfg(test)]\nmod tests {\n    fn f<'a>(x: &'a str) -> &'a str { x }\n}\n",
    ranges: [{ start: 1, end: 4 }],
  },
  {
    source: '#[cfg(test)]\nmod tests;\n',
    ranges: [],
  },
  {
    source: '#[cfg(test)]\nfn helper() {}\n',
    ranges: [],
  },
  {
    source: '// #[cfg(test)]\nmod tests {\n}\n',
    ranges: [],
  },
  {
    source: '#[cfg(not(test))]\nmod a {\n}\n',
    ranges: [],
  },
  {
    source: '#[cfg(test)]\nmod a {\n}\n#[cfg(test)]\nmod b {\n}\n',
    ranges: [
      { start: 1, end: 3 },
      { start: 4, end: 6 },
    ],
  },
  {
    source: '#[cfg(test)]\nmod outer {\n    #[cfg(test)]\n    mod inner {\n    }\n}\n',
    ranges: [{ start: 1, end: 6 }],
  },
];

describe('languageAdapter test modules', () => {
  const ranges = languageAdapter('Rust').testModuleRanges;

  it('finds inline test modules in Rust', () => {
    assert.ok(ranges);
  });

  RANGE_ROWS.forEach((row, index) => {
    it(`returns the row ${index + 1} ranges`, () => {
      assert.deepEqual(ranges?.(row.source), row.ranges);
    });
  });

  it('has no inline test modules for TypeScript', () => {
    assert.equal(languageAdapter('TypeScript/JavaScript').testModuleRanges, null);
    assert.equal(languageAdapter('Python').testModuleRanges, null);
    assert.equal(languageAdapter('Go').testModuleRanges, null);
  });
});
