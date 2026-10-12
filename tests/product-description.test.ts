import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createProgram } from '../src/cli/index.js';

// Expected strings come from cli-foundation "Product description", never from
// the files under test.
const DESCRIPTION =
  'A spec-driven software factory. You write briefs and tap decisions; osq plans, builds, verifies and lands each change against living specs.';
const CLI_DESCRIPTION =
  'Spec-driven software factory: you brief and decide; osq lands verified changes.';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const MANIFEST = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  description: string;
};

describe('osq product description', () => {
  it('Product description text', () => {
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
