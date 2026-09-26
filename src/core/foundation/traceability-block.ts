import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from './config.js';
import { OSQ_END_MARKER } from './init-blocks.js';

export const TRACEABILITY_START_MARKER = '<!-- OSQ:TRACEABILITY:START -->';
export const TRACEABILITY_END_MARKER = '<!-- OSQ:TRACEABILITY:END -->';

export type TraceabilityBlockFile = 'AGENTS.md' | 'PLANNER.md';

const TRACEABILITY_FILES: readonly TraceabilityBlockFile[] = ['AGENTS.md', 'PLANNER.md'];

/** `every capability` for `'all'`, the opted-in names joined by `, `, else null. */
export function traceabilityScope(config: OsqConfig): string | null {
  const capabilities = config.traceability?.capabilities ?? [];
  if (capabilities === 'all') return 'every capability';
  if (capabilities.length === 0) return null;
  return capabilities.join(', ');
}

function plannerBlock(scope: string): string {
  return `${TRACEABILITY_START_MARKER}
## Traceability

Traceability covers ${scope}.

- Under \`## Scenarios\` in each task, list the scenarios its tests prove as \`- <capability>: <scenario name>\`, and scope their test files.
- Give a scenario with more than one case a table of exact inputs and outputs directly under its THEN.
- Put every test that names a modified scenario in its task's scope with \`tests.modify: true\`; \`osq lint\` lists them.
- Have exported functions tagged with \`@scenario\` and \`@adr\`.
${TRACEABILITY_END_MARKER}`;
}

function agentsBlock(scope: string): string {
  return `${TRACEABILITY_START_MARKER}
## Traceability

For ${scope}:

- Prove each scenario with \`import { scenario } from '@matteeh/osq/testing'\` and \`scenario('<capability>', '<scenario name>', { covers: fn }, ({ run, then, each }) => ...)\`, with literal names. Call \`fn\` only through \`run\`.
- Take expected values from the scenario's THEN lines and tables, never from running the code.
- Check a table with \`each\`. Check a rule that holds for every input with a property test inside \`then\`.
- Tag each exported function you add or change in a doc comment directly above \`export function\` or \`export const <name> = (...) =>\`: one \`@scenario <capability>: <scenario name>\` line per scenario it serves and one \`@adr <number>\` line per decision it follows.
${TRACEABILITY_END_MARKER}`;
}

/** The canonical block for `file`, markers included, or null with none opted in. */
export function renderTraceabilityBlock(
  file: TraceabilityBlockFile,
  config: OsqConfig,
): string | null {
  const scope = traceabilityScope(config);
  if (scope === null) return null;
  return file === 'PLANNER.md' ? plannerBlock(scope) : agentsBlock(scope);
}

interface BlockRange {
  start: number;
  end: number;
}

function findTraceRange(content: string): BlockRange | null {
  const start = content.indexOf(TRACEABILITY_START_MARKER);
  if (start === -1) return null;
  const endMarker = content.indexOf(TRACEABILITY_END_MARKER, start);
  if (endMarker === -1) return null;
  return { start, end: endMarker + TRACEABILITY_END_MARKER.length };
}

/** Insert the block after the managed block's end line, or at the end of the file. */
function insertTraceabilityBlock(content: string, block: string): string {
  const end = content.indexOf(OSQ_END_MARKER);
  if (end !== -1) {
    const after = end + OSQ_END_MARKER.length;
    const rest = content.slice(after);
    const body = rest.startsWith('\n') ? rest.slice(1) : rest;
    return `${content.slice(0, after)}\n${block}\n${body}`;
  }
  const lead = content === '' || content.endsWith('\n') ? '' : '\n';
  return `${content}${lead}${block}\n`;
}

/** Undo {@link insertTraceabilityBlock}, dropping the newline it added. */
function removeTraceabilityBlock(content: string, range: BlockRange): string {
  const after = content.slice(range.end);
  const tail = after.startsWith('\n') ? after.slice(1) : after;
  return content.slice(0, range.start) + tail;
}

function applyTraceabilityBlock(content: string, block: string | null): string {
  const range = findTraceRange(content);
  if (block === null) return range === null ? content : removeTraceabilityBlock(content, range);
  if (range !== null && content.slice(range.start, range.end) === block) return content;
  const base = range === null ? content : removeTraceabilityBlock(content, range);
  return insertTraceabilityBlock(base, block);
}

/** Write, replace, or remove both blocks; true when either file changed. */
export async function writeTraceabilityBlocks(
  projectRoot: string,
  config: OsqConfig,
): Promise<boolean> {
  let changed = false;
  for (const file of TRACEABILITY_FILES) {
    const filePath = path.join(projectRoot, file);
    const existing = await fs.readFile(filePath, 'utf8').catch(() => null);
    const block = renderTraceabilityBlock(file, config);
    if (existing === null && block === null) continue;
    const content = existing ?? '';
    const next = applyTraceabilityBlock(content, block);
    if (next === content) continue;
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.writeFile(filePath, next, 'utf8');
    changed = true;
  }
  return changed;
}

/** Errors for a stale, missing, or unexpected block in either managed file. */
export async function checkTraceabilityBlocks(
  projectRoot: string,
  config: OsqConfig,
): Promise<string[]> {
  const errors: string[] = [];
  for (const file of TRACEABILITY_FILES) {
    const expected = renderTraceabilityBlock(file, config);
    const content = await fs.readFile(path.join(projectRoot, file), 'utf8').catch(() => '');
    const range = findTraceRange(content);
    const current = range === null ? null : content.slice(range.start, range.end);
    if (current === expected) continue;
    if (current === null) {
      errors.push(`${file} traceability block is missing; run \`osq init\``);
    } else if (expected === null) {
      errors.push(`${file} has an unexpected traceability block; run \`osq init\``);
    } else {
      errors.push(`${file} traceability block is out of date; run \`osq init\``);
    }
  }
  return errors;
}
