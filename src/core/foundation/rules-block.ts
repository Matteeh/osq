import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from './config.js';
import { type DecisionRecords, readDecisions, systemWideAdrs } from './decisions.js';

export const RULES_START_MARKER = '<!-- OSQ:RULES:START -->';
export const RULES_END_MARKER = '<!-- OSQ:RULES:END -->';

/** The managed block the rules block always sits directly before. */
const MANAGED_START_MARKER = '<!-- OSQ:START -->';

/** The canonical block for these records, or null with no system-wide ADR. */
export function renderRulesBlock(records: DecisionRecords): string | null {
  const rules = systemWideAdrs(records);
  if (rules.length === 0) return null;
  const lines = rules.map((adr) => `- ${adr.rule} ADR ${adr.number}`);
  return `${RULES_START_MARKER}\n## Project rules\n\n${lines.join('\n')}\n${RULES_END_MARKER}`;
}

interface RulesRange {
  start: number;
  end: number;
}

/** The first ordered rules marker pair in `content`, or null. */
function findRulesRange(content: string): RulesRange | null {
  const start = content.indexOf(RULES_START_MARKER);
  const end = content.indexOf(RULES_END_MARKER);
  if (start === -1 || end < start) return null;
  return { start, end: end + RULES_END_MARKER.length };
}

/** Delete one block range and the one blank line that followed it. */
function removeRulesBlock(content: string, range: RulesRange): string {
  const after = content.slice(range.end);
  const tail = after.startsWith('\n\n') ? 2 : after.startsWith('\n') ? 1 : 0;
  return content.slice(0, range.start) + after.slice(tail);
}

/** Insert the block directly before the managed block, or append at the end. */
function insertRulesBlock(content: string, block: string): string {
  const index = content.indexOf(MANAGED_START_MARKER);
  if (index !== -1) return `${content.slice(0, index)}${block}\n\n${content.slice(index)}`;
  const separator =
    content === '' || content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n';
  return `${content}${separator}${block}\n`;
}

/** Replace, insert, or remove the canonical block in `content`. */
function applyRulesBlock(content: string, block: string | null): string {
  const range = findRulesRange(content);
  if (block === null) return range === null ? content : removeRulesBlock(content, range);
  if (range !== null && content.slice(range.start, range.end) === block) return content;
  return insertRulesBlock(range === null ? content : removeRulesBlock(content, range), block);
}

/** Write, replace, or remove the block in AGENTS.md; true when the file changed. */
export async function writeRulesBlock(projectRoot: string, config: OsqConfig): Promise<boolean> {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  const [records, existing] = await Promise.all([
    readDecisions(projectRoot, config),
    fs.readFile(agentsPath, 'utf8').catch(() => null),
  ]);
  const block = renderRulesBlock(records);
  if (existing === null && block === null) return false;
  const content = existing ?? '';
  const next = applyRulesBlock(content, block);
  if (existing !== null && next === content) return false;
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(agentsPath, next, 'utf8');
  return true;
}

/** Error messages for a stale, missing, or unexpected block, and for too many rules. */
export async function checkProjectRules(projectRoot: string, config: OsqConfig): Promise<string[]> {
  const records = await readDecisions(projectRoot, config);
  const expected = renderRulesBlock(records);
  const agents = await fs.readFile(path.join(projectRoot, 'AGENTS.md'), 'utf8').catch(() => '');
  const range = findRulesRange(agents);
  const current = range === null ? null : agents.slice(range.start, range.end);

  const errors: string[] = [];
  if (current !== expected) {
    if (current === null) {
      errors.push('AGENTS.md is missing its project rules block; run `osq init`');
    } else if (expected === null) {
      errors.push('AGENTS.md has an unexpected project rules block; run `osq init`');
    } else {
      errors.push('AGENTS.md project rules block is out of date; run `osq init`');
    }
  }

  const count = systemWideAdrs(records).length;
  if (count > config.limits.maxProjectRules) {
    errors.push(
      `AGENTS.md holds ${count} project rules, more than limits.maxProjectRules (${config.limits.maxProjectRules})`,
    );
  }
  return errors;
}
