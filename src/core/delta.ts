/**
 * Deterministic OpenSpec delta merging.
 *
 * A delta spec is a capability-scoped markdown file using the OpenSpec
 * operation headings `## ADDED Requirements`, `## MODIFIED Requirements`,
 * `## REMOVED Requirements`, and `## RENAMED Requirements`. This module parses
 * those documents and merges them into a living capability spec in the strict
 * order RENAMED -> REMOVED -> MODIFIED -> ADDED so that repeated runs over the
 * same inputs produce byte-for-byte identical output.
 */

const REQUIREMENT_HEADER = /^###[ \t]+Requirement[ \t]*:(.*)$/;
const SCENARIO_HEADER = /^####[ \t]+Scenario[ \t]*:(.*)$/;
const WHEN_BULLET = /^-[ \t]+\*\*WHEN\*\*[ \t]*(.*)$/;
const THEN_BULLET = /^-[ \t]+\*\*THEN\*\*[ \t]*(.*)$/;

export interface DeltaScenario {
  readonly name: string;
  readonly when: string[];
  readonly then: string[];
  readonly raw: string;
}

export interface DeltaRequirement {
  readonly name: string;
  readonly body: string;
  readonly scenarios: DeltaScenario[];
  readonly raw: string;
}

export interface DeltaRename {
  readonly from: string;
  readonly to: string;
}

export interface ParsedDelta {
  readonly title: string;
  readonly purpose: string;
  readonly added: DeltaRequirement[];
  readonly modified: DeltaRequirement[];
  readonly removed: DeltaRequirement[];
  readonly renamed: DeltaRename[];
}

export interface CapabilitySpec {
  readonly title: string;
  readonly purpose: string;
  readonly requirements: DeltaRequirement[];
}

export class DeltaMergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeltaMergeError';
  }
}

function normalize(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSection(content: string, heading: string): string {
  const regex = new RegExp(
    `(?:^|\\n)##[ \\t]+${escapeRegExp(heading)}[ \\t]*\\n([\\s\\S]*?)(?=\\n##[ \\t]+|$)`,
  );
  const match = content.match(regex);
  return match ? match[1].trim() : '';
}

function buildScenarioRaw(name: string, when: string[], then: string[]): string {
  const lines = [`#### Scenario: ${name}`];
  for (const value of when) {
    lines.push(`- **WHEN** ${value}`);
  }
  for (const value of then) {
    lines.push(`- **THEN** ${value}`);
  }
  return lines.join('\n');
}

function buildRequirementRaw(name: string, body: string, scenarios: DeltaScenario[]): string {
  let block = `### Requirement: ${name}`;
  if (body) {
    block += `\n${body}`;
  }
  for (const scenario of scenarios) {
    block += `\n\n${scenario.raw}`;
  }
  return block;
}

export function parseScenario(raw: string): DeltaScenario {
  const lines = normalize(raw).split('\n');
  const header = lines[0]?.match(SCENARIO_HEADER);
  if (!header) {
    throw new DeltaMergeError(`Invalid scenario block header: ${lines[0] ?? ''}`);
  }

  const name = header[1].trim();
  const when: string[] = [];
  const then: string[] = [];

  for (const line of lines.slice(1)) {
    const whenMatch = line.match(WHEN_BULLET);
    if (whenMatch) {
      when.push(whenMatch[1].trim());
      continue;
    }
    const thenMatch = line.match(THEN_BULLET);
    if (thenMatch) {
      then.push(thenMatch[1].trim());
    }
  }

  return { name, when, then, raw: buildScenarioRaw(name, when, then) };
}

export function parseRequirement(raw: string): DeltaRequirement {
  const lines = normalize(raw).split('\n');
  const header = lines[0]?.match(REQUIREMENT_HEADER);
  if (!header) {
    throw new DeltaMergeError(`Invalid requirement block header: ${lines[0] ?? ''}`);
  }

  const name = header[1].trim();
  const scenarioStarts: number[] = [];
  for (let index = 1; index < lines.length; index++) {
    if (SCENARIO_HEADER.test(lines[index])) {
      scenarioStarts.push(index);
    }
  }

  const bodyEnd = scenarioStarts.length > 0 ? scenarioStarts[0] : lines.length;
  const body = lines.slice(1, bodyEnd).join('\n').trim();

  const scenarios: DeltaScenario[] = [];
  for (let index = 0; index < scenarioStarts.length; index++) {
    const start = scenarioStarts[index];
    const end = index + 1 < scenarioStarts.length ? scenarioStarts[index + 1] : lines.length;
    scenarios.push(parseScenario(lines.slice(start, end).join('\n')));
  }

  return { name, body, scenarios, raw: buildRequirementRaw(name, body, scenarios) };
}

function parseRequirementBlocks(section: string): DeltaRequirement[] {
  if (!section.trim()) {
    return [];
  }

  const lines = section.split('\n');
  const blocks: string[] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    if (REQUIREMENT_HEADER.test(line)) {
      if (current) {
        blocks.push(current.join('\n'));
      }
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }

  if (current) {
    blocks.push(current.join('\n'));
  }

  return blocks.map((block) => parseRequirement(block));
}

function parseRenameValue(line: string, label: 'FROM' | 'TO'): string | null {
  const match = line.match(new RegExp(`^-[ \\t]*${label}[ \\t]*:[ \\t]*(.*)$`, 'i'));
  if (!match) {
    return null;
  }
  return match[1].trim().replace(/^`+/, '').replace(/`+$/, '').trim();
}

function parseRenamedSection(section: string): DeltaRename[] {
  const renames: DeltaRename[] = [];
  let from: string | null = null;

  for (const line of section.split('\n')) {
    const fromValue = parseRenameValue(line, 'FROM');
    if (fromValue !== null) {
      from = fromValue;
      continue;
    }

    const toValue = parseRenameValue(line, 'TO');
    if (toValue !== null && from !== null) {
      renames.push({ from, to: toValue });
      from = null;
    }
  }

  return renames;
}

export function parseDelta(content: string): ParsedDelta {
  const normalized = normalize(content);
  const titleMatch = normalized.match(/^#[ \t]+(.*)$/m);
  const rawTitle = titleMatch ? titleMatch[1].trim() : '';
  const title = rawTitle.replace(/^Spec Delta[ \t]*:[ \t]*/i, '').trim();

  return {
    title,
    purpose: extractSection(normalized, 'Purpose'),
    added: parseRequirementBlocks(extractSection(normalized, 'ADDED Requirements')),
    modified: parseRequirementBlocks(extractSection(normalized, 'MODIFIED Requirements')),
    removed: parseRequirementBlocks(extractSection(normalized, 'REMOVED Requirements')),
    renamed: parseRenamedSection(extractSection(normalized, 'RENAMED Requirements')),
  };
}

export function parseCapabilitySpec(content: string): CapabilitySpec {
  const normalized = normalize(content);
  const titleMatch = normalized.match(/^#[ \t]+(.*)$/m);

  return {
    title: titleMatch ? titleMatch[1].trim() : '',
    purpose: extractSection(normalized, 'Purpose'),
    requirements: parseRequirementBlocks(extractSection(normalized, 'Requirements')),
  };
}

export function serializeCapabilitySpec(spec: CapabilitySpec): string {
  const sections: string[] = [`# ${spec.title}`];
  sections.push(`## Purpose\n\n${spec.purpose}`.trimEnd());

  if (spec.requirements.length > 0) {
    sections.push(
      `## Requirements\n\n${spec.requirements.map((requirement) => requirement.raw).join('\n\n')}`,
    );
  }

  return `${sections.join('\n\n')}\n`;
}

/**
 * Merges a parsed delta into a base capability spec. When `baseContent` is null
 * or empty, a new capability spec is created using the delta's Purpose.
 *
 * Operations execute in strict sequence RENAMED -> REMOVED -> MODIFIED -> ADDED.
 * A missing RENAMED, MODIFIED, or REMOVED target raises `DeltaMergeError`.
 */
export function mergeDelta(
  baseContent: string | null,
  capability: string,
  delta: ParsedDelta,
): string {
  const hasBase = typeof baseContent === 'string' && baseContent.trim() !== '';
  const parsedBase = hasBase ? parseCapabilitySpec(baseContent as string) : null;
  const requirements = parsedBase ? [...parsedBase.requirements] : [];

  for (const rename of delta.renamed) {
    const index = requirements.findIndex((requirement) => requirement.name === rename.from);
    if (index === -1) {
      throw new DeltaMergeError(
        `Cannot apply RENAMED: requirement "${rename.from}" not found in base spec`,
      );
    }
    const existing = requirements[index];
    requirements[index] = {
      ...existing,
      name: rename.to,
      raw: buildRequirementRaw(rename.to, existing.body, existing.scenarios),
    };
  }

  for (const removed of delta.removed) {
    const index = requirements.findIndex((requirement) => requirement.name === removed.name);
    if (index === -1) {
      throw new DeltaMergeError(
        `Cannot apply REMOVED: requirement "${removed.name}" not found in base spec`,
      );
    }
    requirements.splice(index, 1);
  }

  for (const modified of delta.modified) {
    const index = requirements.findIndex((requirement) => requirement.name === modified.name);
    if (index === -1) {
      throw new DeltaMergeError(
        `Cannot apply MODIFIED: requirement "${modified.name}" not found in base spec`,
      );
    }
    requirements[index] = modified;
  }

  requirements.push(...delta.added);

  const title = parsedBase?.title ? parsedBase.title : `${capability} Specification`;
  const purpose = parsedBase?.purpose ? parsedBase.purpose : delta.purpose;

  return serializeCapabilitySpec({ title, purpose, requirements });
}
