import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { setupCommand } from '../src/cli/setup.js';
import {
  MANAGED_AGENTS_BLOCK,
  OSQ_END_MARKER,
  OSQ_START_MARKER,
  updateAgentsMd,
} from '../src/core/init.js';

const OPENSPEC_START_MARKER = '<!-- OPENSPEC:START -->';
const OPENSPEC_END_MARKER = '<!-- OPENSPEC:END -->';
const OPENSPEC_INSTRUCTIONS = 'OpenSpec instructions here';

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function sliceBlock(content: string, startMarker: string, endMarker: string): string {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  assert.notEqual(start, -1, `expected ${startMarker} to be present`);
  assert.notEqual(end, -1, `expected ${endMarker} to be present`);
  assert.ok(end > start, `${endMarker} must follow ${startMarker}`);
  return content.slice(start, end + endMarker.length);
}

function initialAgentsMd(): string {
  return [
    '# Project AGENTS',
    '',
    OPENSPEC_START_MARKER,
    OPENSPEC_INSTRUCTIONS,
    OPENSPEC_END_MARKER,
    '',
    'Custom user notes',
    '',
  ].join('\n');
}

const OPENSPEC_BLOCK = `${OPENSPEC_START_MARKER}\n${OPENSPEC_INSTRUCTIONS}\n${OPENSPEC_END_MARKER}`;

describe('AGENTS.md managed block coexistence', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-setup-coexistence-'));
    originalCwd = process.cwd();
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), initialAgentsMd(), 'utf8');
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('adds the osq block while preserving an existing OpenSpec block and user notes', async () => {
    await updateAgentsMd(tmpDir);

    const content = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    assert.equal(countOccurrences(content, OPENSPEC_START_MARKER), 1);
    assert.equal(countOccurrences(content, OPENSPEC_END_MARKER), 1);
    assert.equal(countOccurrences(content, OSQ_START_MARKER), 1);
    assert.equal(countOccurrences(content, OSQ_END_MARKER), 1);
    assert.equal(sliceBlock(content, OPENSPEC_START_MARKER, OPENSPEC_END_MARKER), OPENSPEC_BLOCK);
    assert.equal(sliceBlock(content, OSQ_START_MARKER, OSQ_END_MARKER), MANAGED_AGENTS_BLOCK);
    assert.ok(content.includes('# Project AGENTS'));
    assert.ok(content.includes('Custom user notes'));
  });

  it('is idempotent across repeated updates and preserves both blocks intact', async () => {
    await updateAgentsMd(tmpDir);
    const first = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    const openspecAfterFirst = sliceBlock(first, OPENSPEC_START_MARKER, OPENSPEC_END_MARKER);
    const osqAfterFirst = sliceBlock(first, OSQ_START_MARKER, OSQ_END_MARKER);

    await updateAgentsMd(tmpDir);
    const second = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf8');

    assert.equal(countOccurrences(second, OPENSPEC_START_MARKER), 1);
    assert.equal(countOccurrences(second, OPENSPEC_END_MARKER), 1);
    assert.equal(countOccurrences(second, OSQ_START_MARKER), 1);
    assert.equal(countOccurrences(second, OSQ_END_MARKER), 1);
    assert.equal(
      sliceBlock(second, OPENSPEC_START_MARKER, OPENSPEC_END_MARKER),
      openspecAfterFirst,
    );
    assert.equal(sliceBlock(second, OSQ_START_MARKER, OSQ_END_MARKER), osqAfterFirst);
    assert.ok(second.includes('# Project AGENTS'));
    assert.ok(second.includes('Custom user notes'));
  });

  it('osq setup refreshes AGENTS.md and both blocks survive repeated setup executions', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      "export default { harness: 'mock' };\n",
      'utf8',
    );
    process.chdir(tmpDir);

    await setupCommand();
    const first = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    assert.equal(countOccurrences(first, OPENSPEC_START_MARKER), 1);
    assert.equal(countOccurrences(first, OPENSPEC_END_MARKER), 1);
    assert.equal(countOccurrences(first, OSQ_START_MARKER), 1);
    assert.equal(countOccurrences(first, OSQ_END_MARKER), 1);
    const openspecAfterFirst = sliceBlock(first, OPENSPEC_START_MARKER, OPENSPEC_END_MARKER);

    await setupCommand();
    const second = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf8');

    assert.equal(countOccurrences(second, OPENSPEC_START_MARKER), 1);
    assert.equal(countOccurrences(second, OPENSPEC_END_MARKER), 1);
    assert.equal(countOccurrences(second, OSQ_START_MARKER), 1);
    assert.equal(countOccurrences(second, OSQ_END_MARKER), 1);
    assert.equal(
      sliceBlock(second, OPENSPEC_START_MARKER, OPENSPEC_END_MARKER),
      openspecAfterFirst,
    );
    assert.equal(sliceBlock(second, OSQ_START_MARKER, OSQ_END_MARKER), MANAGED_AGENTS_BLOCK);
    assert.ok(second.includes('# Project AGENTS'));
    assert.ok(second.includes('Custom user notes'));
  });
});
