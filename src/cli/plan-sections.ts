import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../core/foundation/config.js';
import { readDecisions } from '../core/foundation/decisions.js';
import { getSpecsDir } from '../core/status/layout.js';

/** Opening sentence of the `## Architecture Decisions` section. */
const DECISIONS_SENTENCE =
  "Read in full every ADR that applies to all, and every ADR that applies to a capability this change writes. Name each governing capability ADR in the proposal's ## Decisions section.";

/**
 * The `## Capability Specs` section: a fixed label followed by every living
 * capability spec path, sorted by capability directory name. Moved verbatim out
 * of `buildBaseOpeningPrompt` so the prompt's bytes are unchanged.
 */
export async function formatCapabilitySpecsSection(
  projectRoot: string,
  openspecRoot: string,
): Promise<string> {
  const specsDir = getSpecsDir(openspecRoot, projectRoot);
  const specPaths: string[] = [];
  try {
    const entries = await fs.readdir(specsDir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        const rel = path.relative(projectRoot, path.join(specsDir, entry.name, 'spec.md'));
        specPaths.push(rel);
      }
    }
  } catch {}
  return `## Capability Specs\n\nAll living specs. Read the ones this change writes or whose code it uses.\n\n${specPaths
    .map((p) => `- ${p}`)
    .join('\n')}`;
}

/**
 * The `## Architecture Decisions` section: the required sentence and one line
 * per accepted ADR in number order, each naming its scope, rule, and path. It
 * returns null when the project has no accepted ADR, so proposed and superseded
 * ADRs never appear.
 */
export async function formatArchitectureDecisionsSection(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<string | null> {
  const { adrs } = await readDecisions(projectRoot, config);
  const accepted = adrs.filter((adr) => adr.status === 'accepted');
  if (accepted.length === 0) return null;
  const lines = accepted.map((adr) => {
    const scope = adr.appliesTo === 'all' ? 'all' : (adr.appliesTo ?? []).join(', ');
    return `- ADR ${adr.number}: ${adr.title}. Applies to: ${scope}. Rule: ${adr.rule} Path: ${adr.path}`;
  });
  return `## Architecture Decisions\n\n${DECISIONS_SENTENCE}\n\n${lines.join('\n')}`;
}
