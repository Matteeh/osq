/**
 * The ADR page model: one page per ADR `readDecisions` reads, in number order,
 * holding its frontmatter fields, the capabilities it applies to, and its body
 * after the frontmatter and the first `# ` heading are removed. Every value is
 * read from existing osq readers and nothing is written.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import type { Adr } from '../core/foundation/decisions.js';
import { readDecisions } from '../core/foundation/decisions.js';
import { parseFrontmatter } from '../core/spec/parser.js';
import { listCapabilityFolders } from '../core/web/web-data-folders.js';
import type { AdrPage } from './docs-types.js';

/** The file text after its frontmatter, first `# ` heading removed, trimmed. */
function adrBody(content: string): string {
  const lines = parseFrontmatter(content).body.split(/\r?\n/);
  const heading = lines.findIndex((line) => /^#\s/.test(line));
  if (heading >= 0) lines.splice(heading, 1);
  return lines.join('\n').trim();
}

/** The living capability names, in name order. */
async function livingCapabilityNames(projectRoot: string, config: OsqConfig): Promise<string[]> {
  return (await listCapabilityFolders(projectRoot, config)).map((folder) => folder.id);
}

/** The capabilities an ADR applies to: every living name, its governs, or none. */
function capabilitiesFor(governs: Adr['governs'], living: readonly string[]): string[] {
  if (governs === 'all') return [...living];
  return [...governs];
}

/**
 * Build one page per ADR that `readDecisions` reads, in number order. Each ADR
 * file is read once for its body.
 *
 * @scenario docs: ADR pages of the docs fixture
 * @adr 016
 */
export async function buildAdrPages(projectRoot: string, config: OsqConfig): Promise<AdrPage[]> {
  const [records, living] = await Promise.all([
    readDecisions(projectRoot, config),
    livingCapabilityNames(projectRoot, config),
  ]);

  const pages: AdrPage[] = [];
  for (const adr of records.adrs) {
    const content = await fs.readFile(path.join(projectRoot, adr.path), 'utf8').catch(() => null);
    pages.push({
      number: adr.number,
      title: adr.title,
      status: adr.status,
      date: adr.date,
      path: adr.path,
      rule: adr.rule,
      appliesTo: adr.appliesTo,
      supersededBy: adr.supersededBy,
      capabilities: capabilitiesFor(adr.governs, living),
      body: content === null ? '' : adrBody(content),
    });
  }
  return pages;
}
