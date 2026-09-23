import fs from 'node:fs/promises';
import path from 'node:path';
import { PACKAGE_ROOT } from '../foundation/package-root.js';

/** The exact `@fission-ai/openspec` version this profile is pinned against. */
export const OPENSPEC_EXPECTED_VERSION = '1.13.1';

/** Peer package whose declared range governs compatible validator versions. */
const OPENSPEC_PACKAGE = '@fission-ai/openspec';

/** Classification of an installed validator version against the pinned profile. */
export type OpenSpecVersionStatus = 'pinned' | 'in-range' | 'out-of-range';

/** One classification result, carrying the version and the range that decided it. */
export interface OpenSpecVersionAssessment {
  readonly status: OpenSpecVersionStatus;
  readonly version: string;
  readonly range: string | null;
}

/** A single comparator clause such as `>=1.13.1`. */
interface Comparator {
  readonly operator: '>=' | '<=' | '>' | '<' | '=';
  readonly parts: readonly number[];
}

/**
 * A comparable version uses exactly one to three numeric components. The
 * installed version must be a full `major.minor.patch` triple; a prerelease or
 * partial version is not comparable.
 */
const INSTALLED_VERSION_REGEX = /^\d+\.\d+\.\d+$/;

/** A comparator clause: an operator followed by one to three numeric components. */
const COMPARATOR_REGEX = /^(>=|<=|>|<|=)(\d+(?:\.\d+){0,2})$/;

/** Component count of a comparable version. */
const COMPONENTS = 3;

/** Parse a full `major.minor.patch` installed version, or null when malformed. */
function parseInstalledVersion(version: string): number[] | null {
  if (!INSTALLED_VERSION_REGEX.test(version)) {
    return null;
  }
  return version.split('.').map(Number);
}

/** Parse a whitespace-separated comparator range, or null when unreadable. */
function parseRange(range: string): Comparator[] | null {
  const tokens = range.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  const comparators: Comparator[] = [];
  for (const token of tokens) {
    const match = COMPARATOR_REGEX.exec(token);
    if (!match) {
      return null;
    }
    comparators.push({
      operator: match[1] as Comparator['operator'],
      parts: (match[2] ?? '').split('.').map(Number),
    });
  }
  return comparators;
}

/** Compare two component lists, treating missing trailing components as zero. */
function compareComponents(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < COMPONENTS; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) {
      return a < b ? -1 : 1;
    }
  }
  return 0;
}

/** True when every comparator clause holds for the installed version. */
function satisfiesRange(version: readonly number[], comparators: readonly Comparator[]): boolean {
  return comparators.every((comparator) => {
    const order = compareComponents(version, comparator.parts);
    switch (comparator.operator) {
      case '>=':
        return order >= 0;
      case '>':
        return order > 0;
      case '<=':
        return order <= 0;
      case '<':
        return order < 0;
      default:
        return order === 0;
    }
  });
}

/**
 * Classify an installed version against a declared peer range without reading
 * any file. The pin always wins; an unreadable range, an unparseable version,
 * or a prerelease is out of range.
 */
export function classifyOpenSpecVersion(
  version: string,
  range: string | null,
): OpenSpecVersionStatus {
  if (version === OPENSPEC_EXPECTED_VERSION) {
    return 'pinned';
  }

  const installed = parseInstalledVersion(version);
  const comparators = range === null ? null : parseRange(range);
  if (installed === null || comparators === null) {
    return 'out-of-range';
  }
  return satisfiesRange(installed, comparators) ? 'in-range' : 'out-of-range';
}

/**
 * Read the declared `@fission-ai/openspec` peer range from osq's own
 * `package.json`. A missing manifest, missing entry, or non-string value
 * resolves to null so callers fail closed.
 */
export async function readOpenSpecPeerRange(): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8');
    const manifest = JSON.parse(raw) as { peerDependencies?: Record<string, unknown> };
    const declared = manifest.peerDependencies?.[OPENSPEC_PACKAGE];
    return typeof declared === 'string' && declared.trim() !== '' ? declared.trim() : null;
  } catch {
    return null;
  }
}

/** Classify an installed version against osq's declared peer range. */
export async function assessOpenSpecVersion(version: string): Promise<OpenSpecVersionAssessment> {
  const range = await readOpenSpecPeerRange();
  const normalized = version.trim();
  return { status: classifyOpenSpecVersion(normalized, range), version: normalized, range };
}

/**
 * The shared warning for a validator inside the declared peer range but off the
 * pin. ADR 005 governs this policy.
 */
export function formatInRangeWarning(version: string, range: string): string {
  return `openspec version ${version} differs from pinned ${OPENSPEC_EXPECTED_VERSION}; inside supported range ${range} (ADR 005)`;
}
