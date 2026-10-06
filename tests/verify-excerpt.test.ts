import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { excerptVerifyOutput } from '../src/core/run/verify-excerpt.js';
import { verifyArchiveStep } from '../src/watcher/archive-verify.js';

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

const SOURCE = 'the verify_ran event in .run/events/change.jsonl';
const LIMITS = { markerOutputLines: 40, markerLineChars: 400 };
const FULL_OUTPUT_LINE = `Full output: ${SOURCE}`;

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

function numberedLines(count: number, prefix = 'line'): string {
  return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`).join('\n');
}

async function readEvents(specFolder: string): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(specFolder, '.run', 'events', 'change.jsonl'), 'utf8')
    .catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

/** Lay out a change folder and a local failing script the archive verifier can run. */
async function makeProject(
  script: string,
): Promise<{ root: string; specFolder: string; runDir: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-verify-excerpt-'));
  roots.push(root);
  const specFolder = path.join(root, 'openspec', 'changes', '001-excerpt');
  const runDir = path.join(specFolder, '.run');
  await fs.mkdir(specFolder, { recursive: true });
  await fs.writeFile(path.join(root, 'excerpt-fail.cjs'), script, 'utf8');
  return { root, specFolder, runDir };
}

describe('excerptVerifyOutput', () => {
  it('keeps the last configured lines when there is no failing-tests section', () => {
    const excerpt = excerptVerifyOutput(numberedLines(100), SOURCE, LIMITS);
    const lines = excerpt.split('\n');

    assert.equal(lines.length, 41);
    assert.equal(lines[0], 'line 61');
    assert.equal(lines[39], 'line 100');
    assert.equal(lines[40], FULL_OUTPUT_LINE);
    assert.ok(!/^line (?:[1-9]|[1-5]\d|60)$/m.test(excerpt));
  });

  it('starts from the last failing-tests line and keeps the rest', () => {
    const output = [
      'setup noise',
      '✖ failing tests:',
      'old failure',
      'middle noise',
      '  ✖ failing tests:',
      'tests/new.test.ts',
      'assert.equal(1, 2)',
    ].join('\n');

    const excerpt = excerptVerifyOutput(output, SOURCE, LIMITS);

    assert.equal(
      excerpt,
      ['  ✖ failing tests:', 'tests/new.test.ts', 'assert.equal(1, 2)', FULL_OUTPUT_LINE].join(
        '\n',
      ),
    );
  });

  it('cuts an over-long kept line and counts the removed characters', () => {
    const excerpt = excerptVerifyOutput('x'.repeat(1000), SOURCE, LIMITS);
    const [kept, fullOutput] = excerpt.split('\n');

    assert.equal(kept, `${'x'.repeat(400)}… (600 more characters)`);
    assert.equal(fullOutput, FULL_OUTPUT_LINE);
  });

  it('renders empty or whitespace-only output as (no output)', () => {
    for (const output of ['', '   ', '\n\n\t\n']) {
      assert.equal(excerptVerifyOutput(output, SOURCE, LIMITS), `(no output)\n${FULL_OUTPUT_LINE}`);
    }
  });
});

describe('archive-time verify excerpt', () => {
  it('keeps the failing-tests section and points at the full event output', async () => {
    const { root, specFolder, runDir } = await makeProject(
      [
        "for (let i = 1; i <= 500; i += 1) console.log('noise ' + i);",
        "console.log('✖ failing tests:');",
        "console.log('tests/living.test.ts');",
        "console.log('  expected 1 to equal 2');",
        'process.exitCode = 1;',
        '',
      ].join('\n'),
    );

    const archived = await verifyArchiveStep(
      root,
      specFolder,
      runDir,
      DEFAULT_CONFIG,
      'change',
      'node excerpt-fail.cjs',
    );
    assert.equal(archived, false);

    const marker = await fs.readFile(path.join(runDir, 'regressed', 'change.md'), 'utf8');
    assert.match(marker, /reason: verify_red/);
    assert.ok(!/noise \d+/.test(marker), 'none of the 500 earlier lines survive');
    assert.match(marker, /✖ failing tests:/);
    assert.match(marker, /tests\/living\.test\.ts/);

    const verifyRan = (await readEvents(specFolder)).filter((event) => event.type === 'verify_ran');
    assert.equal(verifyRan.length, 1);
    const log = String(verifyRan[0].data?.log);
    assert.ok(marker.trimEnd().endsWith(`Full output: ${log}`));
    const full = await fs.readFile(path.join(specFolder, log), 'utf8');
    assert.match(full, /noise 500/);
    assert.match(full, /✖ failing tests:/);
  });

  it('keeps only the configured number of trailing lines', async () => {
    const { root, specFolder, runDir } = await makeProject(
      [
        "for (let i = 1; i <= 100; i += 1) console.log('line ' + i);",
        'process.exitCode = 1;',
        '',
      ].join('\n'),
    );
    const config = {
      ...DEFAULT_CONFIG,
      limits: { ...DEFAULT_CONFIG.limits, markerOutputLines: 5 },
    };

    const archived = await verifyArchiveStep(
      root,
      specFolder,
      runDir,
      config,
      'change',
      'node excerpt-fail.cjs',
    );
    assert.equal(archived, false);

    const marker = await fs.readFile(path.join(runDir, 'regressed', 'change.md'), 'utf8');
    const log = String(
      (await readEvents(specFolder)).find((event) => event.type === 'verify_ran')?.data?.log,
    );
    const lines = marker.trimEnd().split('\n');
    assert.deepEqual(lines.slice(-6), [
      'line 96',
      'line 97',
      'line 98',
      'line 99',
      'line 100',
      `Full output: ${log}`,
    ]);
    assert.ok(!marker.includes('line 95'));
  });
});
