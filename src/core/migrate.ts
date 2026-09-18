import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { type OsqConfig, loadConfig } from './config.js';
import { getArchiveDir, getChangesDir } from './layout.js';
import { getNextSpecNumber } from './new.js';
import { parseFrontmatter } from './parser.js';

/** Default slug for the "next spec" placeholder created after migration. */
export const SAMPLE_STUB_SLUG = 'sample';

export interface MigrationEntry {
  readonly from: string;
  readonly to: string;
}

export interface MigrateResult {
  migratedFeatures: MigrationEntry[];
  migratedChanges: MigrationEntry[];
  migratedArchives: MigrationEntry[];
  convertedProposals: string[];
  tickedTasks: string[];
  createdStub: string | null;
  skipped: string[];
}

export interface MigrateOptions {
  readonly cwd?: string;
  readonly config?: OsqConfig;
  /** Create the next-id sample stub after migration. Defaults to `true`. */
  readonly sampleStub?: boolean;
  /** Slug used for the next-id sample stub. Defaults to `sample`. */
  readonly sampleSlug?: string;
}

interface MigrationPaths {
  readonly features: string;
  readonly specs: string;
  readonly archive: string;
  readonly specsTarget: string;
  readonly changesTarget: string;
  readonly archiveTarget: string;
}

async function pathExists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function listDirs(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch((): Dirent[] => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir).catch((): string[] => []);
  return entries.filter((entry) => entry.endsWith('.md')).sort();
}

function resolvePaths(projectRoot: string, config: OsqConfig): MigrationPaths {
  const legacyFeatures =
    config.paths.features === 'openspec/specs' ? 'features' : config.paths.features;
  const legacySpecs = path.join(projectRoot, 'specs');
  return {
    features: path.join(projectRoot, legacyFeatures),
    specs: legacySpecs,
    archive: path.join(legacySpecs, 'archive'),
    specsTarget: path.join(projectRoot, config.paths.openspecRoot, 'specs'),
    changesTarget: getChangesDir(config.paths.openspecRoot, projectRoot),
    archiveTarget: getArchiveDir(config.paths.openspecRoot, projectRoot),
  };
}

/**
 * Converts a legacy change `spec.md` into an OpenSpec `proposal.md`. The
 * frontmatter keeps `title`, `depends_on`, and `features.reads`, dropping
 * `features.writes`. A prose `## Delta` section is renamed to
 * `## Delta (legacy)` so the original prose survives migration untouched.
 */
export function convertSpecToProposal(content: string): string {
  const hasFrontmatter = content.startsWith('---');
  const { data, body } = parseFrontmatter(content);

  const convertedBody = body.replace(/^##[ \t]+Delta[ \t]*\r?$/m, '## Delta (legacy)');

  if (!hasFrontmatter) {
    return convertedBody;
  }

  const rawFeatures = (data.features as Record<string, unknown>) || {};
  const reads = Array.isArray(rawFeatures.reads) ? rawFeatures.reads : [];

  const frontmatter: Record<string, unknown> = {};
  if (typeof data.title === 'string') {
    frontmatter.title = data.title;
  }
  if (Array.isArray(data.depends_on)) {
    frontmatter.depends_on = data.depends_on;
  }
  frontmatter.features = { reads };

  return `---\n${YAML.stringify(frontmatter)}---\n${convertedBody}`;
}

/**
 * Rewrites every unchecked `[ ]` checkbox to `[x]`, preserving bullet style,
 * numbering, and indentation. Purely textual: no `.run/` state is read.
 */
export function tickAllCheckboxes(content: string): string {
  return content.replace(/^([ \t]*[-*][ \t]+\[)[ ](\])/gm, '$1x$2');
}

async function convertChangeDoc(folderPath: string, result: MigrateResult): Promise<void> {
  const specPath = path.join(folderPath, 'spec.md');
  const proposalPath = path.join(folderPath, 'proposal.md');

  if (!(await pathExists(specPath))) {
    return;
  }
  if (await pathExists(proposalPath)) {
    result.skipped.push(proposalPath);
    return;
  }

  const content = await fs.readFile(specPath, 'utf8');
  await fs.writeFile(proposalPath, convertSpecToProposal(content), 'utf8');
  await fs.rm(specPath, { force: true });
  result.convertedProposals.push(proposalPath);
}

async function tickTasksMdFiles(folderPath: string, result: MigrateResult): Promise<void> {
  const stack: string[] = [folderPath];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }

    const entries = await fs.readdir(current, { withFileTypes: true }).catch((): Dirent[] => []);
    for (const entry of entries) {
      if (entry.name === '.run' || entry.name === '.git' || entry.name === '.DS_Store') {
        continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name === 'tasks.md') {
        const content = await fs.readFile(fullPath, 'utf8');
        const ticked = tickAllCheckboxes(content);
        if (ticked !== content) {
          await fs.writeFile(fullPath, ticked, 'utf8');
          result.tickedTasks.push(fullPath);
        }
      }
    }
  }
}

async function moveDirectory(from: string, to: string, result: MigrateResult): Promise<boolean> {
  if (!(await pathExists(from))) {
    return false;
  }
  if (await pathExists(to)) {
    result.skipped.push(to);
    return false;
  }

  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.rename(from, to);
  return true;
}

async function migrateFeatureDocs(paths: MigrationPaths, result: MigrateResult): Promise<void> {
  if (!(await pathExists(paths.features))) {
    return;
  }

  for (const file of await listMarkdownFiles(paths.features)) {
    const capability = file.slice(0, -'.md'.length);
    const from = path.join(paths.features, file);
    const targetDir = path.join(paths.specsTarget, capability);
    const to = path.join(targetDir, 'spec.md');

    if (await pathExists(to)) {
      result.skipped.push(to);
      continue;
    }

    await fs.mkdir(targetDir, { recursive: true });
    const content = await fs.readFile(from, 'utf8');
    await fs.writeFile(to, content, 'utf8');
    await fs.rm(from, { force: true });
    result.migratedFeatures.push({ from, to });
  }
}

async function migrateArchives(paths: MigrationPaths, result: MigrateResult): Promise<void> {
  for (const name of await listDirs(paths.archive)) {
    const from = path.join(paths.archive, name);
    const to = path.join(paths.archiveTarget, name);
    if (await moveDirectory(from, to, result)) {
      result.migratedArchives.push({ from, to });
      await convertChangeDoc(to, result);
      await tickTasksMdFiles(to, result);
    }
  }
}

async function migrateActiveChanges(paths: MigrationPaths, result: MigrateResult): Promise<void> {
  for (const name of await listDirs(paths.specs)) {
    if (name === 'archive' || name.startsWith('_')) {
      continue;
    }

    const from = path.join(paths.specs, name);
    const to = path.join(paths.changesTarget, name);
    if (await moveDirectory(from, to, result)) {
      result.migratedChanges.push({ from, to });
      await convertChangeDoc(to, result);
    }
  }
}

function sampleProposal(title: string): string {
  return `---
title: ${title}
depends_on: []
features:
  reads: []
---
## Goal

Placeholder change created by \`osq migrate openspec\` for next-spec verification.
`;
}

function sampleTasks(title: string): string {
  return `# Tasks

## 1. ${title}

- [ ] 1. When the placeholder change is replaced, the next spec proceeds
`;
}

function sampleTask(): string {
  return `---
title: When the placeholder change is replaced, the next spec proceeds
verify: node -e "process.exit(0)"
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] Placeholder acceptance criterion
`;
}

async function createSampleStub(
  paths: MigrationPaths,
  result: MigrateResult,
  slug: string,
): Promise<void> {
  const existing = (await listDirs(paths.changesTarget)).find((name) => name.endsWith(`-${slug}`));
  if (existing) {
    result.skipped.push(path.join(paths.changesTarget, existing));
    return;
  }

  const nextId = await getNextSpecNumber(paths.changesTarget);
  const title = 'Sample change';
  const folder = path.join(paths.changesTarget, `${nextId}-${slug}`);

  if (await pathExists(folder)) {
    result.skipped.push(folder);
    return;
  }

  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), sampleProposal(title), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks.md'), sampleTasks(title), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), sampleTask(), 'utf8');

  result.createdStub = folder;
}

/**
 * Migrates a legacy osq layout to the OpenSpec layout:
 * - `features/<capability>.md` -> `openspec/specs/<capability>/spec.md`
 * - `specs/<id>-<slug>/`       -> `openspec/changes/<id>-<slug>/`
 * - `specs/archive/<id>/`      -> `openspec/changes/archive/<id>/`
 *
 * Every migrated change document is converted from `spec.md` to `proposal.md`
 * (dropping `features.writes` and keeping prose deltas under
 * `## Delta (legacy)`). Archived `.run/` history moves with the folder because
 * the move is a single `rename`, and every archived `tasks.md` is fully ticked.
 * Finally a `<next-id>-sample` stub is created for next-spec verification.
 */
export async function migrateToOpenSpec(options: MigrateOptions = {}): Promise<MigrateResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = options.config ?? (await loadConfig(cwd));
  const paths = resolvePaths(cwd, config);

  const result: MigrateResult = {
    migratedFeatures: [],
    migratedChanges: [],
    migratedArchives: [],
    convertedProposals: [],
    tickedTasks: [],
    createdStub: null,
    skipped: [],
  };

  await fs.mkdir(paths.specsTarget, { recursive: true });
  await fs.mkdir(paths.changesTarget, { recursive: true });
  await fs.mkdir(paths.archiveTarget, { recursive: true });

  await migrateFeatureDocs(paths, result);
  await migrateArchives(paths, result);
  await migrateActiveChanges(paths, result);

  if (options.sampleStub ?? true) {
    await createSampleStub(paths, result, options.sampleSlug ?? SAMPLE_STUB_SLUG);
  }

  return result;
}
