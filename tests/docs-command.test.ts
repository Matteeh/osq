/**
 * The `osq docs` command and its Markdown, proved on the docs fixture.
 * Scenarios: "Docs written from the fixture" and "Page lines from the fixture".
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { commandGroups } from '../src/cli/help-groups.js';
import { createProgram } from '../src/cli/index.js';
import { SLICES } from '../src/cli/slices.js';
import { loadConfig } from '../src/core/foundation/config.js';
import { docsCommand } from '../src/docs/docs-command.js';
import { cleanupDocsProjects, docsProject } from './docs-support.js';

afterEach(cleanupDocsProjects);

/** The files the "Docs written from the fixture" scenario writes. */
const PAGE_FILES = [
  'index.md',
  'capabilities/invoices.md',
  'capabilities/pricing.md',
  'adrs/001.md',
  'adrs/002.md',
  'adrs/003.md',
  'adrs/004.md',
] as const;

/** Run `docsCommand` for `out` and capture its stdout. */
async function runDocs(
  root: string,
  out: string,
): Promise<{ text: string; written: readonly string[] }> {
  let text = '';
  const written = await docsCommand({
    cwd: root,
    out,
    stdout: (chunk) => {
      text += chunk;
    },
  });
  return { text, written };
}

/** Every regular file under `dir`, keyed by its `dir`-relative posix path. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const walk = async (current: string, prefix: string): Promise<void> => {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(path.join(current, entry.name), relative);
      else files[relative] = await fs.readFile(path.join(current, entry.name), 'utf8');
    }
  };
  await walk(dir, '');
  return files;
}

/** The lines "Page lines from the fixture" requires in each written file. */
const PAGE_LINES: readonly { file: string; line: string }[] = [
  {
    file: 'index.md',
    line: '- [pricing](capabilities/pricing.md): Prices quotes by volume tier and percentage code, in integer cents.',
  },
  { file: 'index.md', line: '- [ADR 003: Yearly Invoice Numbers](adrs/003.md) (superseded)' },
  {
    file: 'capabilities/pricing.md',
    line: '- [ADR 001: Money in Integer Cents](../adrs/001.md): Every amount is an integer number of cents, and a quote rounds once, half up.',
  },
  { file: 'capabilities/pricing.md', line: '- `src/pricing/quote.ts:33` quote' },
  { file: 'capabilities/pricing.md', line: '- 007 2026-10-07: Change 7 goal.' },
  { file: 'capabilities/invoices.md', line: 'Group: ungrouped' },
  { file: 'adrs/003.md', line: 'Status: superseded, superseded by [ADR 004](004.md)' },
  { file: 'adrs/002.md', line: 'Applies to: all' },
];

describe('docs command', () => {
  it('writes every page, removes stale markdown, and repeats byte for byte', async () => {
    const root = await docsProject();
    await fs.mkdir(path.join(root, 'site', 'capabilities'), { recursive: true });
    await fs.writeFile(path.join(root, 'site', 'capabilities', 'old.md'), 'stale\n', 'utf8');
    await fs.writeFile(path.join(root, 'site', 'notes.txt'), 'keep\n', 'utf8');

    const { text, written } = await runDocs(root, 'site');
    assert.equal(text, 'wrote 7 pages to site\n');
    assert.equal(written.length, PAGE_FILES.length);

    for (const relative of PAGE_FILES) {
      await fs.access(path.join(root, 'site', relative));
    }
    await assert.rejects(fs.access(path.join(root, 'site', 'capabilities', 'old.md')));
    assert.equal(await fs.readFile(path.join(root, 'site', 'notes.txt'), 'utf8'), 'keep\n');

    const before = await snapshot(path.join(root, 'site'));
    const second = await runDocs(root, 'site');
    assert.equal(second.text, text);
    assert.deepEqual(await snapshot(path.join(root, 'site')), before);

    for (const [relative, content] of Object.entries(before)) {
      if (relative.endsWith('.md')) {
        assert.ok(content.endsWith('\n'), `${relative} ends in a newline`);
        assert.ok(!content.endsWith('\n\n'), `${relative} ends in exactly one newline`);
      }
    }
  });

  it('writes every required line', async () => {
    const root = await docsProject();
    await runDocs(root, 'site');
    for (const { file, line } of PAGE_LINES) {
      const content = await fs.readFile(path.join(root, 'site', file), 'utf8');
      assert.ok(content.split('\n').includes(line), `${file} should hold ${JSON.stringify(line)}`);
    }
  });
});

describe('docs command registration', () => {
  it('registers docs with --out defaulting to docs/osq', () => {
    const program = createProgram('0.0.0');
    const command = program.commands.find((candidate) => candidate.name() === 'docs');
    assert.ok(command, 'the program has a docs command');
    const out = command.options.find((option) => option.long === '--out');
    assert.ok(out, 'docs has an --out option');
    assert.equal(out.defaultValue, 'docs/osq');
  });

  it('places docs in the Inspection group', () => {
    const inspection = commandGroups(SLICES).find((group) => group.title === 'Inspection');
    assert.ok(inspection, 'the Inspection group exists');
    assert.ok(inspection.commands.includes('docs'), 'Inspection lists docs');
  });

  it('carries the docs block through loadConfig', async () => {
    const root = await docsProject();
    await fs.writeFile(
      path.join(root, 'osq.config.ts'),
      "export default {\n  harness: 'mock',\n  docs: { recentChanges: 2 },\n};\n",
      'utf8',
    );
    const config = await loadConfig(root);
    assert.deepEqual((config as { docs?: unknown }).docs, { recentChanges: 2 });
  });
});
