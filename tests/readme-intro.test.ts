import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createProgram } from '../src/cli/index.js';

// Expected strings come from cli-foundation "Product description" and "README
// intro describes the flow", never from the files under test.
const DESCRIPTION =
  'A spec-driven software factory. You write briefs and tap decisions; osq plans, builds, verifies and lands each change against living specs.';
const CLI_DESCRIPTION =
  'Spec-driven software factory: you brief and decide; osq lands verified changes.';
const FRESH_AGENT_LINE =
  'If a fresh agent could not pick up a task from the files in the repo alone, the files are wrong. Everything here follows from that.';
const INTRO_STEPS = [
  'brief',
  'change folder',
  'living capability specs',
  'approve',
  'verify',
  'validator',
  'archives',
  '`osq land`',
  '`osq server start`',
  'phone',
];

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const README = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const MANIFEST = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  description: string;
};

/** README's intro: every line between `# osq` and `## Install`. */
function readmeIntro(): string {
  const lines = README.split('\n');
  const start = lines.findIndex((line) => line === '# osq');
  const end = lines.findIndex((line) => line === '## Install');
  assert.notEqual(start, -1, 'README has no # osq heading');
  assert.notEqual(end, -1, 'README has no ## Install heading');
  return lines.slice(start + 1, end).join('\n');
}

describe('osq product description', () => {
  it('Product description text', () => {
    assert.equal(README.split('\n')[2], DESCRIPTION, 'README line 3');
    assert.equal(MANIFEST.description, DESCRIPTION, 'package.json description');
    assert.equal(createProgram().description(), CLI_DESCRIPTION, 'root command description');
  });

  it('Description on one help line', () => {
    const lines = createProgram().helpInformation().split('\n');
    assert.ok(
      lines.includes(CLI_DESCRIPTION),
      `help does not hold the description whole on one line:\n${lines.join('\n')}`,
    );
  });
});

describe('README intro', () => {
  it('Intro names each step', () => {
    const intro = readmeIntro();
    for (const step of INTRO_STEPS) {
      assert.ok(intro.includes(step), `the intro does not name ${JSON.stringify(step)}`);
    }
  });

  it('Intro keeps the fresh agent line', () => {
    assert.ok(readmeIntro().includes(FRESH_AGENT_LINE), 'the intro dropped the fresh agent line');
  });

  it('Intro is not a queue', () => {
    assert.ok(!/queue/i.test(readmeIntro()), 'the intro mentions queue');
  });
});
