import fs from 'node:fs/promises';
import path from 'node:path';
import { getChangesDir } from '../status/layout.js';
import { DEFAULT_CONFIG } from './config.js';
import { TEMPLATES_ROOT } from './package-root.js';

export { TEMPLATES_ROOT } from './package-root.js';

const FALLBACK_PROPOSAL_MD = `---
title: Change title
depends_on: []
verify: node -e "process.exit(0)"
features:
  reads: []
---
## Goal

What problem this change solves and why.

## Verify

\`node -e "process.exit(0)"\`

Replace this planning sentinel, here and in the frontmatter, with the command
that verifies the completed change's final tree, and say what it proves.

## Non-goals

- What this change deliberately does not do.

## Surface

<!-- User-facing names this change adds, changes, or removes: commands, flags,
config keys, frontmatter fields, document sections, dead reasons, and event
types. Replace None with one line per name, such as
"- Added: \`osq init --refresh-schema\` (flag)". -->
None

## Contract

### Requirement: <requirement name>

The system SHALL <observable behavior>.

#### Scenario: <scenario name>
- **WHEN** <condition>
- **THEN** <outcome>

## Human steps

- Review the proposal, delta specs, and task bodies, then run \`osq approve <id>\`
  yourself.

## Delta

Delta specs live beside the proposal as \`specs/<capability>/spec.md\`. Each holds
the exact text the capability spec will contain after the change, under
\`## ADDED Requirements\`, \`## MODIFIED Requirements\`, \`## REMOVED Requirements\`,
or \`## RENAMED Requirements\`; a modified requirement repeats its full text. List
each delta here in one line and name any file two tasks share.

A delta that introduces a new capability also declares the files it owns in a
\`### Requirement: Code ownership\` block. Its \`<!-- source: ... -->\` comment lists
the owned path globs, comma-separated, and its scenario restates them:

\`\`\`markdown
### Requirement: Code ownership
<!-- source: src/core/example.ts, src/cli/example.ts -->
The <capability> capability SHALL own <subsystems>.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for <capability>
- **THEN** system maps \`src/core/example.ts\` and \`src/cli/example.ts\` to <capability>
\`\`\`
`;

const FALLBACK_TASKS_MD = `# Tasks

## 1. Section title

- [ ] 1. When initial condition, expected outcome
`;

const FALLBACK_TASK_1_MD = `---
title: When initial condition, expected outcome
verify: node -e "process.exit(0)"
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] Acceptance criterion 1
`;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function getNextSpecNumber(specsDir: string): Promise<string> {
  // Rejected attempts are numbered too, so a rejection followed by a replan
  // never reuses an identifier.
  const dirsToScan = [specsDir, path.join(specsDir, 'archive'), path.join(specsDir, 'rejected')];
  let maxNum = 0;

  for (const dir of dirsToScan) {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const match = entry.match(/^(\d+)/);
      if (match) {
        const num = Number.parseInt(match[1], 10);
        if (!Number.isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  return String(maxNum + 1).padStart(3, '0');
}

export interface NewSpecResult {
  specId: string;
  folderName: string;
  folderPath: string;
}

/**
 * Replace only the proposal title and, when queue dependencies are supplied,
 * the `depends_on` line. The template body and every other frontmatter key
 * stay intact.
 */
function seedProposal(content: string, title: string, dependsOn?: readonly string[]): string {
  let seeded = content.replace(/^title:\s*.*$/m, `title: ${title}`);
  if (dependsOn !== undefined) {
    const value = `[${dependsOn.map((id) => JSON.stringify(id)).join(', ')}]`;
    seeded = seeded.replace(/^depends_on:\s*.*$/m, `depends_on: ${value}`);
  }
  return seeded;
}

export async function createNewSpec(
  projectDir: string,
  title: string,
  options: { specsDirName?: string; slug?: string; dependsOn?: readonly string[] } = {},
): Promise<NewSpecResult> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error('Spec name cannot be empty');
  }

  const slug = options.slug?.trim() || slugify(trimmedTitle);
  if (!slug) {
    throw new Error('Spec name cannot be empty');
  }

  const specsDir = options.specsDirName
    ? path.join(projectDir, options.specsDirName)
    : getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, projectDir);
  const legacyTemplateDir = path.join(specsDir, '_template');

  const legacyTemplateExists = await fs
    .stat(legacyTemplateDir)
    .then(() => true)
    .catch(() => false);

  const specId = await getNextSpecNumber(specsDir);
  const folderName = `${specId}-${slug}`;
  const targetDir = path.join(specsDir, folderName);

  const targetExists = await fs
    .stat(targetDir)
    .then(() => true)
    .catch(() => false);
  if (targetExists) {
    throw new Error(`Spec folder already exists at ${targetDir}`);
  }

  if (legacyTemplateExists) {
    // Legacy spec folder layout
    await fs.cp(legacyTemplateDir, targetDir, { recursive: true });

    const specMdPath = path.join(targetDir, 'spec.md');
    try {
      const specContent = await fs.readFile(specMdPath, 'utf8');
      const updatedContent = specContent.replace(/^title:\s*.*$/m, `title: ${trimmedTitle}`);
      await fs.writeFile(specMdPath, updatedContent, 'utf8');
    } catch {}
  } else {
    // OpenSpec change folder layout
    await fs.mkdir(path.join(targetDir, 'tasks'), { recursive: true });

    let proposalContent = FALLBACK_PROPOSAL_MD;
    try {
      proposalContent = await fs.readFile(path.join(TEMPLATES_ROOT, 'proposal.md'), 'utf8');
    } catch {}

    const updatedProposal = seedProposal(proposalContent, trimmedTitle, options.dependsOn);
    await fs.writeFile(path.join(targetDir, 'proposal.md'), updatedProposal, 'utf8');

    let tasksContent = FALLBACK_TASKS_MD;
    try {
      tasksContent = await fs.readFile(path.join(TEMPLATES_ROOT, 'tasks.md'), 'utf8');
    } catch {}
    await fs.writeFile(path.join(targetDir, 'tasks.md'), tasksContent, 'utf8');

    let task1Content = FALLBACK_TASK_1_MD;
    try {
      task1Content = await fs.readFile(
        path.join(TEMPLATES_ROOT, 'openspec', 'schemas', 'osq', 'templates', 'spec.md'),
        'utf8',
      );
    } catch {}
    // If not a task format, fallback to default task 1
    if (!task1Content.includes('verify:')) {
      task1Content = FALLBACK_TASK_1_MD;
    }
    await fs.writeFile(path.join(targetDir, 'tasks', '1.md'), task1Content, 'utf8');
  }

  return {
    specId,
    folderName,
    folderPath: targetDir,
  };
}
