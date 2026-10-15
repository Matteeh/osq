/**
 * Refuses a delta that would leave a capability holding a scenario name twice.
 *
 * `lookupScenario` reads a capability's scenarios by merging the living spec
 * with a change's delta and parsing the result. Lint uses the same merge and
 * parse so it agrees with the test helper: it parses the merged spec and the
 * living spec, and reports one error per scenario name that appears more than
 * once in the merged spec while the living spec held it at most once.
 */

import { type CapabilitySpec, parseCapabilitySpec } from './delta.js';
import { type LintFinding, makeFinding } from './lint-findings.js';

/** One scenario heading, with the requirement that holds it, in merged order. */
interface ScenarioOccurrence {
  readonly requirement: string;
  readonly name: string;
}

/** Every scenario heading of a parsed spec, in document order. */
function scenarioOccurrences(spec: CapabilitySpec): ScenarioOccurrence[] {
  const occurrences: ScenarioOccurrence[] = [];
  for (const requirement of spec.requirements) {
    for (const scenario of requirement.scenarios) {
      occurrences.push({ requirement: requirement.name, name: scenario.name });
    }
  }
  return occurrences;
}

/** How often each scenario name appears. */
function nameCounts(occurrences: readonly ScenarioOccurrence[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const occurrence of occurrences) {
    counts.set(occurrence.name, (counts.get(occurrence.name) ?? 0) + 1);
  }
  return counts;
}

/**
 * The error findings for a capability whose merged spec gives one scenario name
 * to more than one requirement while the living spec held it at most once. The
 * finding is on the delta file and the second requirement that holds the name,
 * in merged order, and a name repeated inside one requirement names it twice.
 *
 * @scenario spec-lint-and-approve: Delta adds a taken scenario name
 * @scenario spec-lint-and-approve: Two added requirements share a scenario name
 * @scenario spec-lint-and-approve: Approval refuses a repeated scenario name
 * @scenario spec-lint-and-approve: Name the living spec already repeats
 * @scenario spec-lint-and-approve: Modified requirement keeps its scenario names
 */
export function duplicateScenarioFindings(
  capability: string,
  deltaFile: string,
  livingContent: string | null,
  mergedContent: string,
): LintFinding[] {
  const merged = scenarioOccurrences(parseCapabilitySpec(mergedContent));
  const living =
    livingContent === null ? [] : scenarioOccurrences(parseCapabilitySpec(livingContent));
  const mergedCounts = nameCounts(merged);
  const livingCounts = nameCounts(living);

  const findings: LintFinding[] = [];
  const reported = new Set<string>();
  for (const occurrence of merged) {
    const name = occurrence.name;
    if (reported.has(name)) continue;
    if ((mergedCounts.get(name) ?? 0) <= 1) continue;
    if ((livingCounts.get(name) ?? 0) > 1) continue;
    const holders = merged.filter((entry) => entry.name === name);
    reported.add(name);
    findings.push(
      makeFinding(
        'error',
        { file: deltaFile, requirement: holders[1].requirement },
        `${capability}: scenario "${name}" appears in both "${holders[0].requirement}" and "${holders[1].requirement}"; give each scenario of a capability its own name`,
      ),
    );
  }
  return findings;
}
