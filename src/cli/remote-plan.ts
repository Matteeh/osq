import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { matchesFolder } from '../core/status/change-locations.js';
import type { ForwardedCommand, ForwardedEnd } from '../core/web/web-remote.js';
import { CommandError } from './command-error.js';
import type { Writer } from './command-inputs.js';
import {
  type RemoteServer,
  readFromServer,
  runOnServer,
  writeToServer,
} from './remote-transport.js';

/** The writers and home a client-side plan or lint reads. */
export interface RemotePlanOutputs {
  readonly stdout: Writer;
  readonly stderr: Writer;
  readonly home?: string;
}

/** The server plan handoff line: the marker before the folder, and before the next step. */
const HANDOFF_MARKER = ': ask your planning tool to plan change ';
const HANDOFF_NEXT = ' \u2014 next: ';

/** The failure of a nonzero last line, as `runCli` prints a local failure. */
function failed(end: ForwardedEnd): CommandError {
  return new CommandError(end.error ?? '', {
    exitCode: end.exitCode,
    ...(end.next === null ? {} : { next: end.next }),
  });
}

/**
 * The root working copies live under: `<home>/.osq/remote/<host>/<project>`,
 * with every `:` in the host replaced by `-`.
 * @scenario cli-foundation: Plan downloads a working copy
 * @adr 014
 */
export function remoteWorkRoot(server: RemoteServer, home: string = os.homedir()): string {
  return path.join(home, '.osq', 'remote', server.host.replaceAll(':', '-'), server.project);
}

/** The folder name and next step of a server plan handoff line, or null. */
function parseHandoff(line: string): { folder: string; next: string } | null {
  const marker = line.indexOf(HANDOFF_MARKER);
  if (marker < 0) return null;
  const rest = line.slice(marker + HANDOFF_MARKER.length);
  const nextAt = rest.indexOf(HANDOFF_NEXT);
  if (nextAt <= 0) return null;
  return { folder: rest.slice(0, nextAt), next: rest.slice(nextAt + HANDOFF_NEXT.length) };
}

/** Download one change folder's text files from the server. */
async function downloadFolder(
  server: RemoteServer,
  folder: string,
): Promise<Record<string, string>> {
  const body = (await readFromServer(server, `api/files/${encodeURIComponent(folder)}`)) as {
    files?: Record<string, string>;
  };
  return body.files ?? {};
}

/** Replace a working copy with exactly the downloaded files. */
async function replaceWorkCopy(folderPath: string, files: Record<string, string>): Promise<void> {
  await fs.rm(folderPath, { recursive: true, force: true });
  for (const [rel, text] of Object.entries(files)) {
    const target = path.join(folderPath, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text, 'utf8');
  }
}

/** Rewrite a server handoff line to name the working copy, downloading its folder. */
async function rewriteHandoff(
  line: string,
  server: RemoteServer,
  workRoot: string,
): Promise<string> {
  const handoff = parseHandoff(line);
  if (handoff === null) return line;
  const folderPath = path.join(workRoot, handoff.folder);
  await replaceWorkCopy(folderPath, await downloadFolder(server, handoff.folder));
  return `${folderPath}${HANDOFF_MARKER}${handoff.folder}${HANDOFF_NEXT}${handoff.next}`;
}

/** Print each collected line, rewriting a handoff line as it downloads its folder. */
async function emitHandoff(
  text: string,
  server: RemoteServer,
  workRoot: string,
  stdout: Writer,
): Promise<void> {
  const rewritten: string[] = [];
  for (const line of text.split('\n')) {
    rewritten.push(await rewriteHandoff(line, server, workRoot));
  }
  stdout(rewritten.join('\n'));
}

/**
 * Run a forwarded plan, collecting its stdout. On success, download the change
 * folder to its working copy and rewrite the handoff line's path; with `--print`
 * pass the server's output through unchanged.
 * @scenario cli-foundation: Plan downloads a working copy
 * @adr 014
 */
export async function planOnServer(
  server: RemoteServer,
  request: ForwardedCommand,
  outputs: RemotePlanOutputs,
): Promise<void> {
  const home = outputs.home ?? os.homedir();
  const collected: string[] = [];
  const print = request.options.print === true;
  const stdout = print ? outputs.stdout : (text: string) => collected.push(text);
  const end = await runOnServer(server, request, stdout, outputs.stderr);
  if (!print) {
    const text = collected.join('');
    if (end.exitCode === 0) {
      await emitHandoff(text, server, remoteWorkRoot(server, home), outputs.stdout);
    } else {
      outputs.stdout(text);
    }
  }
  if (end.exitCode !== 0) throw failed(end);
}

/** The names of the working copies under `workRoot`, sorted. */
async function workingCopies(workRoot: string): Promise<string[]> {
  const entries = await fs.readdir(workRoot, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Every text file under a working copy except those under `.run/`, path-sorted. */
async function readWorkCopy(folderPath: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const walk = async (dir: string, prefix: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (prefix === '' && entry.name === '.run') continue;
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, rel);
      else if (entry.isFile()) files[rel] = await fs.readFile(full, 'utf8');
    }
  };
  await walk(folderPath, '');
  return files;
}

/** Upload one working copy to the server. */
async function uploadWorkCopy(
  server: RemoteServer,
  workRoot: string,
  folder: string,
): Promise<void> {
  const files = await readWorkCopy(path.join(workRoot, folder));
  await writeToServer(server, `api/files/${encodeURIComponent(folder)}`, 'PUT', { files });
}

/**
 * Upload the working copy every named id resolves to, then forward `lint`. A
 * refused upload ends the command with the transport's error before any lint.
 * @scenario cli-foundation: Lint uploads the working copy
 * @scenario cli-foundation: Refused upload stops lint
 * @adr 014
 */
export async function lintOnServer(
  server: RemoteServer,
  request: ForwardedCommand,
  outputs: RemotePlanOutputs,
): Promise<void> {
  const home = outputs.home ?? os.homedir();
  const workRoot = remoteWorkRoot(server, home);
  const folders = await workingCopies(workRoot);
  for (const id of request.args) {
    if (typeof id !== 'string') continue;
    const folder = folders.find((name) => matchesFolder(name, id));
    if (folder !== undefined) await uploadWorkCopy(server, workRoot, folder);
  }
  const end = await runOnServer(server, request, outputs.stdout, outputs.stderr);
  if (end.exitCode !== 0) throw failed(end);
}
