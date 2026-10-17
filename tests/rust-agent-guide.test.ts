import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { checkProjectRules } from '../src/core/foundation/rules-block.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const agents = await fs.readFile(path.join(repoRoot, 'AGENTS.md'), 'utf8');

/** The text from the `## Rust crates` heading to the next `## ` or `<!--` line. */
function rustCratesSection(content: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line === '## Rust crates');
  if (start === -1) throw new Error('AGENTS.md holds no `## Rust crates` heading');
  const end = lines.findIndex(
    (line, index) => index > start && (line.startsWith('## ') || line.startsWith('<!--')),
  );
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

/** The lines of the first fenced code block after the `## Layout` heading. */
function layoutCodeBlock(content: string): readonly string[] {
  const lines = content.split('\n');
  const heading = lines.findIndex((line) => line === '## Layout');
  const open = lines.findIndex((line, index) => index > heading && line === '```');
  const close = lines.findIndex((line, index) => index > open && line === '```');
  return lines.slice(open + 1, close);
}

const TERMS: readonly string[] = [
  'ADRs 022 to 026',
  'src/',
  '`apps`, then `features`, then `kernel`, then `core`',
  'Implements: <capability>/<requirement>',
  'Covers: <capability>/<scenario>',
  '#[cfg(test)]',
  '[workspace.lints]',
  'cargo fmt --all',
  'sh scripts/verify-rust.sh',
];

describe('cli-foundation: Rust guide names how to work in crates', () => {
  const section = rustCratesSection(agents);
  for (const term of TERMS) {
    it(`names ${term}`, () => {
      assert.ok(section.includes(term), `the ## Rust crates section must contain ${term}`);
    });
  }
});

describe('cli-foundation: Rust guide sits outside the managed blocks', () => {
  it('places the heading before the project rules block and lists crates/ in Layout', () => {
    const heading = agents.indexOf('## Rust crates');
    const rules = agents.indexOf('<!-- OSQ:RULES:START -->');
    assert.notEqual(heading, -1, 'AGENTS.md must hold a ## Rust crates heading');
    assert.notEqual(rules, -1, 'AGENTS.md must hold the project rules block');
    assert.ok(heading < rules, '## Rust crates must come before the project rules block');

    const layout = layoutCodeBlock(agents);
    assert.ok(
      layout.some((line) => line.startsWith('crates/')),
      'the Layout code block must hold a line starting crates/',
    );
  });

  it('reports no project rules problem and keeps CLAUDE.md a symlink', async () => {
    assert.deepEqual(await checkProjectRules(repoRoot, DEFAULT_CONFIG), []);
    const stat = await fs.lstat(path.join(repoRoot, 'CLAUDE.md'));
    assert.equal(stat.isSymbolicLink(), true, 'CLAUDE.md must still be a symlink');
  });
});
