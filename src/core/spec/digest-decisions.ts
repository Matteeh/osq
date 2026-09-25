import type { OsqConfig } from '../foundation/config.js';
import { type Adr, governingAdrs, readDecisions } from '../foundation/decisions.js';
import type { ApprovalFlag } from './digest.js';

/** One task projection the check flag rule needs. */
export interface DigestDecisionTask {
  readonly number: string;
  readonly testsModify: boolean;
  readonly paths: readonly string[];
}

/** One accepted ADR that governs the change, as the digest lists it. */
export interface DigestDecision {
  readonly number: string;
  readonly rule: string;
}

/** The digest's governing decisions and the departure flags they raise. */
export interface DigestDecisions {
  readonly decisions: readonly DigestDecision[];
  readonly flags: readonly ApprovalFlag[];
}

/** An optional leading `- ` list marker on a Decisions line. */
const LIST_MARKER = /^\s*-\s+/;

/** A departure line: the marker removed, then `Departs from ADR <n>:`. */
const DEPARTURE = /^Departs from ADR\s+(\d+):/;

/** The Decisions lines that begin a departure, without their list marker. */
function departureLines(section: string): string[] {
  const departures: string[] = [];
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const withoutMarker = trimmed.replace(LIST_MARKER, '');
    if (DEPARTURE.test(withoutMarker)) departures.push(withoutMarker);
  }
  return departures;
}

/** One `adr_departure` flag per departure line, in section order. */
function departureFlags(section: string): ApprovalFlag[] {
  const flags: ApprovalFlag[] = [];
  for (const line of departureLines(section)) {
    const match = DEPARTURE.exec(line);
    if (match === null) continue;
    flags.push({
      id: 'adr_departure',
      label: `departs from ADR ${match[1]}`,
      excerpt: line,
    });
  }
  return flags;
}

function compareTaskNumbers(a: string, b: string): number {
  const numA = Number.parseInt(a, 10);
  const numB = Number.parseInt(b, 10);
  if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) return numA - numB;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * One `adr_check_modified` flag per task with `tests.modify: true` and per
 * accepted ADR whose check file the task's resolved scope paths include, in
 * task-number, ADR number, and check file order. Only accepted ADRs count.
 */
function checkFlags(adrs: readonly Adr[], tasks: readonly DigestDecisionTask[]): ApprovalFlag[] {
  const accepted = adrs.filter((adr) => adr.status === 'accepted');
  const ordered = [...tasks].sort((a, b) => compareTaskNumbers(a.number, b.number));
  const flags: ApprovalFlag[] = [];
  for (const task of ordered) {
    if (!task.testsModify) continue;
    const paths = new Set(task.paths);
    for (const adr of accepted) {
      for (const file of adr.checks) {
        if (!paths.has(file)) continue;
        flags.push({
          id: 'adr_check_modified',
          label: `task ${task.number} may modify a check of ADR ${adr.number}`,
          excerpt: `${file} enforces ADR ${adr.number}: ${adr.rule} Record it as Departs from ADR ${adr.number}: in ## Decisions.`,
        });
      }
    }
  }
  return flags;
}

/**
 * Reads the change's governing ADRs through `readDecisions` and
 * `governingAdrs`, in number order, and raises one `adr_departure` flag per
 * departure line in the proposal's `## Decisions` section, followed by one
 * `adr_check_modified` flag per task allowed to edit an accepted ADR's check.
 * A project without ADRs yields no decisions and no flag.
 */
export async function collectDigestDecisions(
  projectRoot: string,
  writtenCapabilities: readonly string[],
  decisionsSection: string,
  tasks: readonly DigestDecisionTask[],
  config: OsqConfig,
): Promise<DigestDecisions> {
  const records = await readDecisions(projectRoot, config);
  const decisions = governingAdrs(records, writtenCapabilities).map((adr) => ({
    number: adr.number,
    rule: adr.rule,
  }));
  return {
    decisions,
    flags: [...departureFlags(decisionsSection), ...checkFlags(records.adrs, tasks)],
  };
}
