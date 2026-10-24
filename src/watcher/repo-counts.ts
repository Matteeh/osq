import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { openBlobLineIndex } from '../core/report/blob-line-index.js';
import { IGNORED_DIRS } from '../core/spec/import-graph.js';
import { DEFAULT_GIT_SECONDS, runGit } from '../core/vcs/git-vcs.js';

/** A repository's text files and their line counts. */
export interface RepoCounts {
  readonly files: number;
  readonly lines: number;
}

/** One tracked path from `git ls-files -s`, with the blob the index holds. */
interface TrackedFile {
  readonly filePath: string;
  readonly blob: string;
  readonly stage: number;
}

/** A file's line count, null when it is not text, or null when it cannot be read. */
type FileCount = { readonly lines: number | null } | null;

/** A symlink or submodule mode; neither is a file the counts read. */
const NOT_FILES = new Set(['120000', '160000']);

/** The line count of UTF-8 content, or null when it holds a NUL byte. */
function textLines(content: string): number | null {
  return content.includes('\u0000') ? null : content.split('\n').length;
}

/** Read one path, giving its line count, null for non-text, or null when unreadable. */
async function countFile(filePath: string): Promise<FileCount> {
  const content = await fs.readFile(filePath, 'utf8').catch(() => null);
  return content === null ? null : { lines: textLines(content) };
}

/** Add a read file's counts to the running totals; unreadable and binary files add nothing. */
function addCount(counts: { files: number; lines: number }, count: FileCount): void {
  if (count === null || count.lines === null) return;
  counts.files += 1;
  counts.lines += count.lines;
}

/** Split `git ls-files -s -z` output into the tracked files, dropping symlinks and submodules. */
function parseTracked(stdout: string): TrackedFile[] {
  const tracked: TrackedFile[] = [];
  for (const record of stdout.split('\u0000')) {
    if (record === '') continue;
    const tab = record.indexOf('\t');
    if (tab < 0) continue;
    const [mode, blob, stage] = record.slice(0, tab).split(' ');
    if (mode === undefined || blob === undefined || stage === undefined) continue;
    if (NOT_FILES.has(mode)) continue;
    tracked.push({
      filePath: record.slice(tab + 1),
      blob,
      stage: Number.parseInt(stage, 10),
    });
  }
  return tracked;
}

/** Keep one entry per path, using a non-zero stage when any entry has one. */
function uniqueTracked(tracked: readonly TrackedFile[]): TrackedFile[] {
  const byPath = new Map<string, TrackedFile>();
  for (const entry of tracked) {
    const existing = byPath.get(entry.filePath);
    if (existing === undefined) byPath.set(entry.filePath, entry);
    else if (entry.stage !== 0) byPath.set(entry.filePath, { ...existing, stage: entry.stage });
  }
  return [...byPath.values()];
}

/** The paths `git ls-files -m -z` lists, which no index blob describes. */
function parseModified(stdout: string): Set<string> {
  return new Set(stdout.split('\u0000').filter((entry) => entry !== ''));
}

/** Walk the folder, counting text files and skipping ignored directories. */
async function walkRepoCounts(projectRoot: string): Promise<RepoCounts> {
  const counts = { files: 0, lines: 0 };
  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as Dirent[]);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      addCount(counts, await countFile(fullPath));
    }
  };
  await walk(projectRoot);
  return counts;
}

/**
 * Total the files git tracks in `projectRoot` and their lines. Tracked blobs
 * the read index has already stored are not read; changed files and blobs the
 * index has not seen are read once and stored. No git repository, or a failed
 * git read, falls back to walking the folder outside `IGNORED_DIRS`.
 *
 * @scenario watcher-and-harness: Large ignored build folder
 * @scenario watcher-and-harness: Warm repository counts
 * @scenario watcher-and-harness: Changed tracked file
 * @scenario watcher-and-harness: Deleted read index
 * @scenario watcher-and-harness: Read index that cannot open
 * @scenario watcher-and-harness: Folder with no git
 * @adr 008
 * @adr 017
 */
export async function gatherRepoCounts(
  projectRoot: string,
  gitSeconds = DEFAULT_GIT_SECONDS,
): Promise<RepoCounts> {
  const [listed, modifiedResult] = await Promise.all([
    runGit('git', ['ls-files', '-s', '-z'], projectRoot, gitSeconds),
    runGit('git', ['ls-files', '-m', '-z'], projectRoot, gitSeconds),
  ]);
  if (listed.code !== 0 || modifiedResult.code !== 0) return walkRepoCounts(projectRoot);

  const modified = parseModified(modifiedResult.stdout);
  const index = await openBlobLineIndex(projectRoot);
  const counts = { files: 0, lines: 0 };
  const readBlobs = new Map<string, number | null>();
  for (const entry of uniqueTracked(parseTracked(listed.stdout))) {
    const filePath = path.join(projectRoot, entry.filePath);
    if (index === null || modified.has(entry.filePath) || entry.stage !== 0) {
      addCount(counts, await countFile(filePath));
      continue;
    }
    let lines = index.lookup(entry.blob);
    if (lines === undefined) {
      if (!readBlobs.has(entry.blob)) {
        const count = await countFile(filePath);
        if (count === null) continue;
        readBlobs.set(entry.blob, count.lines);
      }
      lines = readBlobs.get(entry.blob) ?? null;
    }
    if (lines !== null) {
      counts.files += 1;
      counts.lines += lines;
    }
  }
  if (index !== null) {
    index.store([...readBlobs].map(([blob, lines]) => ({ blob, lines })));
    index.close();
  }
  return counts;
}
