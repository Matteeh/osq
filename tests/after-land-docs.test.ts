import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildBaseOpeningPrompt } from '../src/cli/plan-queue.js';
import { DEFAULT_CONFIG, loadConfig } from '../src/core/foundation/config.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const AFTER_LAND_LINE =
  'After land: osq runs pnpm build after every land, so it is not a human step.';

const ADR_SENTENCE =
  "A build may now follow a land, because `osq land`, a command the human runs, runs the project's `vcs.afterLand`; the service still never builds osq and reloads a settled new build between passes.";

async function readCollapsed(file: string): Promise<string> {
  const raw = await fs.readFile(path.join(REPO_ROOT, file), 'utf8');
  // Collapse line wrapping so prose phrases match regardless of where they break.
  return raw.replace(/\s+/g, ' ');
}

/** The paragraphs of a document, each with its interior whitespace collapsed. */
async function readParagraphs(file: string): Promise<string[]> {
  const raw = await fs.readFile(path.join(REPO_ROOT, file), 'utf8');
  return raw
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0);
}

describe('after-land documentation', () => {
  it('osq builds itself after a land', async () => {
    const config = await loadConfig(REPO_ROOT);

    assert.equal(config.vcs?.afterLand, 'pnpm build');
  });

  it('README names the key', async () => {
    const readme = await readCollapsed('README.md');
    assert.ok(readme.includes('vcs.afterLand'), 'README must name vcs.afterLand');
    assert.ok(readme.includes('osq land <id>'), 'README must name osq land <id>');

    const paragraphs = await readParagraphs('README.md');
    assert.ok(
      paragraphs.some(
        (paragraph) => paragraph.includes('vcs.afterLand') && paragraph.includes('osq land <id>'),
      ),
      'vcs.afterLand and osq land <id> must share one paragraph',
    );
  });

  it('ADR 012 decision 5 names the after-land build', async () => {
    const adr = await readCollapsed(path.join('decisions', '012-watch-service.md'));

    assert.ok(adr.includes(ADR_SENTENCE), 'ADR 012 decision 5 must gain the after-land sentence');
  });
});

describe('plan prompt after-land line', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-after-land-docs-'));
    const specsDir = path.join(tmpDir, 'openspec', 'specs');
    await fs.mkdir(path.join(specsDir, 'alpha'), { recursive: true });
    await fs.writeFile(path.join(specsDir, 'alpha', 'spec.md'), '# alpha\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function promptWith(afterLand?: string): Promise<string> {
    return buildBaseOpeningPrompt({
      projectRoot: tmpDir,
      folderPath: path.join(tmpDir, 'openspec', 'changes', '001-test'),
      specId: '001',
      specTitle: 'Test',
      briefContent: 'Brief.\n',
      openspecRoot: 'openspec',
      config: {
        ...DEFAULT_CONFIG,
        vcs:
          afterLand === undefined
            ? { enabled: true, author: 'osq <osq@example.com>' }
            : { enabled: true, author: 'osq <osq@example.com>', afterLand },
      },
    });
  }

  it('header with an after-land command', async () => {
    const prompt = await promptWith('pnpm build');
    const start = prompt.indexOf('# Change:');
    const end = prompt.indexOf('## Capability Specs');
    const header = prompt.slice(start, end).trim();

    assert.ok(
      header.endsWith(AFTER_LAND_LINE),
      `change header must end with the line, got:\n${header}`,
    );
  });

  it('header without one', async () => {
    const prompt = await promptWith();

    assert.equal(prompt.includes('After land:'), false, 'prompt must hold no After land: line');
  });
});
