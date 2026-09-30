import fs from 'node:fs/promises';
import path from 'node:path';
import { getSpecsDir } from '../status/layout.js';
import { normalizeRequirementName, parseCapabilitySpec } from './delta.js';
import { specDirectories } from './scenario-impact.js';

/**
 * Read-only lookup over the living capability specs.
 *
 * With no capability it names the living capabilities. With a capability it
 * names that spec's requirements, or, with a requirement too, returns that
 * requirement's verbatim block. Unknown names throw a plain `Error` whose
 * message is the delta's exact text; the unknown name never reaches a path.
 */
export async function lookupRequirement(
  projectRoot: string,
  openspecRoot: string,
  capability?: string,
  requirement?: string,
): Promise<string[] | string> {
  const specsDir = getSpecsDir(openspecRoot, projectRoot);
  const capabilities = await specDirectories(specsDir);

  if (!capability) {
    return capabilities;
  }

  if (!capabilities.includes(capability)) {
    throw new Error(
      `No living capability "${capability}". Capabilities: ${capabilities.join(', ')}`,
    );
  }

  const content = await fs.readFile(path.join(specsDir, capability, 'spec.md'), 'utf8');
  const requirements = parseCapabilitySpec(content).requirements;

  if (!requirement) {
    return requirements.map((entry) => entry.name);
  }

  const wanted = normalizeRequirementName(requirement);
  const found = requirements.find((entry) => normalizeRequirementName(entry.name) === wanted);
  if (!found) {
    throw new Error(
      `${capability} has no requirement "${requirement}". osq spec ${capability} lists them.`,
    );
  }

  return found.raw;
}
