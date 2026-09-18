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

export const MANAGED_PLANNER_BLOCK = `${OSQ_START_MARKER}
## Planning a change

You write the change folder; a cheaper coding agent executes it one task at a
time and cannot see anything you did not write down. Plan so a literal, narrow
reader succeeds.

1. Read \`AGENTS.md\`, the capability specs this change touches, and one recent
   archived change end to end.
2. Reply with the parent spec, the task list (titles only), the capability specs
   this change will write, and any \`## Human steps\`. Stop there.
3. Write task bodies only after the human approves the list.

### Before you write a task

- Grep for what already exists; verify every version, flag, or API before use.

### Tasks

- One task per coherent unit. Title is "When X, Y".
- Every task names its \`scope\`, \`verify\` (no TTY, no network), and the test
  files it may modify. Tests not listed are frozen.
- Refer to functions and files by name, never by line number.

### Parent spec

- \`## Goal\`, \`## Non-goals\`, and the contract as requirements with scenarios.
- The delta is the exact text the capability spec will contain after the change,
  never an instruction to update something.
- Anything a task must not do itself goes under \`## Human steps\`.
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
  updatedPlannerMd: boolean;
}

async function pathExists(targetPath: string): Promise<boolean> {
  return fs
    .stat(targetPath)
    .then(() => true)
    .catch(() => false);
}

async function updateManagedBlock(
  filePath: string,
  title: string,
  block: string,
): Promise<boolean> {
  if (!(await pathExists(filePath))) {
    await fs.writeFile(filePath, `# ${title}\n\n${block}\n`, 'utf8');
    return true;
  }

  const currentContent = await fs.readFile(filePath, 'utf8');
  const startIndex = currentContent.indexOf(OSQ_START_MARKER);
  const endIndex = currentContent.indexOf(OSQ_END_MARKER);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = currentContent.slice(0, startIndex);
    const after = currentContent.slice(endIndex + OSQ_END_MARKER.length);
    await fs.writeFile(filePath, `${before}${block}${after}`, 'utf8');
  } else {
    const separator = currentContent.endsWith('\n\n')
      ? ''
      : currentContent.endsWith('\n')
        ? '\n'
        : '\n\n';
    await fs.writeFile(filePath, `${currentContent}${separator}${block}\n`, 'utf8');
  }

  return true;
}

export async function updateAgentsMd(targetDir: string): Promise<boolean> {
  return updateManagedBlock(path.join(targetDir, 'AGENTS.md'), 'AGENTS', MANAGED_AGENTS_BLOCK);
}

export async function updatePlannerMd(targetDir: string): Promise<boolean> {
  return updateManagedBlock(
    path.join(targetDir, 'PLANNER.md'),
    'Planning a change for osq',
    MANAGED_PLANNER_BLOCK,
  );
}

export async function scaffoldProject(targetDir: string): Promise<InitResult> {
  const result: InitResult = {
    createdDirs: [],
    createdFiles: [],
    skippedFiles: [],
    updatedAgentsMd: false,
    updatedPlannerMd: false,
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
    if (!(await pathExists(fullDir))) {
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
    if (await pathExists(fullPath)) {
      result.skippedFiles.push(file.relPath);
    } else {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, file.content, 'utf8');
      result.createdFiles.push(file.relPath);
    }
  }

  result.updatedAgentsMd = await updateAgentsMd(targetDir);
  result.updatedPlannerMd = await updatePlannerMd(targetDir);
  return result;
}
