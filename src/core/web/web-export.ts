import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { type MetricsReport, getMetricsReport } from '../report/report.js';
import { readInbox } from '../status/inbox-projection.js';
import type { Inbox } from '../status/inbox.js';
import { getWebChange } from './web-data-change.js';
import { type WebChange, type WebGraph, getWebGraph } from './web-data.js';
import { serializeWebJson } from './web-server.js';
import { resolveUiDir } from './web-static.js';

/**
 * Static dashboard snapshot. It writes the built UI beside a `data.js` that
 * assigns `window.__OSQ_DATA__` and an `index.html` that loads it first. Every
 * inlined string has the project root and home directory scrubbed; a non-empty
 * target is refused before any write.
 */

/** The exact documents the browser reads from the typed global. */
interface InlineDashboardData {
  readonly report: MetricsReport;
  readonly graph: WebGraph;
  readonly inbox: Inbox;
  readonly changes: Record<string, WebChange>;
}

export interface ExportDashboardOptions {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly targetDir: string;
  /** Built UI directory; defaults to the package-root staged `ui/dist`. */
  readonly uiDir?: string;
  /** Home directory scrubbed to `~`; defaults to `os.homedir()`. */
  readonly home?: string;
  /** Derivation clock; defaults to the current time. */
  readonly now?: Date;
}

const DATA_SCRIPT = '<script src="./data.js"></script>';
const DATA_FILE = 'data.js';
const INDEX_FILE = 'index.html';

type Replacement = readonly [string, string];

/** Replace every occurrence of each source string in every nested string value. */
function scrubStrings(value: unknown, replacements: readonly Replacement[]): unknown {
  if (typeof value === 'string') {
    let result = value;
    for (const [from, to] of replacements) result = result.split(from).join(to);
    return result;
  }
  if (Array.isArray(value)) return value.map((item) => scrubStrings(item, replacements));
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = scrubStrings(item, replacements);
    }
    return result;
  }
  return value;
}

/** The folder key plus the padded numeric id prefix for one change node. */
function changeKeys(folderKey: string): string[] {
  const prefix = /^(\d+)/.exec(folderKey)?.[1];
  return prefix === undefined ? [folderKey] : [folderKey, prefix.padStart(3, '0')];
}

/** Compose every route document from the current project tree. */
async function buildInlineData(
  projectRoot: string,
  config: OsqConfig,
  now: Date,
  home: string,
): Promise<InlineDashboardData> {
  const graph = await getWebGraph(projectRoot, config);
  const report = await getMetricsReport(projectRoot, config);
  const inbox = await readInbox(projectRoot, { config, now, home });
  const changes: Record<string, WebChange> = {};
  for (const node of graph.changes) {
    const change = await getWebChange(projectRoot, node.folderKey, config, now);
    for (const key of changeKeys(node.folderKey)) changes[key] = change;
  }
  return { report, graph, inbox, changes };
}

/** `true` when `target` is missing, or an existing empty directory. */
async function targetIsWritable(target: string): Promise<boolean> {
  const stat = await fs.lstat(target).catch(() => null);
  if (stat === null) return true;
  if (!stat.isDirectory()) return false;
  return (await fs.readdir(target)).length === 0;
}

/** Copy each top-level entry of `uiDir` into the existing empty `target`. */
async function copyUi(uiDir: string, target: string): Promise<void> {
  const entries = await fs.readdir(uiDir, { withFileTypes: true });
  for (const entry of entries) {
    await fs.cp(path.join(uiDir, entry.name), path.join(target, entry.name), { recursive: true });
  }
}

/** Insert the data script immediately before the copied index's first script. */
async function injectDataScript(indexPath: string): Promise<void> {
  const html = await fs.readFile(indexPath, 'utf8');
  const at = html.indexOf('<script');
  if (at < 0) throw new Error(`exported dashboard index has no script tag: ${indexPath}`);
  await fs.writeFile(indexPath, `${html.slice(0, at)}${DATA_SCRIPT}${html.slice(at)}`, 'utf8');
}

/** Every regular file below `root`, absolute and sorted. */
async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

/**
 * Write a self-contained snapshot of every dashboard view into `targetDir`.
 * A non-empty target is refused before any write. Returns the written files.
 */
export async function exportDashboard(options: ExportDashboardOptions): Promise<string[]> {
  const target = path.resolve(options.targetDir);
  const uiDir = options.uiDir ?? resolveUiDir();
  const home = options.home ?? os.homedir();
  const now = options.now ?? new Date();

  if (!(await targetIsWritable(target))) {
    throw new Error(`dashboard export target must be an empty directory: ${target}`);
  }

  const data = await buildInlineData(options.projectRoot, options.config, now, home);
  const replacements: Replacement[] = [];
  if (options.projectRoot) replacements.push([options.projectRoot, '.']);
  if (home) replacements.push([home, '~']);

  await fs.mkdir(target, { recursive: true });
  await copyUi(uiDir, target);
  await injectDataScript(path.join(target, INDEX_FILE));
  const serialized = serializeWebJson(scrubStrings(data, replacements));
  await fs.writeFile(path.join(target, DATA_FILE), `window.__OSQ_DATA__ = ${serialized};`, 'utf8');

  return listFiles(target);
}
