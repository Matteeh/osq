import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readReadme(): Promise<string> {
  const raw = await fs.readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');
  // Collapse line wrapping so prose phrases match regardless of where they break.
  return raw.replace(/\s+/g, ' ');
}

describe('planning measurement documentation', () => {
  it('README names the planning config keys, report sections, and unknown cost label', async () => {
    const readme = await readReadme();

    assert.ok(
      readme.includes('planning.idleGapMinutes'),
      'README must name planning.idleGapMinutes',
    );
    assert.ok(readme.includes('planning.prices'), 'README must name planning.prices');
    assert.ok(
      readme.includes('Planning by change'),
      'README must name the Planning by change section',
    );
    assert.ok(readme.includes('not reported'), 'README must explain the not reported cost label');
  });

  it('README explains per-turn slice attribution under approval observation', async () => {
    const readme = await readReadme();

    assert.match(readme, /per-turn slices/i, 'README must describe per-turn slices');
    assert.match(
      readme,
      /next change edited before the next approval/i,
      'README must describe where an unattributed turn goes',
    );
    assert.match(
      readme,
      /no longer counted once per change/i,
      'README must say a shared session is not counted once per change',
    );
  });

  it('README names the per-turn token readers and their limits', async () => {
    const readme = await readReadme();

    assert.match(readme, /Claude Code message usage/, 'README must name Claude message usage');
    assert.match(readme, /Codex `token_count`/, 'README must name the Codex token_count event');
    assert.match(readme, /OpenCode messages/, 'README must name OpenCode messages');
    assert.match(
      readme,
      /input excludes cached input/i,
      'README must say input excludes cached input',
    );
    assert.match(
      readme,
      /cost-state` cost counts only for a slice that holds the whole/i,
      'README must scope the Claude cost-state cost to a whole-session slice',
    );
  });

  it('README shows the planning config block and price-table rules', async () => {
    const readme = await readReadme();

    assert.match(readme, /planning:\s*\{/, 'README must show a planning config block');
    assert.match(readme, /idleGapMinutes:\s*\d+/, 'README must show idleGapMinutes');
    assert.match(readme, /prices:\s*\{/, 'README must show a prices entry');
    assert.match(readme, /USD per million tokens/i, 'README must state price units');
    assert.match(
      readme,
      /ships no price table of its own/i,
      'README must disclaim a shipped price table',
    );
    assert.match(
      readme,
      /price-table cost only when every turn's model is priced/i,
      'README must state when a price-table cost applies',
    );
  });

  it('README describes the planning report sections and measures', async () => {
    const readme = await readReadme();

    assert.match(readme, /Planning by change/, 'README must name the per-change section');
    assert.match(readme, /Planning vs execution/, 'README must name the comparison section');
    assert.match(readme, /active minutes/i, 'README must name active minutes');
    assert.match(readme, /planning\.idleGapMinutes/, 'README must name the idle gap key');
    assert.match(
      readme,
      /spec words per changed line/i,
      'README must name spec words per changed line',
    );
  });
});
