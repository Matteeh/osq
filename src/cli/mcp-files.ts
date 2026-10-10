/**
 * MCP file tools: list, read, write, edit and delete files inside one
 * unapproved change folder, in the project or in a planner's server working
 * copy. Each tool refuses any path outside that folder.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../core/foundation/config.js';
import { findChange, matchesFolder } from '../core/status/change-locations.js';
import { readChangeFiles } from '../core/web/web-remote-files.js';
import type { McpToolResult } from './mcp-protocol.js';

/** Where a file tool works: the project, or a server working copy root. */
export type McpFolderSource =
  | { readonly kind: 'local'; readonly cwd: string }
  | { readonly kind: 'remote'; readonly workRoot: string };

/** The change folder a tool resolved, or the refusal text it returns. */
type FolderLookup =
  | { readonly ok: true; readonly folderPath: string }
  | { readonly ok: false; readonly error: string };

/** A required string argument, or the failure result when it is missing. */
type StringArg =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly result: McpToolResult };

/** A resolved string, or the failure result to return. */
type Outcome =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly result: McpToolResult };

function ok(text: string): McpToolResult {
  return { text, isError: false };
}

function fail(text: string): McpToolResult {
  return { text: `${text}\n`, isError: true };
}

function stringArg(args: Record<string, unknown>, name: string): StringArg {
  const value = args[name];
  if (typeof value !== 'string') return { ok: false, result: fail(`${name} must be a string`) };
  return { ok: true, value };
}

function isSafePath(value: string): boolean {
  if (value.length === 0 || value.includes('\\') || value.includes('\0')) return false;
  if (value.startsWith('/') || path.isAbsolute(value)) return false;
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return false;
  }
  return segments[0] !== '.run';
}

/** The change folder for a source, or the refusal text the tool returns. */
async function resolveFolder(source: McpFolderSource, change: string): Promise<FolderLookup> {
  if (source.kind === 'local') {
    const config = await loadConfig(source.cwd);
    const resolved = await readChangeFiles(source.cwd, config, change);
    if (!resolved.ok) return { ok: false, error: resolved.failure.error };
    const located = await findChange(source.cwd, config, change);
    return { ok: true, folderPath: located.folderPath };
  }
  const entries = await fs.readdir(source.workRoot, { withFileTypes: true }).catch(() => []);
  const folder = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .find((name) => matchesFolder(name, change));
  if (folder === undefined) {
    return { ok: false, error: `no working copy of change ${change}; run the plan tool first` };
  }
  return { ok: true, folderPath: path.join(source.workRoot, folder) };
}

/** Whether the deepest part of `rel` that exists stays inside the folder. */
async function staysInside(folderPath: string, rel: string): Promise<boolean> {
  const folderReal = await fs.realpath(folderPath).catch(() => folderPath);
  let current = folderPath;
  let deepestReal = folderReal;
  for (const segment of rel.split('/')) {
    current = path.join(current, segment);
    const real = await fs.realpath(current).catch(() => null);
    if (real === null) break;
    deepestReal = real;
  }
  return deepestReal === folderReal || deepestReal.startsWith(`${folderReal}${path.sep}`);
}

async function listPaths(dir: string, prefix: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const paths: string[] = [];
  for (const entry of entries) {
    if (prefix.length === 0 && entry.name === '.run') continue;
    const rel = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) paths.push(...(await listPaths(full, rel)));
    else if (entry.isFile()) paths.push(rel);
  }
  return paths;
}

/** Read one existing file, or the `file not found` failure result. */
async function readExisting(target: string, rel: string): Promise<Outcome> {
  try {
    return { ok: true, value: await fs.readFile(target, 'utf8') };
  } catch (cause) {
    if ((cause as { readonly code?: unknown }).code === 'ENOENT') {
      return { ok: false, result: fail(`file not found: ${rel}`) };
    }
    throw cause;
  }
}

/** Resolve the change folder and a safe file path inside it for one call. */
async function target(source: McpFolderSource, change: string, rel: string): Promise<Outcome> {
  const folder = await resolveFolder(source, change);
  if (!folder.ok) return { ok: false, result: fail(folder.error) };
  if (!isSafePath(rel) || !(await staysInside(folder.folderPath, rel))) {
    return { ok: false, result: fail(`path outside the change folder: ${rel}`) };
  }
  return { ok: true, value: path.join(folder.folderPath, ...rel.split('/')) };
}

/**
 * List every file in a change folder, one `/`-separated path per line, sorted,
 * hiding `.run/`.
 * @scenario cli-foundation: Files round trip
 * @adr 014
 */
export async function listFiles(
  source: McpFolderSource,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const change = stringArg(args, 'change');
  if (!change.ok) return change.result;
  const folder = await resolveFolder(source, change.value);
  if (!folder.ok) return fail(folder.error);
  return ok((await listPaths(folder.folderPath, '')).sort().join('\n'));
}

/**
 * Read one file in a change folder, its text unchanged.
 * @scenario cli-foundation: Files round trip
 * @adr 014
 */
export async function readFile(
  source: McpFolderSource,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const change = stringArg(args, 'change');
  if (!change.ok) return change.result;
  const rel = stringArg(args, 'path');
  if (!rel.ok) return rel.result;
  const resolved = await target(source, change.value, rel.value);
  if (!resolved.ok) return resolved.result;
  const file = await readExisting(resolved.value, rel.value);
  if (!file.ok) return file.result;
  return ok(file.value);
}

/**
 * Write one file in a change folder, creating missing folders and writing
 * UTF-8, and report the bytes written.
 * @scenario cli-foundation: Paths outside the change folder refused
 * @scenario cli-foundation: Approved change refused
 * @scenario cli-foundation: Files round trip
 * @adr 014
 */
export async function writeFile(
  source: McpFolderSource,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const change = stringArg(args, 'change');
  if (!change.ok) return change.result;
  const rel = stringArg(args, 'path');
  if (!rel.ok) return rel.result;
  const text = stringArg(args, 'text');
  if (!text.ok) return text.result;
  const resolved = await target(source, change.value, rel.value);
  if (!resolved.ok) return resolved.result;
  await fs.mkdir(path.dirname(resolved.value), { recursive: true });
  await fs.writeFile(resolved.value, text.value, 'utf8');
  return ok(`wrote ${rel.value} (${Buffer.byteLength(text.value, 'utf8')} bytes)`);
}

/**
 * Replace `old_text` with `new_text` in one file, when `old_text` occurs
 * exactly once, and change nothing otherwise.
 * @scenario cli-foundation: Edits
 * @adr 014
 */
export async function editFile(
  source: McpFolderSource,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const change = stringArg(args, 'change');
  if (!change.ok) return change.result;
  const rel = stringArg(args, 'path');
  if (!rel.ok) return rel.result;
  const oldText = stringArg(args, 'old_text');
  if (!oldText.ok) return oldText.result;
  const newText = stringArg(args, 'new_text');
  if (!newText.ok) return newText.result;
  const resolved = await target(source, change.value, rel.value);
  if (!resolved.ok) return resolved.result;
  const file = await readExisting(resolved.value, rel.value);
  if (!file.ok) return file.result;
  const count = file.value.split(oldText.value).length - 1;
  if (count === 0) return fail(`old_text not found in ${rel.value}`);
  if (count > 1) return fail(`old_text occurs ${count} times in ${rel.value}`);
  const updated = file.value.replace(oldText.value, () => newText.value);
  await fs.writeFile(resolved.value, updated, 'utf8');
  return ok(`edited ${rel.value}`);
}

/**
 * Remove one file from a change folder.
 * @scenario cli-foundation: Files round trip
 * @adr 014
 */
export async function deleteFile(
  source: McpFolderSource,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const change = stringArg(args, 'change');
  if (!change.ok) return change.result;
  const rel = stringArg(args, 'path');
  if (!rel.ok) return rel.result;
  const resolved = await target(source, change.value, rel.value);
  if (!resolved.ok) return resolved.result;
  try {
    await fs.unlink(resolved.value);
  } catch (cause) {
    if ((cause as { readonly code?: unknown }).code === 'ENOENT') {
      return fail(`file not found: ${rel.value}`);
    }
    throw cause;
  }
  return ok(`deleted ${rel.value}`);
}
