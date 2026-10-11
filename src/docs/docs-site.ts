/**
 * The docs site model: the capability pages, the ADR pages, and the groups
 * that order the capabilities. Everything is read from the two page builders
 * and nothing is written.
 */

import type { OsqConfig } from '../core/foundation/config.js';
import { buildAdrPages } from './adr-page.js';
import { buildCapabilityPages } from './capability-page.js';
import type { CapabilityPage, DocsGroup, DocsSite } from './docs-types.js';

/**
 * One entry per group name, its capability names in group order, the named
 * groups sorted by name and the capabilities with no group last under
 * `ungrouped`.
 */
function buildGroups(capabilities: readonly CapabilityPage[]): DocsGroup[] {
  const named = new Map<string, string[]>();
  const ungrouped: string[] = [];
  for (const page of capabilities) {
    if (page.group === null) {
      ungrouped.push(page.name);
      continue;
    }
    const list = named.get(page.group);
    if (list) list.push(page.name);
    else named.set(page.group, [page.name]);
  }

  const groups: DocsGroup[] = [...named.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, names]) => ({ name, capabilities: names }));
  if (ungrouped.length > 0) groups.push({ name: 'ungrouped', capabilities: ungrouped });
  return groups;
}

/**
 * Build the docs site from the capability pages, the ADR pages, and the groups
 * that order the capabilities.
 *
 * @scenario docs: Groups of the docs fixture
 * @adr 016
 */
export async function buildDocsSite(projectRoot: string, config: OsqConfig): Promise<DocsSite> {
  const [capabilities, adrs] = await Promise.all([
    buildCapabilityPages(projectRoot, config),
    buildAdrPages(projectRoot, config),
  ]);
  return { version: 1, groups: buildGroups(capabilities), capabilities, adrs };
}
