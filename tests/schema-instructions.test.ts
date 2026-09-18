import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(repoRoot, 'templates', 'openspec', 'schemas', 'osq', 'schema.yaml');
const configPath = path.join(repoRoot, 'templates', 'openspec', 'config.yaml');
const readmePath = path.join(repoRoot, 'templates', 'openspec', 'schemas', 'osq', 'README.md');

interface ParsedArtifact {
  id: string;
  instruction: string;
}

interface ParsedSchema {
  artifacts: ParsedArtifact[];
  apply?: { instruction?: string };
}

interface ParsedConfig {
  context?: string;
  rules?: Record<string, string[]>;
}

async function readSchema(): Promise<ParsedSchema> {
  return parseYaml(await fs.readFile(schemaPath, 'utf8')) as ParsedSchema;
}

async function readConfig(): Promise<ParsedConfig> {
  return parseYaml(await fs.readFile(configPath, 'utf8')) as ParsedConfig;
}

async function readReadme(): Promise<string> {
  return fs.readFile(readmePath, 'utf8');
}

function tasksInstruction(schema: ParsedSchema): string {
  const tasks = schema.artifacts.find((artifact) => artifact.id === 'tasks');
  assert.ok(tasks, 'schema.yaml must declare a tasks artifact');
  assert.ok(tasks.instruction.trim().length > 0, 'tasks artifact must carry an instruction');
  return tasks.instruction;
}

describe('OpenSpec schema execution authority instructions', () => {
  it('tasks artifact restricts execution to osq watch', async () => {
    const instruction = tasksInstruction(await readSchema());
    assert.match(
      instruction,
      /executed\s+only\s+by\s+osq\s+watch/i,
      'tasks instruction must state tasks are executed only by osq watch',
    );
  });

  it('tasks artifact states archiving is osq-owned and never openspec archive', async () => {
    const instruction = tasksInstruction(await readSchema());
    assert.match(
      instruction,
      /archiv\w*\s+is\s+owned\s+exclusively\s+by\s+osq/i,
      'tasks instruction must state archiving is owned exclusively by osq',
    );
    assert.match(
      instruction,
      /never\s+openspec\s+archive/i,
      'tasks instruction must state never openspec archive',
    );
  });

  it('tasks artifact states checkboxes are a runner-written write-only projection', async () => {
    const instruction = tasksInstruction(await readSchema());
    assert.match(
      instruction,
      /written\s+by\s+the\s+osq\s+runner/i,
      'tasks instruction must state checkboxes are written by the osq runner',
    );
    assert.match(
      instruction,
      /write-only\s+projection/i,
      'tasks instruction must state checkboxes are a write-only projection',
    );
    assert.match(
      instruction,
      /approval\s+hash/i,
      'tasks instruction must tie the projection to the approval hash',
    );
    assert.match(
      instruction,
      /MUST\s+NOT\s+execute\s+tasks\s+directly/i,
      'tasks instruction must forbid direct task execution',
    );
  });

  it('apply instruction hands task execution off to osq watch', async () => {
    const schema = await readSchema();
    const instruction = schema.apply?.instruction ?? '';
    assert.match(
      instruction,
      /executed\s+strictly\s+by\s+running\s+`?osq\s+watch`?/i,
      'apply instruction must command agents to run osq watch',
    );
    assert.match(
      instruction,
      /do\s+not\s+execute\s+tasks\s+directly/i,
      'apply instruction must forbid direct task execution',
    );
    assert.match(
      instruction,
      /do\s+not\s+edit\s+tasks\.md\s+checkboxes/i,
      'apply instruction must forbid editing tasks.md checkboxes',
    );
    assert.match(
      instruction,
      /never\s+run\s+`?openspec\s+archive`?/i,
      'apply instruction must forbid openspec archive',
    );
    assert.match(
      instruction,
      /updated\s+automatically\s+by\s+the\s+runner/i,
      'apply instruction must state checkboxes are updated by the runner',
    );
  });

  it('config context states execution and archive authority belongs strictly to osq', async () => {
    const config = await readConfig();
    const context = config.context ?? '';
    assert.match(
      context,
      /execution\s+and\s+archive\s+authority\s+belong\s+strictly\s+to\s+osq/i,
      'config context must state execution and archive authority belongs strictly to osq',
    );
    assert.match(context, /osq\s+watch/i, 'config context must name osq watch as the executor');
    assert.match(
      context,
      /never\s+openspec\s+archive/i,
      'config context must state archiving is never done with openspec archive',
    );
    assert.match(
      context,
      /write-only/i,
      'config context must state tasks.md checkboxes are write-only runner projections',
    );
  });

  it('config tasks rules forbid direct execution and archive', async () => {
    const config = await readConfig();
    const tasksRules = (config.rules?.tasks ?? []).join('\n');
    assert.match(tasksRules, /osq\s+watch/i, 'tasks rules must direct execution through osq watch');
    assert.match(
      tasksRules,
      /never\s+edit\s+tasks\.md\s+checkboxes/i,
      'tasks rules must forbid editing tasks.md checkboxes',
    );
    assert.match(
      tasksRules,
      /never\s+run\s+openspec\s+archive/i,
      'tasks rules must forbid openspec archive',
    );
  });

  it('schema README documents runtime and archive authority boundaries', async () => {
    const readme = await readReadme();
    assert.match(readme, /## Execution and archive authority/i);
    assert.match(readme, /osq\s+watch/i, 'README must state osq watch owns execution');
    assert.match(
      readme,
      /archiv\w*\s+is\s+owned\s+exclusively\s+by\s+`?osq`?/i,
      'README must state archive is osq-owned',
    );
    assert.match(
      readme,
      /never\s+performed\s+with\s+`?openspec\s+archive`?/i,
      'README must state openspec archive is never used',
    );
    assert.match(
      readme,
      /write-only\s+projection/i,
      'README must document the write-only checkbox projection',
    );
  });
});
