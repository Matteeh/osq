import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const OSQ_START_MARKER = '<!-- OSQ:START -->';
export const OSQ_END_MARKER = '<!-- OSQ:END -->';

/** Path to the package's bundled `templates/` directory. */
export const TEMPLATES_ROOT = fileURLToPath(new URL('../../templates', import.meta.url));

export const MANAGED_AGENTS_BLOCK = `${OSQ_START_MARKER}
## Executing a spec

1. Read your task file, its parent \`proposal.md\`, then only the docs listed under \`features\`. Nothing else.
2. Too big for one pass? Write why in \`.run/results/<n>.md\`, exit without code.
3. Read a previous result file for this task if present. Run the task's \`verify\`. Start from what fails.
4. Tests for each acceptance line before implementing.
5. Minimal code to pass. Stay inside \`scope\`.
6. Run the task's \`verify\` command before exiting.

## OpenSpec layout

- Living capability specs live at \`openspec/specs/<capability>/spec.md\`.
- In-flight changes live at \`openspec/changes/<id>-<slug>/\`.
- The change document is \`proposal.md\`; its delta specs live beside it under \`specs/<capability>/spec.md\`.
- The osq workflow schema lives at \`openspec/schemas/osq/schema.yaml\` (proposal -> specs -> tasks).
- \`tasks/<n>.md\` is the osq-specific execution unit; \`tasks.md\` is a write-only projection of \`.run/\` state.

## Exiting

Write \`.run/results/<n>.md\` first: changed, deviated, drift against \`features/\`, missing context, and for unfinished work which acceptance line is next. Omit empty sections. Then exit. One attempt. Never write to \`features/\`, \`tasks.md\`, or anything in \`specs/\` outside \`.run/results/\`. Do not ask questions.
${OSQ_END_MARKER}`;

const TEMPLATE_SPEC_MD = `---
title: Change title
depends_on: []
features:
  reads: []
  writes: []
---
## Goal

What problem this change solves and why.

## Contract

| Input | Expected Output |
|---|---|
| Sample input | Sample output |

## Non-goals

What this change deliberately does not do.

## Delta

What changes in each doc under features.writes. Applied by the watcher when the last task is done.
`;

const TEMPLATE_TASKS_MD = `# Tasks

- [ ] 1. When initial condition, expected outcome
`;

const TEMPLATE_TASK_1_MD = `---
title: When initial condition, expected outcome
verify: node -e "process.exit(0)"
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] Acceptance criterion 1
`;

const DEFAULT_CONFIG_CONTENT = `import { defineConfig } from '@matteeh/osq';

export default defineConfig({
  harness: process.env.OSQ_HARNESS || 'agy',
  maxConcurrency: 1,
});
`;

const DEFAULT_ENV_EXAMPLE = `OSQ_HARNESS=agy
# GEMINI_API_KEY=
# ANTHROPIC_API_KEY=
`;

export interface InitResult {
  createdDirs: string[];
  createdFiles: string[];
  skippedFiles: string[];
  updatedAgentsMd: boolean;
}

export async function updateAgentsMd(targetDir: string): Promise<boolean> {
  const agentsPath = path.join(targetDir, 'AGENTS.md');
  const exists = await fs
    .stat(agentsPath)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    const initialContent = `# AGENTS\n\n${MANAGED_AGENTS_BLOCK}\n`;
    await fs.writeFile(agentsPath, initialContent, 'utf8');
    return true;
  }

  const currentContent = await fs.readFile(agentsPath, 'utf8');
  const startIndex = currentContent.indexOf(OSQ_START_MARKER);
  const endIndex = currentContent.indexOf(OSQ_END_MARKER);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = currentContent.slice(0, startIndex);
    const after = currentContent.slice(endIndex + OSQ_END_MARKER.length);
    const updated = `${before}${MANAGED_AGENTS_BLOCK}${after}`;
    await fs.writeFile(agentsPath, updated, 'utf8');
  } else {
    const separator = currentContent.endsWith('\n\n')
      ? ''
      : currentContent.endsWith('\n')
        ? '\n'
        : '\n\n';
    const updated = `${currentContent}${separator}${MANAGED_AGENTS_BLOCK}\n`;
    await fs.writeFile(agentsPath, updated, 'utf8');
  }

  return true;
}

export async function scaffoldProject(targetDir: string): Promise<InitResult> {
  const result: InitResult = {
    createdDirs: [],
    createdFiles: [],
    skippedFiles: [],
    updatedAgentsMd: false,
  };

  const dirsToCreate = [
    'specs',
    'specs/_template',
    'specs/_template/tasks',
    'specs/archive',
    'features',
    'decisions',
    'openspec',
    path.join('openspec', 'schemas'),
    path.join('openspec', 'schemas', 'osq'),
    path.join('openspec', 'schemas', 'osq', 'templates'),
    path.join('openspec', 'specs'),
    path.join('openspec', 'changes'),
    path.join('openspec', 'changes', 'archive'),
  ];

  for (const relDir of dirsToCreate) {
    const fullDir = path.join(targetDir, relDir);
    const exists = await fs
      .stat(fullDir)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      await fs.mkdir(fullDir, { recursive: true });
      result.createdDirs.push(relDir);
    }
  }

  const filesToCreate: Array<{ relPath: string; content: string }> = [
    { relPath: 'osq.config.ts', content: DEFAULT_CONFIG_CONTENT },
    { relPath: '.env.example', content: DEFAULT_ENV_EXAMPLE },
    { relPath: path.join('specs', '_template', 'spec.md'), content: TEMPLATE_SPEC_MD },
    { relPath: path.join('specs', '_template', 'tasks.md'), content: TEMPLATE_TASKS_MD },
    { relPath: path.join('specs', '_template', 'tasks', '1.md'), content: TEMPLATE_TASK_1_MD },
  ];

  const bundledTemplates = [
    path.join('openspec', 'config.yaml'),
    path.join('openspec', 'schemas', 'osq', 'schema.yaml'),
    path.join('openspec', 'schemas', 'osq', 'README.md'),
    path.join('openspec', 'schemas', 'osq', 'templates', 'proposal.md'),
    path.join('openspec', 'schemas', 'osq', 'templates', 'spec.md'),
    path.join('openspec', 'schemas', 'osq', 'templates', 'tasks.md'),
  ];

  for (const relPath of bundledTemplates) {
    filesToCreate.push({
      relPath,
      content: await fs.readFile(path.join(TEMPLATES_ROOT, relPath), 'utf8'),
    });
  }

  for (const file of filesToCreate) {
    const fullPath = path.join(targetDir, file.relPath);
    const exists = await fs
      .stat(fullPath)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, file.content, 'utf8');
      result.createdFiles.push(file.relPath);
    } else {
      result.skippedFiles.push(file.relPath);
    }
  }

  result.updatedAgentsMd = await updateAgentsMd(targetDir);
  return result;
}
