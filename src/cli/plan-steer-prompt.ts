/**
 * The steering prompt the watcher hands to its automatic planner: exactly the
 * prompt `osq plan <id> --print` prints, without its final newline, for a
 * change that `readSteeringPlan` finds needing steering. It builds the prompt
 * the same way `planCommand` does and writes nothing, so the watcher imports no
 * CLI command to get it.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import { parseFrontmatter } from '../core/spec/parser.js';
import { readSteeringPlan } from './plan-steer.js';
import { buildOpeningPrompt } from './plan.js';

/**
 * The prompt `osq plan <id> --print` prints for a change that needs steering,
 * without its final newline, or null when `readSteeringPlan` finds none. It
 * reads the change's `brief.md` and proposal title, builds the opening prompt,
 * then appends the steering section after a blank line. It writes nothing, not
 * even `plan-prompt.md`.
 *
 * @scenario cli-foundation: Same prompt as osq plan
 * @scenario cli-foundation: Nothing to steer
 * @adr 018
 */
export async function buildSteeringPrompt(
  projectRoot: string,
  config: OsqConfig,
  id: string,
): Promise<string | null> {
  const steering = await readSteeringPlan(projectRoot, config, id);
  if (steering === null) return null;

  const folderPath = steering.change.folderPath;
  const briefContent = await fs.readFile(path.join(folderPath, 'brief.md'), 'utf8');

  let specTitle = id;
  try {
    const proposalContent = await fs.readFile(path.join(folderPath, 'proposal.md'), 'utf8');
    const parsed = parseFrontmatter(proposalContent);
    if (parsed.data.title) specTitle = String(parsed.data.title);
  } catch {}

  const openingPrompt = await buildOpeningPrompt({
    projectRoot,
    folderPath,
    specId: steering.id,
    specTitle,
    briefContent,
    openspecRoot: config.paths.openspecRoot,
    config,
  });
  return `${openingPrompt}\n\n${steering.section}`;
}
