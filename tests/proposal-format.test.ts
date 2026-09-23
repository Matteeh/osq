import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { MANAGED_PLANNER_BLOCK } from '../src/core/foundation/init-blocks.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES_OPENSPEC = path.join(REPO_ROOT, 'templates', 'openspec');
const REPO_OPENSPEC = path.join(REPO_ROOT, 'openspec');
const CANONICAL_PROPOSAL = path.join(REPO_ROOT, 'templates', 'proposal.md');
const SCHEMA_DIR = path.join('schemas', 'osq');
const SCHEMA_PROPOSAL = path.join(TEMPLATES_OPENSPEC, SCHEMA_DIR, 'templates', 'proposal.md');
const TEMPLATE_SCHEMA = path.join(TEMPLATES_OPENSPEC, SCHEMA_DIR, 'schema.yaml');
const TEMPLATE_CONFIG = path.join(TEMPLATES_OPENSPEC, 'config.yaml');
const REPO_SCHEMA = path.join(REPO_OPENSPEC, SCHEMA_DIR, 'schema.yaml');
const REPO_CONFIG = path.join(REPO_OPENSPEC, 'config.yaml');

/** The osq proposal section names, in the order every entry point names them. */
const SECTIONS = ['Goal', 'Verify', 'Non-goals', 'Surface', 'Contract', 'Human steps', 'Delta'];

interface ParsedArtifact {
  id: string;
  instruction: string;
}

interface ParsedConfig {
  rules?: Record<string, string[]>;
}

/** Assert every token appears in `text` strictly after the previous one. */
function assertOrderedInOrder(text: string, tokens: readonly string[], label: string): void {
  let cursor = -1;
  for (const token of tokens) {
    const index = text.indexOf(token, cursor + 1);
    assert.ok(index > cursor, `${label} must name ${token} after the previous section`);
    cursor = index;
  }
}

/** Every regular file below `root`, as project-relative POSIX paths, sorted. */
async function listRelativeFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile()) {
        files.push(path.relative(root, fullPath).split(path.sep).join('/'));
      }
    }
  }

  await walk(root);
  return files;
}

describe('One proposal format', () => {
  it('schema proposal template is byte-identical to the template osq new writes', async () => {
    const canonical = await fs.readFile(CANONICAL_PROPOSAL, 'utf8');
    const schema = await fs.readFile(SCHEMA_PROPOSAL, 'utf8');
    assert.equal(schema, canonical);
  });

  it('repository carries the scaffolded config and schema byte-identical', async () => {
    assert.equal(
      await fs.readFile(REPO_CONFIG, 'utf8'),
      await fs.readFile(TEMPLATE_CONFIG, 'utf8'),
    );

    const templateFiles = await listRelativeFiles(path.join(TEMPLATES_OPENSPEC, SCHEMA_DIR));
    const repoFiles = await listRelativeFiles(path.join(REPO_OPENSPEC, SCHEMA_DIR));
    assert.deepEqual(repoFiles, templateFiles);

    for (const relative of templateFiles) {
      const template = await fs.readFile(
        path.join(TEMPLATES_OPENSPEC, SCHEMA_DIR, relative),
        'utf8',
      );
      const repo = await fs.readFile(path.join(REPO_OPENSPEC, SCHEMA_DIR, relative), 'utf8');
      assert.equal(repo, template, relative);
    }
  });

  it('proposal instruction names the osq sections in order without the retired ones', async () => {
    const schema = parseYaml(await fs.readFile(TEMPLATE_SCHEMA, 'utf8')) as {
      artifacts: ParsedArtifact[];
    };
    const proposal = schema.artifacts.find((artifact) => artifact.id === 'proposal');
    assert.ok(proposal, 'schema must declare a proposal artifact');

    const instruction = proposal.instruction;
    assertOrderedInOrder(
      instruction,
      SECTIONS.map((section) => `**${section}**`),
      'proposal instruction',
    );
    assert.match(instruction, /features\.reads/);
    assert.equal(instruction.includes('What Changes'), false);
    assert.equal(instruction.includes('Capabilities'), false);

    const config = parseYaml(await fs.readFile(TEMPLATE_CONFIG, 'utf8')) as ParsedConfig;
    const rules = (config.rules?.proposal ?? []).join('\n');
    assertOrderedInOrder(rules, SECTIONS, 'proposal rules');
    assert.equal(rules.includes('What Changes'), false);
    assert.equal(rules.includes('Capabilities'), false);
  });

  it('managed planner block names the proposal sections', () => {
    assert.ok(MANAGED_PLANNER_BLOCK.includes('## Goal'));
    assert.ok(MANAGED_PLANNER_BLOCK.includes('## Non-goals'));
    assert.ok(MANAGED_PLANNER_BLOCK.includes('## Surface'));
    assert.ok(MANAGED_PLANNER_BLOCK.includes('## Human steps'));
  });

  it('template Surface section names the seven categories and seeds None', async () => {
    const proposal = await fs.readFile(CANONICAL_PROPOSAL, 'utf8');
    const start = proposal.indexOf('## Surface');
    const end = proposal.indexOf('## Contract');
    assert.ok(start >= 0, 'proposal template must declare ## Surface');
    assert.ok(end > start, '## Contract must follow ## Surface');

    const surface = proposal.slice(start, end);
    const normalized = surface.replace(/\s+/g, ' ');
    const categories = [
      'commands',
      'flags',
      'config keys',
      'frontmatter fields',
      'document sections',
      'dead reasons',
      'event types',
    ];
    for (const category of categories) {
      assert.ok(normalized.includes(category), `Surface section must name ${category}`);
    }
    assert.match(surface, /^None$/m, 'Surface section must seed a None line');
  });

  it('repository dogfood schema declares the osq artifacts', async () => {
    const schema = parseYaml(await fs.readFile(REPO_SCHEMA, 'utf8')) as {
      artifacts: Array<{ id: string }>;
    };
    assert.deepEqual(
      schema.artifacts.map((artifact) => artifact.id),
      ['proposal', 'specs', 'tasks'],
    );
  });
});
