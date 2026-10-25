import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adrPath = path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, '022-rust-feature-crates.md');

const KERNEL_ROW =
  'kernel    vcs, storage, specs, linter, runners, harnesses, agents, loop, config, sync';
const KERNEL_FOLDERS =
  'crates/kernel/{vcs,storage,specs,linter,runners,harnesses,agents,loop,config,sync}/';
const AMENDMENT =
  'Amended 2026-10-25 (change 345): the kernel lists name the config kernel (ADR 029) and the sync ' +
  "kernel, which takes the default branch into a change's branch for every caller.";

/** The ADR's lines, with carriage returns removed. */
async function adrLines(): Promise<string[]> {
  const content = await fs.readFile(adrPath, 'utf8');
  return content.split('\n').map((line) => line.replace(/\r$/, ''));
}

describe('ADR 022: the kernel lists name the config and sync kernels', () => {
  it('reads the layer table kernel row exactly once', async () => {
    const lines = await adrLines();
    assert.equal(
      lines.filter((line) => line === KERNEL_ROW).length,
      1,
      `the layer table kernel row must read \`${KERNEL_ROW}\``,
    );
  });

  it('reads the folder list kernel line exactly once', async () => {
    const lines = await adrLines();
    assert.equal(
      lines.filter((line) => line === KERNEL_FOLDERS).length,
      1,
      `the folder list kernel line must read \`${KERNEL_FOLDERS}\``,
    );
  });

  it('places the amendment directly after the Date line, one blank line apart', async () => {
    const lines = await adrLines();
    const dateIndex = lines.indexOf('Date: 2026-10-17');
    assert.notEqual(dateIndex, -1, 'the ADR must keep its `Date: 2026-10-17` line');
    assert.equal(lines[dateIndex + 1], '', 'a blank line must follow the Date line');
    assert.equal(lines[dateIndex + 2], AMENDMENT, `the amendment line must read \`${AMENDMENT}\``);
  });
});
