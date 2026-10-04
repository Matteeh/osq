import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { COMMAND_GROUPS } from '../src/cli/help-groups.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/** The lines of README's `## Commands` section, up to its first `###` heading. */
function commandsSection(readme: string): string[] {
  const lines = readme.split('\n');
  const start = lines.findIndex((line) => line === '## Commands');
  assert.notEqual(start, -1, 'README has no ## Commands heading');
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('### '));
  return end === -1 ? rest : rest.slice(0, end);
}

interface GroupBlock {
  readonly label: string;
  readonly lines: readonly string[];
}

/** Every `**Title**` label and the lines of the one fenced block that follows it. */
function groupBlocks(section: readonly string[]): GroupBlock[] {
  const blocks: GroupBlock[] = [];
  let index = 0;
  while (index < section.length) {
    const match = (section[index] ?? '').match(/^\*\*(.+)\*\*$/);
    if (!match) {
      index += 1;
      continue;
    }
    const label = match[1] ?? '';
    const fenceStart = section.findIndex((line, position) => {
      return position > index && line.trim() === '```';
    });
    assert.notEqual(fenceStart, -1, `${label} has no fenced block`);
    const fenceEnd = section.findIndex((line, position) => {
      return position > fenceStart && line.trim() === '```';
    });
    assert.notEqual(fenceEnd, -1, `${label} fenced block is not closed`);
    blocks.push({ label, lines: section.slice(fenceStart + 1, fenceEnd) });
    index = fenceEnd + 1;
  }
  return blocks;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readmeSection(): Promise<string[]> {
  const readme = await fs.readFile(path.join(ROOT, 'README.md'), 'utf8');
  return commandsSection(readme);
}

describe('README command groups', () => {
  it('lists the four groups as bold labels in the root help order', async () => {
    const blocks = groupBlocks(await readmeSection());
    assert.deepEqual(
      blocks.map((block) => block.label),
      COMMAND_GROUPS.map((group) => group.title),
    );
  });

  it('starts the Everyday block with the bare osq and osq --json lines', async () => {
    const blocks = groupBlocks(await readmeSection());
    const everyday = blocks[0];
    assert.ok(everyday, 'the Everyday block is missing');
    const first = everyday.lines[0] ?? '';
    const second = everyday.lines[1] ?? '';
    assert.ok(first.startsWith('osq '), `Everyday starts with ${JSON.stringify(first)}`);
    assert.ok(second.startsWith('osq --json'), `Everyday second line is ${JSON.stringify(second)}`);
  });

  it('gives every command a line in its own group block', async () => {
    const blocks = groupBlocks(await readmeSection());
    for (const group of COMMAND_GROUPS) {
      const block = blocks.find((candidate) => candidate.label === group.title);
      assert.ok(block, `the ${group.title} block is missing`);
      for (const command of group.commands) {
        const pattern = new RegExp(`^osq ${escapeRegExp(command)}(?:\\s|$)`);
        assert.ok(
          block.lines.some((line) => pattern.test(line)),
          `${group.title} is missing a line for osq ${command}`,
        );
      }
    }
  });

  it('starts every line in a group block with osq', async () => {
    for (const block of groupBlocks(await readmeSection())) {
      for (const line of block.lines) {
        assert.ok(line.startsWith('osq'), `${block.label} lists ${JSON.stringify(line)}`);
      }
    }
  });
});
