import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const STATUS_DIR = path.join(process.cwd(), 'src', 'core', 'status');

/** The `show-model*.ts` module that defines `attachTaskScenarios`. */
async function scenarioModule(): Promise<string> {
  const entries = await fs.readdir(STATUS_DIR);
  for (const name of entries.filter((entry) => /^show-model.*\.ts$/.test(entry)).sort()) {
    const source = await fs.readFile(path.join(STATUS_DIR, name), 'utf8');
    if (/\bfunction\s+attachTaskScenarios\b/.test(source)) return name;
  }
  throw new Error('no show-model*.ts module defines attachTaskScenarios');
}

describe('show test paths', () => {
  it('has no test-path function of its own and imports isTestPath', async () => {
    const file = await scenarioModule();
    const relative = path.join('src', 'core', 'status', file);
    const source = await fs.readFile(path.join(STATUS_DIR, file), 'utf8');
    assert.equal(
      /\b(?:function\s+(?:showIsTestPath|isTestPath)|const\s+(?:showIsTestPath|isTestPath))\b/.test(
        source,
      ),
      false,
      `${relative} defines its own test-path function`,
    );
    assert.doesNotMatch(source, /startsWith\(['"]tests\//, `${relative} hand-rolls a tests/ check`);
    assert.match(
      source,
      /import\s*\{[^}]*\bisTestPath\b[^}]*\}\s*from\s*['"]\.\.\/trace\/test-path\.js['"]/,
      `${relative} must import isTestPath`,
    );
  });
});
