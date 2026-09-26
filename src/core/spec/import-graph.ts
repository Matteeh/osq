import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Directory names never walked by the import graph, and by the watcher's
 * repository counts.
 */
export const IGNORED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  '.git',
  '.run',
  'coverage',
  '.nyc_output',
  '.vscode',
  '.idea',
]);

/** Every script extension the graph records, in resolution preference order. */
const GRAPH_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** Extensions TypeScript rewrites to a TypeScript stem. */
const JS_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs'] as const;
const TS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'] as const;

/** One pass over file text; captures import, export, and require specifiers. */
const SPECIFIER_REGEX = /(?:\bfrom\b|\bimport\b|\brequire\b)\s*(?:\(\s*)?['"]([^'"]+)['"]/g;

/** The files of one repository and the relative imports between them. */
export interface ImportGraph {
  /** Sorted project-relative POSIX paths of every JavaScript and TypeScript file. */
  readonly files: readonly string[];
  /** Sorted project-relative files this file imports. */
  importsOf(file: string): readonly string[];
  /** Sorted project-relative files that import this file. */
  importersOf(file: string): readonly string[];
}

/** One importing file and its distance from the files it reaches. */
export interface ReachingFile {
  readonly file: string;
  readonly depth: number;
}

/** Options for `buildImportGraph`. */
export interface BuildImportGraphOptions {
  /** Extra repository-relative folders to leave out of the graph. */
  readonly skip?: readonly string[];
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

/** True for a JavaScript or TypeScript file the graph records; declarations do not count. */
function isGraphFile(name: string): boolean {
  if (name.endsWith('.d.ts')) return false;
  return GRAPH_EXTENSIONS.some((extension) => name.endsWith(extension));
}

/** Candidate project-relative targets for a relative specifier, in resolve order. */
function importCandidates(fromDir: string, specifier: string): string[] {
  const base = toPosix(path.normalize(path.join(fromDir, specifier)));
  const candidates = [base];
  const lower = base.toLowerCase();
  const jsExtension = JS_EXTENSIONS.find((extension) => lower.endsWith(extension));
  if (jsExtension !== undefined) {
    const stem = base.slice(0, -jsExtension.length);
    candidates.push(...TS_EXTENSIONS.map((extension) => `${stem}${extension}`));
  }
  candidates.push(...GRAPH_EXTENSIONS.map((extension) => `${base}${extension}`));
  candidates.push(...GRAPH_EXTENSIONS.map((extension) => `${base}/index${extension}`));
  return candidates;
}

/** The graph file a relative specifier resolves to, or null. */
function resolveGraphSpecifier(
  files: ReadonlySet<string>,
  fromFile: string,
  specifier: string,
): string | null {
  if (!specifier.startsWith('.')) return null;
  for (const candidate of importCandidates(toPosix(path.dirname(fromFile)), specifier)) {
    if (!candidate.endsWith('.d.ts') && files.has(candidate)) return candidate;
  }
  return null;
}

/** Recursively list graph files outside ignored folders and `skip`. */
async function listGraphFiles(projectRoot: string, skip: readonly string[]): Promise<string[]> {
  const excluded = new Set(skip.map((entry) => entry.replace(/\\/g, '/').replace(/\/+$/, '')));
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as Dirent[]);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (excluded.has(toPosix(path.relative(projectRoot, fullPath)))) continue;
        await walk(fullPath);
      } else if (entry.isFile() && isGraphFile(entry.name)) {
        files.push(toPosix(path.relative(projectRoot, fullPath)));
      }
    }
  };
  await walk(projectRoot);
  return files.sort();
}

/**
 * Build the relative import graph of every JavaScript and TypeScript file
 * outside ignored folders and `options.skip`. Bare and aliased specifiers are
 * never resolved.
 */
export async function buildImportGraph(
  projectRoot: string,
  options: BuildImportGraphOptions = {},
): Promise<ImportGraph> {
  const files = await listGraphFiles(projectRoot, options.skip ?? []);
  const known = new Set(files);
  const imports = new Map<string, string[]>();
  const importers = new Map<string, string[]>();
  for (const file of files) {
    const content = await fs.readFile(path.join(projectRoot, file), 'utf8').catch(() => '');
    const targets = new Set<string>();
    for (const match of content.matchAll(SPECIFIER_REGEX)) {
      const specifier = match[1];
      const resolved =
        specifier === undefined ? null : resolveGraphSpecifier(known, file, specifier);
      if (resolved !== null) targets.add(resolved);
    }
    const sorted = [...targets].sort();
    imports.set(file, sorted);
    for (const target of sorted) {
      const list = importers.get(target);
      if (list === undefined) importers.set(target, [file]);
      else list.push(file);
    }
  }
  for (const list of importers.values()) list.sort();
  return {
    files,
    importsOf: (file) => imports.get(file) ?? [],
    importersOf: (file) => importers.get(file) ?? [],
  };
}

/** Every file `files` import at any depth, sorted. */
export function reachImports(graph: ImportGraph, files: readonly string[]): string[] {
  const reached = new Set<string>();
  const queue = [...files];
  for (let index = 0; index < queue.length; index += 1) {
    for (const target of graph.importsOf(queue[index] ?? '')) {
      if (reached.has(target)) continue;
      reached.add(target);
      queue.push(target);
    }
  }
  return [...reached].sort();
}

/** Every file importing one of `files` within `maxDepth` levels, nearest first. */
export function reachImporters(
  graph: ImportGraph,
  files: readonly string[],
  maxDepth: number,
): ReachingFile[] {
  const roots = new Set(files);
  const depth = new Map<string, number>();
  for (const file of roots) depth.set(file, 0);
  let frontier = [...roots];
  for (let level = 1; level <= maxDepth && frontier.length > 0; level += 1) {
    const next: string[] = [];
    for (const file of frontier) {
      for (const importer of graph.importersOf(file)) {
        if (depth.has(importer)) continue;
        depth.set(importer, level);
        next.push(importer);
      }
    }
    frontier = next;
  }
  return [...depth.entries()]
    .filter(([file]) => !roots.has(file))
    .map(([file, level]) => ({ file, depth: level }))
    .sort((a, b) => a.depth - b.depth || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}
