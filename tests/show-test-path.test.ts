import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

describe('show test paths', () => {
  it('has no test-path function of its own and imports isTestPath', async () => {
    const source = await fs.readFile(path.join(process.cwd(), 'src/core/status/show.ts'), 'utf8');
    assert.equal(
      /\b(?:function\s+(?:showIsTestPath|isTestPath)|const\s+(?:showIsTestPath|isTestPath))\b/.test(
        source,
      ),
      false,
      'src/core/status/show.ts defines its own test-path function',
    );
    assert.doesNotMatch(
      source,
      /startsWith\(['"]tests\//,
      'src/core/status/show.ts hand-rolls a tests/ check',
    );
    assert.match(
      source,
      /import\s*\{[^}]*\bisTestPath\b[^}]*\}\s*from\s*['"]\.\.\/trace\/test-path\.js['"]/,
      'src/core/status/show.ts must import isTestPath',
    );
  });
});
