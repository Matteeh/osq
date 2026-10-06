import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenario } from '@matteeh/osq/testing';
import { parseTaskMd } from '../src/core/spec/parser.js';
import { findTopLevelFunctions, mutationRanges } from '../src/core/trace/function-ranges.js';
import { gatherStartMeasures } from '../src/watcher/measures.js';

const FIXTURE_PATH = fileURLToPath(
  new URL('../fixture/trace/pricing/src/pricing/quote.ts', import.meta.url),
);
const FIXTURE_FILE = 'src/pricing/quote.ts';

/** A function whose body holds a brace inside a string and one in a template. */
const TRICKY_SOURCE = [
  'export function tricky(): number {',
  "  const a = '{';",
  '  const b = `${a}}`;',
  '  return 1;',
  '}',
].join('\n');

/** Build a temporary project whose one scoped file has no tagged function. */
async function makeUntagged(): Promise<{ root: string; specFolder: string; task: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scenarios-ranges-'));
  const scopeFile = 'src/pricing/plain.ts';
  const full = path.join(root, scopeFile);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(
    full,
    ['export function plain(): number {', '  return 1;', '}'].join('\n'),
    'utf8',
  );
  const specFolder = path.join(root, 'openspec', 'changes', '001-probe');
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
  return { root, specFolder, task };
}

scenario(
  'traceability',
  'Braces inside strings',
  { covers: findTopLevelFunctions },
  async ({ run, then }) => {
    const functions = run('src/tricky.ts', TRICKY_SOURCE);
    await then('its range still ends at its closing line', () => {
      const fn = functions.find((entry) => entry.name === 'tricky');
      assert.ok(fn !== undefined, 'no tricky function');
      assert.equal(fn.endLine, 5);
      assert.equal(fn.known, true);
    });
  },
);

scenario(
  'traceability',
  'Private helper included',
  { covers: mutationRanges },
  async ({ run, then }) => {
    const source = readFileSync(FIXTURE_PATH, 'utf8');
    const ranges = run(FIXTURE_FILE, source, 'quote');
    await then(
      "`quote`'s mutation ranges are `src/pricing/quote.ts:20-24` and `src/pricing/quote.ts:33-39`",
      () => {
        assert.deepEqual(ranges, [`${FIXTURE_FILE}:20-24`, `${FIXTURE_FILE}:33-39`]);
      },
    );
  },
);

scenario(
  'traceability',
  'Untagged scope',
  { covers: gatherStartMeasures },
  async ({ run, then }) => {
    const { root, specFolder, task } = await makeUntagged();
    try {
      const measures = await run(root, specFolder, parseTaskMd(task));
      await then('its `measures` start event has no `functionHashes`', () => {
        assert.equal(measures.functionHashes, undefined);
        assert.equal('functionHashes' in measures, false);
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  },
);
