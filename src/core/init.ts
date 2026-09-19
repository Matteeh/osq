import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const OSQ_START_MARKER = '<!-- OSQ:START -->';
export const OSQ_END_MARKER = '<!-- OSQ:END -->';

/** Path to the package's bundled `templates/` directory. */
export const TEMPLATES_ROOT = fileURLToPath(new URL('../../templates', import.meta.url));

export const MANAGED_AGENTS_MD_BODY = `${OSQ_START_MARKER}
## Executing a spec

1. Read your task file, its parent \`proposal.md\`, then only the delta specs and capability docs it names. Nothing else.
2. Too big for one pass? Write why in \`.run/results/<n>.md\`, exit without code.
3. Read a previous result file for this task if present. Run the task's \`verify\`. Start from what fails.
4. Tests for each acceptance line before implementing.
5. Minimal code to pass. Stay inside \`scope\`.
6. Run the task's \`verify\` command before exiting.

## OpenSpec layout

- Living capability specs live under \`openspec/specs/\` as \`<capability>/spec.md\`.
- In-flight changes live under \`openspec/changes/<id>-<slug>/\`.
- The change document is \`proposal.md\`; delta specifications live beside it as \`<capability>/spec.md\`.
- The osq workflow schema lives under \`openspec/schemas/osq/\` (proposal -> specs -> tasks).
- \`tasks/<n>.md\` is the osq execution unit; \`tasks.md\` is a write-only projection of \`.run/\` state.
- \`.run/\` markers track execution state: \`running/<n>.pid\`, \`done/<n>\`, \`dead/<n>.md\`, \`regressed/<n>.md\`, and \`approved\`.
- State is derived purely from the marker files on disk; nothing depends on in-memory state.

## Gates and executor permissions

- Approval gate: only \`osq approve\`, run by a human, writes \`.run/approved\` after linting and hashing the change.
- Verification gate: the watcher alone re-runs each task's \`verify\` against the final tree before writing \`done\`.
- An agent writes only \`.run/results/<n>.md\` and files inside \`scope\`; it never edits living capability specs, \`tasks.md\`, or marker files.

## Exiting

Write \`.run/results/<n>.md\` first: changed, deviated, missing context, and for unfinished work which acceptance line is next. Omit empty sections. Then exit. One attempt. Do not ask questions.
${OSQ_END_MARKER}`;

/** @deprecated use {@link MANAGED_AGENTS_MD_BODY}; alias kept for existing importers. */
export const MANAGED_AGENTS_BLOCK = MANAGED_AGENTS_MD_BODY;

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
  existingFiles: string[];
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
    existingFiles: [],
    updatedAgentsMd: false,
    updatedPlannerMd: false,
  };

  const dirsToCreate = [
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
      result.existingFiles.push(file.relPath);
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
