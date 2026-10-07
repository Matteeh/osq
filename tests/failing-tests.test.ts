import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFailingTestFiles } from '../src/core/run/failing-tests.js';

const ROOT = '/repo';
const PREFIX = '✖ failing tests:';

describe('readFailingTestFiles', () => {
  it('reads each path form of the failing-tests section table', () => {
    const rows: Array<{ line: string; read: string | null }> = [
      { line: 'test at tests/inbox.test.ts:2:14782', read: 'tests/inbox.test.ts' },
      { line: 'test at file:///repo/tests/report.test.ts:1:1966', read: 'tests/report.test.ts' },
      { line: 'test at /repo/tests/watch.test.ts:7:7902', read: 'tests/watch.test.ts' },
      { line: '✖ reads the inbox (3148.737208ms)', read: null },
      { line: '    at TestContext.<anonymous> (tests/inbox.test.ts:571:14)', read: null },
    ];

    for (const row of rows) {
      assert.deepEqual(
        readFailingTestFiles(`${PREFIX}\n${row.line}\n`, ROOT),
        row.read === null ? null : [row.read],
        `line: ${row.line}`,
      );
    }
  });

  it('reads every path of one section, distinct and sorted', () => {
    const output = [
      'some earlier output',
      PREFIX,
      'test at tests/inbox.test.ts:2:14782',
      'test at file:///repo/tests/report.test.ts:1:1966',
      'test at /repo/tests/watch.test.ts:7:7902',
      'test at tests/inbox.test.ts:9:1',
      '✖ reads the inbox (3148.737208ms)',
      '    at TestContext.<anonymous> (tests/inbox.test.ts:571:14)',
    ].join('\n');

    assert.deepEqual(readFailingTestFiles(output, ROOT), [
      'tests/inbox.test.ts',
      'tests/report.test.ts',
      'tests/watch.test.ts',
    ]);
  });

  it('reads a test-at line indented after leading whitespace', () => {
    assert.deepEqual(
      readFailingTestFiles(`${PREFIX}\n  test at tests/indented.test.ts:1:1\n`, ROOT),
      ['tests/indented.test.ts'],
    );
  });

  it('returns null without a failing-tests section', () => {
    assert.equal(readFailingTestFiles('all good\n', ROOT), null);
    assert.equal(readFailingTestFiles('', ROOT), null);
  });

  it('returns null when the section names no file', () => {
    assert.equal(readFailingTestFiles(`${PREFIX}\n✖ reads the inbox (1ms)\n`, ROOT), null);
  });

  it('ignores lines before the last failing-tests section', () => {
    const output = [
      'test at tests/early.test.ts:1:1',
      PREFIX,
      'test at tests/late.test.ts:1:1',
    ].join('\n');

    assert.deepEqual(readFailingTestFiles(output, ROOT), ['tests/late.test.ts']);
  });

  it('reads only the last of two failing-tests sections', () => {
    const output = [
      PREFIX,
      'test at tests/first.test.ts:1:1',
      PREFIX,
      'test at tests/second.test.ts:1:1',
    ].join('\n');

    assert.deepEqual(readFailingTestFiles(output, ROOT), ['tests/second.test.ts']);
  });
});
