import type { OsqConfig } from '../foundation/config.js';
import { governingAdrs, readDecisions } from '../foundation/decisions.js';
import type { ApprovalFlag } from './digest.js';

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

/**
 * Reads the change's governing ADRs through `readDecisions` and
 * `governingAdrs`, in number order, and raises one `adr_departure` flag per
 * departure line in the proposal's `## Decisions` section. A project without
 * ADRs yields no decisions and no departure flag.
 */
export async function collectDigestDecisions(
  projectRoot: string,
  writtenCapabilities: readonly string[],
  decisionsSection: string,
  config: OsqConfig,
): Promise<DigestDecisions> {
  const records = await readDecisions(projectRoot, config);
  const decisions = governingAdrs(records, writtenCapabilities).map((adr) => ({
    number: adr.number,
    rule: adr.rule,
  }));
  return { decisions, flags: departureFlags(decisionsSection) };
}
