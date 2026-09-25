import crypto from 'node:crypto';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SCOPE_RESOLVER_VERSION, resolveScope } from '../core/run/scope.js';
import { IGNORED_DIRS, buildImportGraph } from '../core/spec/import-graph.js';
import { type TaskData, resolveChangeDoc } from '../core/spec/parser.js';
import { type MeasuresEventData, appendHarnessEvent } from '../harness/types.js';
import { readScopedDependencies } from './dependencies.js';

function countLines(content: string): number {
  return content.split('\n').length;
}
function hashContent(content: string): string {
  return `sha256:${crypto.createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

/** Per-file hashes and line counts for a task's scope. */
export interface ScopeState {
  hashes: Record<string, string | null>;
  lines: Record<string, number>;
}

/** Snapshot every resolved scoped file's content hash and line count in one pass. */
export async function snapshotScope(projectRoot: string, scope: string[]): Promise<ScopeState> {
  const hashes: Record<string, string | null> = {};
  const lines: Record<string, number> = {};
  for (const { relativePath, absolutePath } of await resolveScope(projectRoot, scope)) {
    const content = absolutePath ? await fs.readFile(absolutePath, 'utf8').catch(() => null) : null;
    hashes[relativePath] = content === null ? null : hashContent(content);
    lines[relativePath] = content === null ? 0 : countLines(content);
  }
  return { hashes, lines };
}

/** Line count of every existing file in `scope`; missing files contribute nothing. */
export async function gatherScopeCounts(
  projectRoot: string,
  scope: string[],
): Promise<{ files: number; lines: number }> {
  const { hashes, lines } = await snapshotScope(projectRoot, scope);
  const files = Object.values(hashes).filter((hash) => hash !== null).length;
  const total = Object.values(lines).reduce((sum, count) => sum + count, 0);
  return { files, lines: total };
}

/** Recursively total all text files and their lines, skipping ignored directories. */
export async function gatherRepoCounts(
  projectRoot: string,
): Promise<{ files: number; lines: number }> {
  let files = 0;
  let lines = 0;
  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as Dirent[]);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const content = await fs.readFile(fullPath, 'utf8').catch(() => null);
      if (content === null || content.includes('\u0000')) continue;
      files += 1;
      lines += countLines(content);
    }
  };
  await walk(projectRoot);
  return { files, lines };
}

/** Count of non-scoped `src/**` TypeScript files that import at least one resolved scoped file. */
export async function countImportFanIn(projectRoot: string, scope: string[]): Promise<number> {
  const srcDir = path.join(projectRoot, 'src');
  const scoped = new Set<string>();
  for (const entry of await resolveScope(projectRoot, scope)) {
    if (entry.absolutePath?.startsWith(srcDir + path.sep) === true) scoped.add(entry.relativePath);
  }
  if (scoped.size === 0) return 0;
  const graph = await buildImportGraph(projectRoot);
  const importers = new Set<string>();
  for (const file of graph.files) {
    if (!file.startsWith('src/') || !file.endsWith('.ts') || scoped.has(file)) continue;
    if (graph.importsOf(file).some((target) => scoped.has(target))) importers.add(file);
  }
  return importers.size;
}

/** Whitespace-delimited word count; empty and whitespace-only input yield 0. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

/** Requirement and scenario header counts across a change's delta spec files. */
export async function countDeltaRequirementsAndScenarios(
  specFolderPath: string,
): Promise<{ requirements: number; scenarios: number }> {
  const specsDir = path.join(specFolderPath, 'specs');
  const entries = await fs.readdir(specsDir, { withFileTypes: true }).catch(() => [] as Dirent[]);
  let requirements = 0;
  let scenarios = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const content = await fs
      .readFile(path.join(specsDir, entry.name, 'spec.md'), 'utf8')
      .catch(() => '');
    requirements += (content.match(/^###\s+Requirement:/gm) ?? []).length;
    scenarios += (content.match(/^####\s+Scenario:/gm) ?? []).length;
  }
  return { requirements, scenarios };
}

/** `sha256:<hex>` of a file's UTF-8 content, or `null` when it cannot be read. */
export async function hashFileForMeasures(filePath: string): Promise<string | null> {
  const content = await fs.readFile(filePath, 'utf8').catch(() => null);
  return content === null ? null : hashContent(content);
}

/** Map of project-relative scoped path to its current content hash. */
export async function snapshotScopeHashes(
  projectRoot: string,
  scope: string[],
): Promise<Record<string, string | null>> {
  return (await snapshotScope(projectRoot, scope)).hashes;
}

/** Map of project-relative scoped path to its current line count; missing files are 0. */
export async function snapshotScopeLines(
  projectRoot: string,
  scope: string[],
): Promise<Record<string, number>> {
  return (await snapshotScope(projectRoot, scope)).lines;
}

/** The single emission path for both start and end measures events. */
export async function emitMeasures(
  specFolderPath: string,
  taskNumber: string,
  data: MeasuresEventData,
): Promise<void> {
  await appendHarnessEvent(specFolderPath, taskNumber, {
    type: 'measures',
    timestamp: new Date().toISOString(),
    data,
  });
}

/** Collect the raw start-phase baselines for a task. */
export async function gatherStartMeasures(
  projectRoot: string,
  specFolderPath: string,
  taskData: TaskData,
): Promise<MeasuresEventData> {
  const proposalDoc = await resolveChangeDoc(specFolderPath);
  const proposalContent = proposalDoc
    ? await fs.readFile(proposalDoc.path, 'utf8').catch(() => '')
    : '';
  const [scopeCounts, repoCounts, importFanIn, delta, dependencies] = await Promise.all([
    gatherScopeCounts(projectRoot, taskData.scope),
    gatherRepoCounts(projectRoot),
    countImportFanIn(projectRoot, taskData.scope),
    countDeltaRequirementsAndScenarios(specFolderPath),
    readScopedDependencies(projectRoot, taskData.scope),
  ]);
  return {
    phase: 'start',
    scopeResolver: SCOPE_RESOLVER_VERSION,
    scopeFiles: scopeCounts.files,
    scopeLines: scopeCounts.lines,
    repoFiles: repoCounts.files,
    repoLines: repoCounts.lines,
    importFanIn,
    proposalWords: countWords(proposalContent),
    taskWords: countWords(taskData.raw),
    deltaRequirements: delta.requirements,
    deltaScenarios: delta.scenarios,
    ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
  };
}

/** End-phase diff: changed file count, absolute line delta, and before/after hashes. */
export async function gatherEndMeasures(
  startMeasures: MeasuresEventData,
  before: ScopeState,
  projectRoot: string,
  scope: string[],
): Promise<MeasuresEventData> {
  const after = await snapshotScope(projectRoot, scope);
  const scopeHashes: Record<string, { before: string | null; after: string | null }> = {};
  let changedFiles = 0;
  let changedLines = 0;
  for (const key of new Set([...Object.keys(before.hashes), ...Object.keys(after.hashes)])) {
    const beforeHash = before.hashes[key] ?? null;
    const afterHash = after.hashes[key] ?? null;
    scopeHashes[key] = { before: beforeHash, after: afterHash };
    if (beforeHash !== afterHash) {
      changedFiles += 1;
      changedLines += Math.abs((after.lines[key] ?? 0) - (before.lines[key] ?? 0));
    }
  }
  return { ...startMeasures, phase: 'end', changedFiles, changedLines, scopeHashes };
}

/** Create the start/end measures emitter pair for one task run. */
export function createTaskMeasures(
  projectRoot: string,
  specFolderPath: string,
  taskNumber: string,
  taskData: TaskData,
): { emitStart(): Promise<void>; emitEnd(): Promise<void> } {
  let start: MeasuresEventData | null = null;
  let before: ScopeState | null = null;
  return {
    async emitStart(): Promise<void> {
      before = await snapshotScope(projectRoot, taskData.scope);
      start = await gatherStartMeasures(projectRoot, specFolderPath, taskData);
      await emitMeasures(specFolderPath, taskNumber, start);
    },
    async emitEnd(): Promise<void> {
      if (!start || !before) return;
      const end = await gatherEndMeasures(start, before, projectRoot, taskData.scope);
      await emitMeasures(specFolderPath, taskNumber, end);
    },
  };
}
