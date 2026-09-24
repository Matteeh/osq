/**
 * OpenSpec validator issue attribution.
 *
 * `openspec validate --json` reports `items`, each with an `id`, a `type`
 * (`change` or `spec`), and a list of `issues`. This module maps every issue to
 * a lint finding: the file it concerns, the requirement or section within it,
 * and whether it belongs to the linted change or to the rest of the repository.
 * Output that names no `items` returns `null` so the caller can fall back to the
 * legacy tolerant parser and charge the result to the linted change.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCapabilitySpec } from './delta.js';
import { type LintFinding, makeFinding, openSpecSeverity } from './lint-findings.js';

/** Prefix applied to every finding surfaced by the OpenSpec validator. */
export const OPENSPEC_ERROR_PREFIX = 'openspec:';

/** The hint an OpenSpec message carries when it suggests skipping specs. */
const SKIP_SPECS_HINT = 'skip_specs';

/** The osq note appended to advice osq deliberately does not honor. */
export const UNSUPPORTED_SKIP_SPECS_NOTE =
  ' [unsupported by osq: osq does not honor skip_specs; add a delta spec under specs/<capability>/spec.md]';

/** Run an external command, capturing stdout/stderr and the exit code. */
export function execFileCapture(
  bin: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeout: number },
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(bin, args, options, (error, stdout, stderr) => {
      const code = error
        ? typeof (error as { code?: unknown }).code === 'number'
          ? ((error as { code: number }).code as number)
          : 1
        : 0;
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code });
    });
  });
}

function parseJson(output: string): unknown | null {
  const trimmed = output.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export interface OpenSpecIssueRecord {
  readonly level: string;
  readonly path: string | null;
  readonly message: string;
}

export interface OpenSpecItemRecord {
  readonly id: string;
  readonly type: string;
  readonly issues: readonly OpenSpecIssueRecord[];
}

/**
 * Reads the `items` array from OpenSpec JSON output. Returns `null` when the
 * output has no `items` so callers can fall back to the legacy parser.
 */
export function parseOpenSpecItems(output: string): OpenSpecItemRecord[] | null {
  const parsed = parseJson(output);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const items = (parsed as Record<string, unknown>).items;
  if (!Array.isArray(items)) {
    return null;
  }

  const records: OpenSpecItemRecord[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const item = raw as Record<string, unknown>;
    records.push({
      id: stringField(item.id) ?? '',
      type: stringField(item.type) ?? 'change',
      issues: readIssues(item.issues),
    });
  }
  return records;
}

function readIssues(raw: unknown): OpenSpecIssueRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const issues: OpenSpecIssueRecord[] = [];
  for (const value of raw) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const issue = value as Record<string, unknown>;
    const message = stringField(issue.message);
    if (!message) {
      continue;
    }
    issues.push({
      level: stringField(issue.level) ?? 'ERROR',
      path: stringField(issue.path),
      message,
    });
  }
  return issues;
}

export function appendUnsupportedNote(message: string): string {
  return message.includes(SKIP_SPECS_HINT) ? `${message}${UNSUPPORTED_SKIP_SPECS_NOTE}` : message;
}

export interface OpenSpecIssueContext {
  readonly projectRoot: string;
  readonly openspecRoot: string;
  /** The linted change folder name; `null` charges every issue to the change. */
  readonly changeFolder: string | null;
}

export interface OpenSpecIssueScan {
  readonly findings: LintFinding[];
  readonly repository: LintFinding[];
}

const CHANGE_REQUIREMENT_REGEX = /^(?:ADDED|MODIFIED|REMOVED|RENAMED)\s+"([^"]+)"/;
const REQUIREMENT_INDEX_REGEX = /^requirements\[(\d+)\]$/;

function specFile(context: OpenSpecIssueContext, capability: string): string {
  return `${context.openspecRoot}/specs/${capability}/spec.md`;
}

function changeFile(
  context: OpenSpecIssueContext,
  changeId: string,
  issuePath: string | null,
): string {
  const base = `${context.openspecRoot}/changes/${changeId}`;
  return issuePath?.endsWith('.md') ? `${base}/specs/${issuePath}` : `${base}/proposal.md`;
}

async function livingRequirementName(
  context: OpenSpecIssueContext,
  capability: string,
  index: number,
  cache: Map<string, readonly string[]>,
): Promise<string | null> {
  let names = cache.get(capability);
  if (names === undefined) {
    const file = path.join(context.projectRoot, specFile(context, capability));
    const content = await fs.readFile(file, 'utf8').catch(() => null);
    names = content === null ? [] : parseCapabilitySpec(content).requirements.map((r) => r.name);
    cache.set(capability, names);
  }
  return names[index] ?? null;
}

async function requirementFromPath(
  context: OpenSpecIssueContext,
  capability: string,
  issuePath: string | null,
  cache: Map<string, readonly string[]>,
): Promise<string | null> {
  const match = issuePath === null ? null : REQUIREMENT_INDEX_REGEX.exec(issuePath);
  return match
    ? livingRequirementName(context, capability, Number.parseInt(match[1], 10), cache)
    : null;
}

async function itemFinding(
  item: OpenSpecItemRecord,
  issue: OpenSpecIssueRecord,
  context: OpenSpecIssueContext,
  cache: Map<string, readonly string[]>,
): Promise<LintFinding> {
  const message = `${OPENSPEC_ERROR_PREFIX} ${appendUnsupportedNote(issue.message)}`;
  const severity = openSpecSeverity(issue.level);

  if (item.type === 'spec') {
    const section = issue.path === 'overview' ? 'Purpose' : null;
    const requirement = await requirementFromPath(context, item.id, issue.path, cache);
    return makeFinding(
      severity,
      { file: specFile(context, item.id), requirement, section },
      message,
    );
  }

  const requirement = issue.message.match(CHANGE_REQUIREMENT_REGEX)?.[1] ?? null;
  return makeFinding(
    severity,
    { file: changeFile(context, item.id, issue.path), requirement },
    message,
  );
}

function isOwnIssue(item: OpenSpecItemRecord, context: OpenSpecIssueContext): boolean {
  if (context.changeFolder === null) {
    return true;
  }
  return item.type !== 'spec' && item.id === context.changeFolder;
}

/**
 * Map every OpenSpec issue in one command's output to a lint finding, marking
 * issues about the linted change as its own and the rest as repository findings.
 * Returns `null` when the output names no items.
 */
export async function scanOpenSpecIssues(
  output: string,
  context: OpenSpecIssueContext,
): Promise<OpenSpecIssueScan | null> {
  const items = parseOpenSpecItems(output);
  if (items === null) {
    return null;
  }

  const findings: LintFinding[] = [];
  const repository: LintFinding[] = [];
  const cache = new Map<string, readonly string[]>();
  for (const item of items) {
    const own = isOwnIssue(item, context);
    for (const issue of item.issues) {
      const finding = await itemFinding(item, issue, context, cache);
      (own ? findings : repository).push(finding);
    }
  }
  return { findings, repository };
}
