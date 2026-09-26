import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseTaskMd } from '../src/core/spec/parser.js';
import {
  findTopLevelFunctions,
  hashFunctionRange,
  mutationRanges,
  readScopedFunctionHashes,
} from '../src/core/trace/function-ranges.js';
import type { MeasuresEventData } from '../src/harness/types.js';
import { gatherStartMeasures } from '../src/watcher/measures.js';

const FIXTURE_PATH = fileURLToPath(
  new URL('../fixture/trace/pricing/src/pricing/quote.ts', import.meta.url),
);
const FIXTURE_FILE = 'src/pricing/quote.ts';

function sha256(content: string): string {
  return `sha256:${crypto.createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

function rangeText(source: string, start: number, end: number): string {
  return source
    .split('\n')
    .slice(start - 1, end)
    .join('\n');
}

describe('function ranges', () => {
  describe('findTopLevelFunctions', () => {
    it('reads every top-level declaration form with its column and export state', () => {
      const source = [
        'function plain() {',
        '  return 1;',
        '}',
        'async function worker() {',
        '  return 2;',
        '}',
        'export function shipped() {',
        '  return 3;',
        '}',
        'export async function shippedAsync() {',
        '  return 4;',
        '}',
        'const arrow = () => {',
        '  return 5;',
        '};',
        'const asyncArrow = async () => {',
        '  return 6;',
        '};',
        'const expr = function () {',
        '  return 7;',
        '};',
        'export const oneLiner = (n: number) => n * 2;',
        'export const exprFn = function () {',
        '  return 8;',
        '};',
        'export const asyncExprFn = async function () {',
        '  return 9;',
        '};',
      ].join('\n');

      const functions = findTopLevelFunctions('src/forms.ts', source);
      const summary = functions.map((fn) => ({
        name: fn.name,
        line: fn.line,
        endLine: fn.endLine,
        exported: fn.exported,
        known: fn.known,
      }));

      assert.deepEqual(summary, [
        { name: 'plain', line: 1, endLine: 3, exported: false, known: true },
        { name: 'worker', line: 4, endLine: 6, exported: false, known: true },
        { name: 'shipped', line: 7, endLine: 9, exported: true, known: true },
        { name: 'shippedAsync', line: 10, endLine: 12, exported: true, known: true },
        { name: 'arrow', line: 13, endLine: 15, exported: false, known: true },
        { name: 'asyncArrow', line: 16, endLine: 18, exported: false, known: true },
        { name: 'expr', line: 19, endLine: 21, exported: false, known: true },
        { name: 'oneLiner', line: 22, endLine: 22, exported: true, known: true },
        { name: 'exprFn', line: 23, endLine: 25, exported: true, known: true },
        { name: 'asyncExprFn', line: 26, endLine: 28, exported: true, known: true },
      ]);
    });

    it('reads the fixture quote file: two private helpers and one exported function', () => {
      const source = readFileSync(FIXTURE_PATH, 'utf8');

      const functions = findTopLevelFunctions(FIXTURE_FILE, source);
      const summary = functions.map((fn) => ({
        name: fn.name,
        line: fn.line,
        endLine: fn.endLine,
        exported: fn.exported,
        known: fn.known,
      }));

      assert.deepEqual(summary, [
        { name: 'roundHalfUp', line: 15, endLine: 17, exported: false, known: true },
        { name: 'tierPrice', line: 20, endLine: 24, exported: false, known: true },
        { name: 'quote', line: 33, endLine: 39, exported: true, known: true },
      ]);
    });
  });

  describe('mutationRanges', () => {
    const source = readFileSync(FIXTURE_PATH, 'utf8');

    it('includes the private helper the covered function calls', () => {
      assert.deepEqual(mutationRanges(FIXTURE_FILE, source, 'quote'), [
        `${FIXTURE_FILE}:20-24`,
        `${FIXTURE_FILE}:33-39`,
      ]);
    });

    it('returns only the own range for a function that calls no private top-level helper', () => {
      assert.deepEqual(mutationRanges(FIXTURE_FILE, source, 'tierPrice'), [
        `${FIXTURE_FILE}:20-24`,
      ]);
    });

    it('follows a nested helper chain through private functions only', () => {
      const nested = [
        'function leaf() { return 1; }',
        'function middle(): number {',
        '  return leaf();',
        '}',
        'export function top(): number {',
        '  return middle();',
        '}',
      ].join('\n');

      assert.deepEqual(mutationRanges('src/nested.ts', nested, 'top'), [
        'src/nested.ts:1-1',
        'src/nested.ts:2-4',
        'src/nested.ts:5-7',
      ]);
    });

    it('includes a helper called by two different exported functions', () => {
      const shared = [
        'function shared(): number {',
        '  return 2;',
        '}',
        'export function first(): number {',
        '  return shared();',
        '}',
        'export function second(): number {',
        '  return shared() + 1;',
        '}',
      ].join('\n');

      assert.deepEqual(mutationRanges('src/shared.ts', shared, 'first'), [
        'src/shared.ts:1-3',
        'src/shared.ts:4-6',
      ]);
      assert.deepEqual(mutationRanges('src/shared.ts', shared, 'second'), [
        'src/shared.ts:1-3',
        'src/shared.ts:7-9',
      ]);
    });

    it('returns null for a name that no top-level declaration matches', () => {
      assert.equal(mutationRanges(FIXTURE_FILE, source, 'missing'), null);
    });
  });

  describe('range boundaries and balance', () => {
    it('keeps the range open across strings holding a brace and a template with a stray brace', () => {
      const source = [
        'export function tricky(): number {',
        "  const a = '{';",
        '  const b = `${a}}`;',
        '  return 1;',
        '}',
      ].join('\n');

      const [fn] = findTopLevelFunctions('src/tricky.ts', source);
      assert.equal(fn?.endLine, 5);
      assert.equal(fn?.known, true);
      assert.deepEqual(mutationRanges('src/tricky.ts', source, 'tricky'), ['src/tricky.ts:1-5']);
    });

    it('balances a return type that carries braces', () => {
      const source = [
        'export function build(): { total: number } {',
        '  return { total: 1 };',
        '}',
      ].join('\n');

      const [fn] = findTopLevelFunctions('src/build.ts', source);
      assert.equal(fn?.endLine, 3);
      assert.equal(fn?.known, true);
    });

    it('ignores a comment that holds a closing brace', () => {
      const source = [
        'export function commented(): number {',
        '  // }',
        '  /* ) ] */',
        '  return 1;',
        '}',
      ].join('\n');

      const [fn] = findTopLevelFunctions('src/commented.ts', source);
      assert.equal(fn?.endLine, 5);
      assert.equal(fn?.known, true);
    });

    it('reads a range with unbalanced delimiters as unknown', () => {
      const source = ['export function broken(): number {', '  return (1;', '}'].join('\n');

      const [fn] = findTopLevelFunctions('src/broken.ts', source);
      assert.equal(fn?.known, false);
      assert.equal(mutationRanges('src/broken.ts', source, 'broken'), null);
    });
  });

  describe('hashFunctionRange', () => {
    const source = readFileSync(FIXTURE_PATH, 'utf8');

    it('hashes the text of the function own range', () => {
      assert.equal(
        hashFunctionRange(FIXTURE_FILE, source, 'quote'),
        sha256(rangeText(source, 33, 39)),
      );
      assert.equal(
        hashFunctionRange(FIXTURE_FILE, source, 'tierPrice'),
        sha256(rangeText(source, 20, 24)),
      );
    });

    it('returns null when the range is unknown or the name is absent', () => {
      const broken = ['export function broken(): number {', '  return (1;', '}'].join('\n');
      assert.equal(hashFunctionRange('src/broken.ts', broken, 'broken'), null);
      assert.equal(hashFunctionRange(FIXTURE_FILE, source, 'missing'), null);
    });
  });
});

describe('function baseline', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-function-ranges-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeScoped(relativePath: string, content: string): Promise<void> {
    const full = path.join(tmpDir, relativePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf8');
  }

  async function startMeasures(scopeFile: string): Promise<MeasuresEventData> {
    const specFolder = path.join(tmpDir, 'openspec', 'changes', '001-probe');
    await fs.mkdir(specFolder, { recursive: true });
    const task = [
      '---',
      'title: Probe',
      'verify: node -e "process.exit(0)"',
      `scope: ['${scopeFile}']`,
      'entry: []',
      'skills: []',
      '---',
      '## Acceptance',
      '- [ ] a line',
    ].join('\n');
    return gatherStartMeasures(tmpDir, specFolder, parseTaskMd(task));
  }

  it('hashes each scoped exported function carrying a @scenario tag', async () => {
    const tagged = [
      '/**',
      ' * @scenario pricing: Volume discount tiers',
      ' */',
      'export function quote(quantity: number): number {',
      '  return tierPrice(quantity);',
      '}',
      '',
      'function tierPrice(quantity: number): number {',
      '  return quantity;',
      '}',
    ].join('\n');
    await writeScoped('src/pricing/quote.ts', tagged);

    const hashes = await readScopedFunctionHashes(tmpDir, ['src/pricing/quote.ts']);

    assert.deepEqual(hashes, {
      'src/pricing/quote.ts#quote': sha256(rangeText(tagged, 4, 6)),
    });
  });

  it('maps a tagged function with an unknown range to null', async () => {
    const broken = [
      '/**',
      ' * @scenario pricing: Volume discount tiers',
      ' */',
      'export function broken(): number {',
      '  return (1;',
      '}',
    ].join('\n');
    await writeScoped('src/pricing/broken.ts', broken);

    const hashes = await readScopedFunctionHashes(tmpDir, ['src/pricing/broken.ts']);

    assert.deepEqual(hashes, { 'src/pricing/broken.ts#broken': null });
  });

  it('leaves functionHashes out of a start event whose scope has no tagged function', async () => {
    await writeScoped(
      'src/pricing/plain.ts',
      ['export function plain(): number {', '  return 1;', '}'].join('\n'),
    );

    const measures = await startMeasures('src/pricing/plain.ts');

    assert.equal(measures.functionHashes, undefined);
    assert.equal('functionHashes' in measures, false);
  });

  it('adds functionHashes to a start event whose scope has a tagged function', async () => {
    const tagged = [
      '/**',
      ' * @scenario pricing: Volume discount tiers',
      ' */',
      'export function quote(quantity: number): number {',
      '  return tierPrice(quantity);',
      '}',
      '',
      'function tierPrice(quantity: number): number {',
      '  return quantity;',
      '}',
    ].join('\n');
    await writeScoped('src/pricing/quote.ts', tagged);

    const measures = await startMeasures('src/pricing/quote.ts');

    assert.deepEqual(measures.functionHashes, {
      'src/pricing/quote.ts#quote': sha256(rangeText(tagged, 4, 6)),
    });
  });
});
