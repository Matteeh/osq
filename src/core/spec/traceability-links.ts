import type { TraceabilityMode } from '../foundation/config-traceability.js';
import type { Adr } from '../foundation/decisions.js';
import { sameAdrNumber } from '../foundation/decisions.js';
import type { ScenarioIndex } from '../trace/scenario-index.js';
import { type CapabilityOwnership, ownerCapabilities } from './capability-impact.js';
import { type LintFinding, type LintSeverity, makeFinding } from './lint-findings.js';

/**
 * The link half of traceability lint: an added or modified scenario no scoped
 * test names, a tag naming a missing scenario, a tagged function no covering
 * test reaches, an ADR tag that is missing, unaccepted, or out of scope, and
 * two effective scenarios sharing a name.
 */

/** One task's number, file, and resolved scope for planned-scenario reading. */
export interface PlannedTask {
  readonly taskNumber: string;
  readonly taskPath: string;
  readonly resolvedPaths: readonly string[];
}

/** The stable key for one capability/scenario pair. */
export function scenarioKey(capability: string, name: string): string {
  return `${capability}\u0000${name}`;
}

/** The severity every traceability finding takes from the configured mode. */
export function traceabilitySeverity(mode: TraceabilityMode): LintSeverity {
  return mode === 'require' ? 'error' : 'warning';
}

/** One opted-in capability's scenario facts for the link rules. */
export interface CapabilityLinkInfo {
  readonly capability: string;
  /** Repository-relative delta spec path, or null when the change has none. */
  readonly deltaPath: string | null;
  /** Every scenario name in the effective spec, in document order. */
  readonly effectiveNames: readonly string[];
  /** Added scenarios plus modified scenarios whose block differs. */
  readonly alteredNames: readonly string[];
}

/** Everything the link rules read, already collected by the entry module. */
export interface TraceabilityLinksInput {
  readonly mode: TraceabilityMode;
  readonly index: ScenarioIndex;
  readonly scopedFiles: ReadonlySet<string>;
  readonly optedIn: ReadonlySet<string>;
  readonly capabilities: readonly CapabilityLinkInfo[];
  /** `scenarioKey` values a task with a test path lists under `## Scenarios`. */
  readonly planned: ReadonlySet<string>;
  readonly namedByScopedTest: (capability: string, name: string) => boolean;
  readonly plannedCoversFunction: (file: string, capability: string, name: string) => boolean;
  readonly adrs: readonly Adr[];
  readonly ownerships: readonly CapabilityOwnership[];
}

/** The first scenario name that appears more than once, in document order. */
function firstDuplicate(names: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) return name;
    seen.add(name);
  }
  return null;
}

/** Scenario-level findings: duplicate names and altered scenarios no test names. */
function scenarioFindings(input: TraceabilityLinksInput): LintFinding[] {
  const findings: LintFinding[] = [];
  const severity = traceabilitySeverity(input.mode);

  for (const info of input.capabilities) {
    if (info.deltaPath !== null) {
      const duplicate = firstDuplicate(info.effectiveNames);
      if (duplicate !== null) {
        findings.push(
          makeFinding(
            severity,
            { file: info.deltaPath },
            `${info.capability}: two scenarios named "${duplicate}"`,
          ),
        );
      }
    }
    if (info.deltaPath === null) continue;
    for (const name of info.alteredNames) {
      if (input.planned.has(scenarioKey(info.capability, name))) continue;
      if (input.namedByScopedTest(info.capability, name)) continue;
      findings.push(
        makeFinding(
          severity,
          { file: info.deltaPath },
          `${info.capability}: no test names scenario "${name}"`,
        ),
      );
    }
  }

  return findings;
}

/** The capabilities a function serves, from its tags or its file's owners. */
function servedCapabilities(
  input: TraceabilityLinksInput,
  file: string,
  scenarios: readonly { readonly capability: string }[],
): string[] {
  if (scenarios.length > 0) {
    return [...new Set(scenarios.map((scenario) => scenario.capability))];
  }
  return ownerCapabilities(input.ownerships, file);
}

/** True when an accepted ADR applies to `all` or to a served capability. */
function adrApplies(adr: Adr, served: readonly string[]): boolean {
  if (adr.appliesTo === 'all') return true;
  if (!Array.isArray(adr.appliesTo)) return false;
  return adr.appliesTo.some((capability) => served.includes(capability));
}

/** The ADR findings for one function's `@adr` tags. */
function adrFindings(
  input: TraceabilityLinksInput,
  file: string,
  fnName: string,
  adrNumbers: readonly string[],
  served: readonly string[],
  severity: LintSeverity,
): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const number of adrNumbers) {
    const adr = input.adrs.find((candidate) => sameAdrNumber(candidate.number, number));
    if (adr === undefined || adr.status !== 'accepted') {
      findings.push(
        makeFinding(severity, { file }, `${fnName}: ADR ${number} doesn't exist or isn't accepted`),
      );
    } else if (!adrApplies(adr, served)) {
      findings.push(
        makeFinding(
          severity,
          { file },
          `${fnName}: ADR ${number} doesn't apply to any capability it serves`,
        ),
      );
    }
  }
  return findings;
}

/** True when a test that covers a function also names the scenario. */
function coveredByName(
  input: TraceabilityLinksInput,
  file: string,
  fnName: string,
  capability: string,
  scenario: string,
): boolean {
  const naming = new Set(input.index.testsNaming(capability, scenario));
  return input.index.coveringTests(file, fnName).some((test) => naming.has(test));
}

/** Tag and ADR findings for the exported functions inside resolved scopes. */
function functionFindings(input: TraceabilityLinksInput): LintFinding[] {
  const findings: LintFinding[] = [];
  const severity = traceabilitySeverity(input.mode);
  const namesByCapability = new Map(
    input.capabilities.map((info) => [info.capability, new Set(info.effectiveNames)]),
  );

  for (const fn of input.index.functions) {
    if (!input.scopedFiles.has(fn.file)) continue;

    for (const tag of fn.scenarios) {
      if (!input.optedIn.has(tag.capability)) continue;
      const names = namesByCapability.get(tag.capability) ?? new Set<string>();
      if (!names.has(tag.name)) {
        findings.push(
          makeFinding(
            severity,
            { file: fn.file },
            `${fn.name}: names a scenario the ${tag.capability} spec doesn't have: "${tag.name}"`,
          ),
        );
        continue;
      }
      const planned = input.plannedCoversFunction(fn.file, tag.capability, tag.name);
      if (!planned && !coveredByName(input, fn.file, fn.name, tag.capability, tag.name)) {
        findings.push(
          makeFinding(
            severity,
            { file: fn.file },
            `${fn.name}: no test for "${tag.name}" covers it`,
          ),
        );
      }
    }

    if (fn.adrs.length === 0) continue;
    const served = servedCapabilities(input, fn.file, fn.scenarios);
    if (!served.some((capability) => input.optedIn.has(capability))) continue;
    findings.push(...adrFindings(input, fn.file, fn.name, fn.adrs, served, severity));
  }

  return findings;
}

/** Every link finding: scenario links, tags, and ADRs, all in scope order. */
export function linkFindings(input: TraceabilityLinksInput): LintFinding[] {
  return [...scenarioFindings(input), ...functionFindings(input)];
}

/** True when a planned scenario covers a function in the planning task's scope. */
export function plannedCoversFunction(
  tasks: readonly PlannedTask[],
  planned: ReadonlyMap<string, Set<string>>,
  file: string,
  capability: string,
  name: string,
  namedByScopedTest: (capability: string, name: string) => boolean,
): boolean {
  if (namedByScopedTest(capability, name)) return false;
  const key = scenarioKey(capability, name);
  return tasks.some(
    (task) => planned.get(task.taskNumber)?.has(key) === true && task.resolvedPaths.includes(file),
  );
}
