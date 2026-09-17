import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { scaffoldProject, updateAgentsMd } from '../src/core/init.js';

describe('osq init', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-init-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('scaffolds required directories and default files in a fresh repo', async () => {
    const result = await scaffoldProject(tmpDir);

    assert.ok(result.createdDirs.includes('specs'));
    assert.ok(result.createdDirs.includes('features'));
    assert.ok(result.createdDirs.includes('decisions'));

    const configExists = await fs
      .stat(path.join(tmpDir, 'osq.config.ts'))
      .then(() => true)
      .catch(() => false);
    assert.equal(configExists, true);

    const templateSpecExists = await fs
      .stat(path.join(tmpDir, 'specs', '_template', 'spec.md'))
      .then(() => true)
      .catch(() => false);
    assert.equal(templateSpecExists, true);
  });

  it('does not overwrite existing osq.config.ts or spec templates', async () => {
    const configPath = path.join(tmpDir, 'osq.config.ts');
    await fs.writeFile(configPath, '// custom user config');

    const result = await scaffoldProject(tmpDir);
    assert.ok(result.skippedFiles.includes('osq.config.ts'));

    const content = await fs.readFile(configPath, 'utf8');
    assert.equal(content, '// custom user config');
  });

  it('creates AGENTS.md with the managed block if missing', async () => {
    await updateAgentsMd(tmpDir);

    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    const content = await fs.readFile(agentsPath, 'utf8');

    assert.ok(content.includes('<!-- OSQ:START -->'));
    assert.ok(content.includes('<!-- OSQ:END -->'));
    assert.ok(content.includes('Executing a spec'));
  });

  it('managed block is clean, self-contained, and contains no self-referential repo text', async () => {
    await updateAgentsMd(tmpDir);

    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    const content = await fs.readFile(agentsPath, 'utf8');

    assert.equal(content.includes('This repo uses osq on itself'), false);
    assert.equal(content.includes('Full gate once, above'), false);
    assert.ok(content.includes("Run the task's `verify` command before exiting."));
  });

  it('injects or updates the managed block in an existing AGENTS.md idempotently', async () => {
    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    const initialContent = '# Custom Project\n\nCustom user instructions.\n';
    await fs.writeFile(agentsPath, initialContent);

    // First run: injects block
    await updateAgentsMd(tmpDir);
    let content = await fs.readFile(agentsPath, 'utf8');
    assert.ok(content.startsWith('# Custom Project\n\nCustom user instructions.'));
    assert.ok(content.includes('<!-- OSQ:START -->'));
    assert.ok(content.includes('<!-- OSQ:END -->'));

    // Second run: idempotent refresh
    await updateAgentsMd(tmpDir);
    content = await fs.readFile(agentsPath, 'utf8');

    const startOccurrences = content.split('<!-- OSQ:START -->').length - 1;
    const endOccurrences = content.split('<!-- OSQ:END -->').length - 1;
    assert.equal(startOccurrences, 1);
    assert.equal(endOccurrences, 1);
    assert.ok(content.startsWith('# Custom Project\n\nCustom user instructions.'));
  });
});
