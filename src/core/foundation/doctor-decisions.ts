import fs from 'node:fs/promises';
import path from 'node:path';
import { readLivingCapabilityNames } from '../spec/digest-capability.js';
import type { OsqConfig } from './config.js';
import { readDecisions, validateDecisions } from './decisions.js';
import type { DoctorCheckResult } from './doctor.js';
import { RULES_START_MARKER, checkProjectRules } from './rules-block.js';

/** True when a decisions markdown file or an AGENTS.md rules marker exists. */
function hasDecisionSurface(
  records: { adrs: readonly unknown[]; ignored: readonly string[] },
  agents: string,
): boolean {
  return (
    records.adrs.length > 0 || records.ignored.length > 0 || agents.includes(RULES_START_MARKER)
  );
}

/**
 * The `decisions` check: validates the ADRs and the AGENTS.md rules block.
 * Returns null when the project has neither an ADR file nor a rules marker, so
 * the doctor check list stays unchanged for projects without decisions.
 */
export async function checkDecisions(
  projectRoot: string,
  config: OsqConfig,
): Promise<DoctorCheckResult | null> {
  const records = await readDecisions(projectRoot, config);
  const agents = await fs.readFile(path.join(projectRoot, 'AGENTS.md'), 'utf8').catch(() => '');
  if (!hasDecisionSurface(records, agents)) return null;

  const living = await readLivingCapabilityNames(projectRoot, config.paths.openspecRoot);
  const problems = validateDecisions(records, living, config);
  const errors = [...problems.errors, ...(await checkProjectRules(projectRoot, config))];
  if (errors.length > 0) {
    return { name: 'decisions', ok: false, message: errors.join('; ') };
  }
  if (problems.warnings.length > 0) {
    return { name: 'decisions', ok: true, warning: true, message: problems.warnings.join('; ') };
  }
  return { name: 'decisions', ok: true, message: `${records.adrs.length} ADRs valid` };
}
