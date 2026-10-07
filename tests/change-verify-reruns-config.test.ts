import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '../src/core/foundation/config.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readReadme(): Promise<string> {
  const raw = await fs.readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');
  // Collapse line wrapping so prose phrases match regardless of where they break.
  return raw.replace(/\s+/g, ' ');
}

function between(readme: string, start: string, next: string): string {
  const from = readme.indexOf(start);
  assert.ok(from >= 0, `README must contain ${start}`);
  const to = readme.indexOf(next, from + start.length);
  assert.ok(to >= 0, `README must contain ${next} after ${start}`);
  return readme.slice(from, to);
}

describe('Change verify reruns gate key', () => {
  it('defaults changeVerifyReruns to one, including a partial gates block', () => {
    assert.equal(defineConfig({}).gates?.changeVerifyReruns, 1);
    assert.equal(defineConfig({ gates: { preSpawnVerify: 'off' } }).gates?.changeVerifyReruns, 1);
  });

  it('keeps zero while preserving the other gate defaults', () => {
    const config = defineConfig({ gates: { changeVerifyReruns: 0 } });
    assert.equal(config.gates?.changeVerifyReruns, 0);
    assert.equal(config.gates?.changeVerifyAfterTask, true);
    assert.equal(config.gates?.preSpawnVerify, 'warn');
    assert.equal(config.gates?.autoRetries, 1);
    assert.equal(config.gates?.commitRetries, 2);
  });

  it('rejects a negative, fractional, NaN, or non-numeric count', () => {
    for (const changeVerifyReruns of [-1, 1.5, Number.NaN, 'one']) {
      assert.throws(
        () => defineConfig({ gates: { changeVerifyReruns } } as never),
        /gates\.changeVerifyReruns must be a non-negative integer/,
        `expected gates.changeVerifyReruns to reject ${String(changeVerifyReruns)}`,
      );
    }
  });
});

describe('change verify rerun documentation', () => {
  it('the Change verification after every task bullet describes the rerun', async () => {
    const readme = await readReadme();
    const gates = between(readme, '## Gates and permissions', '## Change folder');
    const bullet = between(
      gates,
      '**Change verification after every task.**',
      '**Baseline verify.**',
    );

    assert.match(
      bullet,
      /\*\*Change verification after every task\.\*\*/,
      'the bullet must keep its label',
    );
    assert.ok(
      bullet.includes('gates.changeVerifyReruns'),
      'the bullet must name gates.changeVerifyReruns',
    );
    assert.match(bullet, /defaults? to 1\b/i, 'the bullet must state the default of 1');
    assert.match(bullet, /`?0`? (turns|disables)/i, 'the bullet must say 0 turns reruns off');
    assert.ok(
      bullet.includes('change_verify_rerun'),
      'the bullet must name the change_verify_rerun event',
    );
    assert.ok(bullet.includes('Flaky tests:'), 'the bullet must name the Flaky tests: section');
  });
});
