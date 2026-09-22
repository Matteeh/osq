import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';
import {
  MANAGED_AGENTS_MD_BODY,
  OSQ_END_MARKER,
  OSQ_START_MARKER,
  scaffoldProject,
  updateAgentsMd,
} from '../src/core/foundation/init.js';

interface ParsedArtifact {
  id: string;
  generates: string;
  description: string;
  template: string;
  requires: string[];
}

interface ParsedSchema {
  name: string;
  version: number;
  artifacts: ParsedArtifact[];
  apply?: { requires?: string[] };
}

interface ParsedConfig {
  schema: string;
  context?: string;
  rules?: Record<string, string[]>;
}

describe('osq init', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-init-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('scaffolds only the OpenSpec layout and default files in a fresh repo', async () => {
    const result = await scaffoldProject(tmpDir);

    assert.ok(result.createdDirs.includes('openspec'));
    assert.ok(result.createdDirs.includes(path.join('openspec', 'specs')));
    assert.ok(result.createdDirs.includes(path.join('openspec', 'changes')));

    for (const dir of result.createdDirs) {
      assert.ok(
        dir === 'openspec' || dir.startsWith(`openspec${path.sep}`),
        `osq init must scaffold only openspec/ directories, got ${dir}`,
      );
    }

    const configExists = await fs
      .stat(path.join(tmpDir, 'osq.config.ts'))
      .then(() => true)
      .catch(() => false);
    assert.equal(configExists, true);
    assert.ok(result.createdFiles.includes(path.join('openspec', 'config.yaml')));
  });

  it('does not create legacy specs/ or specs/_template/ during initialization', async () => {
    await scaffoldProject(tmpDir);

    const legacyPaths = [
      path.join(tmpDir, 'specs'),
      path.join(tmpDir, 'specs', '_template'),
      path.join(tmpDir, 'specs', '_template', 'spec.md'),
      path.join(tmpDir, 'specs', '_template', 'tasks.md'),
      path.join(tmpDir, 'specs', '_template', 'tasks', '1.md'),
    ];

    for (const legacyPath of legacyPaths) {
      const exists = await fs
        .stat(legacyPath)
        .then(() => true)
        .catch(() => false);
      assert.equal(exists, false, `${legacyPath} must not be scaffolded`);
    }
  });

  it('does not overwrite existing osq.config.ts', async () => {
    const configPath = path.join(tmpDir, 'osq.config.ts');
    await fs.writeFile(configPath, '// custom user config');

    const result = await scaffoldProject(tmpDir);
    assert.ok(result.existingFiles.includes('osq.config.ts'));

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

  it('managed AGENTS block carries the planning entry point without weakening the executor protocol', () => {
    assert.match(MANAGED_AGENTS_MD_BODY, /## Planning a change/);
    assert.match(MANAGED_AGENTS_MD_BODY, /`plan-prompt\.md`/);
    assert.match(MANAGED_AGENTS_MD_BODY, /Write only inside that change folder/);
    assert.match(MANAGED_AGENTS_MD_BODY, /`osq lint <slug>`/);
    assert.match(MANAGED_AGENTS_MD_BODY, /Never run `osq approve`/);
    assert.match(MANAGED_AGENTS_MD_BODY, /## Executing a spec/);
    assert.match(MANAGED_AGENTS_MD_BODY, /## Exiting/);
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

  it('scaffolds openspec/config.yaml declaring the osq schema and per-artifact rules', async () => {
    await scaffoldProject(tmpDir);

    const configPath = path.join(tmpDir, 'openspec', 'config.yaml');
    const config = parseYaml(await fs.readFile(configPath, 'utf8')) as ParsedConfig;

    assert.equal(config.schema, 'osq');
    assert.equal(typeof config.context, 'string');
    assert.ok((config.context ?? '').trim().length > 0, 'context should not be empty');

    const rules = config.rules ?? {};
    for (const artifactId of ['proposal', 'specs', 'tasks']) {
      assert.ok(Array.isArray(rules[artifactId]), `rules should declare ${artifactId}`);
      assert.ok(
        (rules[artifactId] ?? []).length > 0,
        `rules.${artifactId} should contain at least one rule`,
      );
      for (const rule of rules[artifactId] ?? []) {
        assert.equal(typeof rule, 'string');
        assert.ok(rule.trim().length > 0);
      }
    }
  });

  it('scaffolds openspec/schemas/osq/schema.yaml forked from spec-driven without design', async () => {
    await scaffoldProject(tmpDir);

    const schemaPath = path.join(tmpDir, 'openspec', 'schemas', 'osq', 'schema.yaml');
    const schema = parseYaml(await fs.readFile(schemaPath, 'utf8')) as ParsedSchema;

    assert.equal(schema.name, 'osq');
    assert.equal(typeof schema.version, 'number');
    assert.deepEqual(
      schema.artifacts.map((artifact) => artifact.id),
      ['proposal', 'specs', 'tasks'],
    );
    assert.equal(
      schema.artifacts.some((artifact) => artifact.id === 'design'),
      false,
      'the osq schema must drop the design artifact',
    );

    const declaredIds = new Set(schema.artifacts.map((artifact) => artifact.id));
    for (const artifact of schema.artifacts) {
      assert.ok(artifact.generates.length > 0, `${artifact.id} needs generates`);
      assert.ok(artifact.description.length > 0, `${artifact.id} needs a description`);
      assert.ok(artifact.template.length > 0, `${artifact.id} needs a template`);
      for (const requirement of artifact.requires) {
        assert.ok(
          declaredIds.has(requirement),
          `${artifact.id} requires unknown artifact ${requirement}`,
        );
      }
    }

    const specs = schema.artifacts.find((artifact) => artifact.id === 'specs');
    const tasks = schema.artifacts.find((artifact) => artifact.id === 'tasks');
    assert.deepEqual(specs?.requires, ['proposal']);
    assert.deepEqual(tasks?.requires, ['specs']);
    assert.ok(!tasks?.requires.includes('design'));
    assert.deepEqual(schema.apply?.requires, ['tasks']);
  });

  it('schema README documents tasks/<n>.md as an osq-specific execution unit', async () => {
    await scaffoldProject(tmpDir);

    const readmePath = path.join(tmpDir, 'openspec', 'schemas', 'osq', 'README.md');
    const readme = await fs.readFile(readmePath, 'utf8');

    assert.ok(readme.includes('tasks/<n>.md'));
    assert.ok(readme.includes('osq-specific'));
    assert.ok(readme.includes('execution unit'));
  });

  it('refreshes the managed AGENTS.md block with OpenSpec layout instructions', async () => {
    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    await fs.writeFile(
      agentsPath,
      '# Project\n\n<!-- OSQ:START -->\nstale instructions\n<!-- OSQ:END -->\n',
    );

    await updateAgentsMd(tmpDir);
    const content = await fs.readFile(agentsPath, 'utf8');

    assert.equal(content.includes('stale instructions'), false);
    assert.ok(content.includes('openspec/specs/'));
    assert.ok(content.includes('openspec/changes/'));
    assert.ok(content.includes('proposal.md'));
    assert.ok(content.includes('tasks/<n>.md'));
    assert.equal(content.split('<!-- OSQ:START -->').length - 1, 1);
    assert.equal(content.split('<!-- OSQ:END -->').length - 1, 1);
  });

  it('is strictly idempotent and preserves existing OpenSpec configuration', async () => {
    const openspecConfigPath = path.join(tmpDir, 'openspec', 'config.yaml');
    const schemaPath = path.join(tmpDir, 'openspec', 'schemas', 'osq', 'schema.yaml');

    const first = await scaffoldProject(tmpDir);
    assert.ok(first.createdDirs.includes('openspec'));
    assert.ok(first.createdFiles.includes(path.join('openspec', 'config.yaml')));
    assert.ok(first.createdFiles.includes(path.join('openspec', 'schemas', 'osq', 'schema.yaml')));

    await fs.writeFile(openspecConfigPath, '# user owned openspec config\n');
    await fs.writeFile(schemaPath, 'name: custom\n');

    const second = await scaffoldProject(tmpDir);
    assert.deepEqual(second.createdDirs, []);
    assert.deepEqual(second.createdFiles, []);
    assert.ok(second.existingFiles.includes(path.join('openspec', 'config.yaml')));
    assert.ok(
      second.existingFiles.includes(path.join('openspec', 'schemas', 'osq', 'schema.yaml')),
    );

    assert.equal(await fs.readFile(openspecConfigPath, 'utf8'), '# user owned openspec config\n');
    assert.equal(await fs.readFile(schemaPath, 'utf8'), 'name: custom\n');
  });

  it('creates the Claude plan command and classifies it in InitResult', async () => {
    const rel = path.join('.claude', 'commands', 'osq-plan.md');

    const first = await scaffoldProject(tmpDir);
    assert.equal(first.updatedClaudePlanCommand, true);
    assert.ok(first.createdFiles.includes(rel), JSON.stringify(first.createdFiles));

    const content = await fs.readFile(path.join(tmpDir, rel), 'utf8');
    assert.ok(content.includes('$ARGUMENTS'));
    assert.ok(content.includes('`plan-prompt.md`'));
    assert.ok(content.includes('Write only inside that change folder'));
    assert.ok(content.includes('osq lint $ARGUMENTS'));
    assert.ok(content.includes('Never run `osq approve`'));
    assert.equal(content.split(OSQ_START_MARKER).length - 1, 1);
    assert.equal(content.split(OSQ_END_MARKER).length - 1, 1);

    const second = await scaffoldProject(tmpDir);
    assert.equal(second.updatedClaudePlanCommand, true);
    assert.ok(second.existingFiles.includes(rel), JSON.stringify(second.existingFiles));
    assert.deepEqual(second.createdFiles, []);
    assert.deepEqual(second.createdDirs, []);
  });

  it('refreshes a stale Claude command while preserving surrounding content', async () => {
    const rel = path.join('.claude', 'commands', 'osq-plan.md');
    const commandPath = path.join(tmpDir, rel);
    await fs.mkdir(path.dirname(commandPath), { recursive: true });
    await fs.writeFile(
      commandPath,
      `# House command\n\nKeep this preamble.\n\n<!-- OPENSPEC:START -->\nforeign command block\n<!-- OPENSPEC:END -->\n\n${OSQ_START_MARKER}\nstale command\n${OSQ_END_MARKER}\n\nKeep this epilogue.\n`,
      'utf8',
    );

    await scaffoldProject(tmpDir);

    const content = await fs.readFile(commandPath, 'utf8');
    assert.equal(content.includes('stale command'), false);
    assert.ok(content.includes('Keep this preamble.'));
    assert.ok(content.includes('foreign command block'));
    assert.ok(content.includes('Keep this epilogue.'));
    assert.equal(content.split(OSQ_START_MARKER).length - 1, 1);
    assert.equal(content.split(OSQ_END_MARKER).length - 1, 1);
  });

  it('does not rewrite existing config, environment, schema, or unrelated files', async () => {
    const openspecConfigPath = path.join(tmpDir, 'openspec', 'config.yaml');
    const schemaPath = path.join(tmpDir, 'openspec', 'schemas', 'osq', 'schema.yaml');
    const envExamplePath = path.join(tmpDir, '.env.example');
    const sentinelPath = path.join(tmpDir, 'NOTES.md');
    await fs.mkdir(path.dirname(schemaPath), { recursive: true });
    await fs.writeFile(openspecConfigPath, '# custom openspec config\n');
    await fs.writeFile(schemaPath, 'name: custom\n');
    await fs.writeFile(envExamplePath, '# custom env\n');
    await fs.writeFile(sentinelPath, 'keep me\n');

    await scaffoldProject(tmpDir);

    assert.equal(await fs.readFile(openspecConfigPath, 'utf8'), '# custom openspec config\n');
    assert.equal(await fs.readFile(schemaPath, 'utf8'), 'name: custom\n');
    assert.equal(await fs.readFile(envExamplePath, 'utf8'), '# custom env\n');
    assert.equal(await fs.readFile(sentinelPath, 'utf8'), 'keep me\n');
  });
});
