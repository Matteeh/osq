/**
 * Renders a docs site to the file map the `osq docs` command writes: one
 * index, one page per capability, and one page per ADR. Every file ends in a
 * single newline and carries no timestamp, so the same tree gives the same
 * bytes.
 */

import type { AdrPage, CapabilityPage, CodeMapEntry, DocsSite } from './docs-types.js';

/** Join lines with exactly one trailing newline. */
function endFile(lines: readonly string[]): string {
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

/** Append a block preceded by one blank line. */
function block(lines: string[], ...content: string[]): void {
  if (content.length === 0) return;
  lines.push('', ...content);
}

/** Collapse every run of whitespace to one space and trim. */
function inline(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** One code map entry: its heading, its functions, and its tests. */
function codeMapLines(entry: CodeMapEntry): string[] {
  const body = [
    ...entry.functions.map((fn) => `- \`${fn.file}:${fn.line}\` ${fn.name}`),
    ...entry.tests.map((test) => `- test \`${test}\``),
  ];
  const heading = `### ${entry.requirement}: ${entry.scenario}`;
  return body.length === 0 ? [heading] : [heading, '', ...body];
}

/** The value after `Applies to:`: `all`, the capability links, or `none`. */
function appliesTo(page: AdrPage): string {
  if (page.appliesTo === 'all') return 'all';
  if (page.capabilities.length === 0) return 'none';
  return page.capabilities.map((name) => `[${name}](../capabilities/${name}.md)`).join(', ');
}

/**
 * Render the index: `# Capabilities`, one `## <group>` per group with a line
 * per capability, then `# Decisions` with a line per ADR.
 *
 * @scenario docs: Docs written from the fixture
 * @scenario docs: Page lines from the fixture
 * @adr 016
 */
export function renderIndex(site: DocsSite): string {
  const byName = new Map(site.capabilities.map((capability) => [capability.name, capability]));
  const lines = ['# Capabilities'];
  for (const group of site.groups) {
    block(lines, `## ${group.name}`);
    for (const name of group.capabilities) {
      const purpose = byName.get(name)?.purpose ?? '';
      lines.push(`- [${name}](capabilities/${name}.md): ${inline(purpose)}`);
    }
  }
  block(lines, '# Decisions');
  for (const adr of site.adrs) {
    lines.push(`- [ADR ${adr.number}: ${adr.title}](adrs/${adr.number}.md) (${adr.status})`);
  }
  return endFile(lines);
}

/**
 * Render one capability page: its heading, group, purpose, then its
 * Requirements, Decisions, Code ownership, Code map, and Recent changes
 * sections.
 *
 * @scenario docs: Docs written from the fixture
 * @scenario docs: Page lines from the fixture
 * @adr 016
 */
export function renderCapabilityPage(page: CapabilityPage): string {
  const lines = [`# ${page.name}`, '', `Group: ${page.group ?? 'ungrouped'}`];
  if (page.purpose !== '') block(lines, page.purpose);

  block(lines, '## Requirements');
  for (const requirement of page.requirements) {
    block(lines, `### ${requirement.name}`);
    if (requirement.shall !== '') block(lines, requirement.shall);
    for (const scenario of requirement.scenarios) lines.push(`- Scenario: ${scenario}`);
  }

  block(lines, '## Decisions');
  const decisions = page.decisions.map(
    (decision) =>
      `- [ADR ${decision.number}: ${decision.title}](../adrs/${decision.number}.md): ${decision.rule}`,
  );
  block(lines, ...(decisions.length === 0 ? ['None'] : decisions));

  block(lines, '## Code ownership');
  for (const glob of page.ownership) lines.push(`- \`${glob}\``);

  if (page.codeMap !== null) {
    block(lines, '## Code map');
    for (const entry of page.codeMap) block(lines, ...codeMapLines(entry));
  }

  block(lines, '## Recent changes');
  const changes = page.recentChanges.map(
    (change) => `- ${change.id} ${change.archivedOn ?? 'undated'}: ${change.goal}`,
  );
  block(lines, ...(changes.length === 0 ? ['None'] : changes));

  return endFile(lines);
}

/**
 * Render one ADR page: its heading, status, what it applies to, its rule when
 * it has one, then its body.
 *
 * @scenario docs: Docs written from the fixture
 * @scenario docs: Page lines from the fixture
 * @adr 016
 */
export function renderAdrPage(page: AdrPage): string {
  const status =
    page.supersededBy === null
      ? `Status: ${page.status}`
      : `Status: ${page.status}, superseded by [ADR ${page.supersededBy}](${page.supersededBy}.md)`;
  const lines = [`# ADR ${page.number}: ${page.title}`, '', status];
  block(lines, `Applies to: ${appliesTo(page)}`);
  if (page.rule !== '') block(lines, `Rule: ${page.rule}`);
  if (page.body !== '') block(lines, page.body);
  return endFile(lines);
}

/**
 * Render the whole site to its file map: `index.md`, `capabilities/<name>.md`
 * per capability, and `adrs/<number>.md` per ADR.
 *
 * @scenario docs: Docs written from the fixture
 * @scenario docs: Page lines from the fixture
 * @adr 016
 */
export function renderDocsSite(site: DocsSite): Map<string, string> {
  const files = new Map<string, string>();
  files.set('index.md', renderIndex(site));
  for (const capability of site.capabilities) {
    files.set(`capabilities/${capability.name}.md`, renderCapabilityPage(capability));
  }
  for (const adr of site.adrs) {
    files.set(`adrs/${adr.number}.md`, renderAdrPage(adr));
  }
  return files;
}
