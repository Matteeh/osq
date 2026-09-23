/**
 * Deterministic OpenSpec delta merging.
 *
 * A delta spec is a capability-scoped markdown file using the OpenSpec
 * operation headings `## ADDED Requirements`, `## MODIFIED Requirements`,
 * `## REMOVED Requirements`, and `## RENAMED Requirements`. This module parses
 * those documents and merges them into a living capability spec.
 *
 * The merge reproduces `openspec archive` byte for byte: requirement blocks are
 * carried verbatim rather than re-serialized, section text the delta does not
 * touch is preserved, and a new capability follows `## Purpose` with its body on
 * the next line. Where OpenSpec can only warn, this module refuses with
 * `DeltaMergeError`: a MODIFIED block that drops an existing scenario, an ADDED
 * name that already exists with different content, a bare RENAMED entry, and an
 * unmatched RENAMED, MODIFIED, or REMOVED target.
 */

const REQUIREMENT_HEADER_REGEX = /^###\s*Requirement:\s*(.+)\s*$/i;
const SCENARIO_HEADER_REGEX = /^####\s+(.*)$/;
const SCENARIO_PREFIX_REGEX = /^####\s+/;
const TOP_LEVEL_SECTION_REGEX = /^##\s+(.+)$/;
const RENAME_FROM_REGEX = /^\s*[-*+]?\s*FROM:\s*`?###\s*Requirement:\s*(.+?)`?\s*$/;
const RENAME_TO_REGEX = /^\s*[-*+]?\s*TO:\s*`?###\s*Requirement:\s*(.+?)`?\s*$/;
const ANY_RENAME_REGEX = /^\s*[-*+]?\s*(FROM|TO):\s*(.*)$/i;
const REMOVED_BULLET_REGEX = /^\s*[-*+]\s*`?###\s*Requirement:\s*(.+?)`?\s*$/;

const PURPOSE_PLACEHOLDER_PREFIX = 'TBD - created by archiving change ';
const PURPOSE_PLACEHOLDER_SUFFIX = '. Update Purpose after archive.';

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

export interface InvalidRename {
  readonly line: string;
}

export interface UnpairedRename {
  readonly side: 'FROM' | 'TO';
  readonly name: string;
}

export interface ParsedDelta {
  readonly title: string;
  readonly purpose: string;
  readonly added: DeltaRequirement[];
  readonly modified: DeltaRequirement[];
  readonly removed: DeltaRequirement[];
  readonly renamed: DeltaRename[];
  readonly invalidRenames: InvalidRename[];
  readonly unpairedRenames: UnpairedRename[];
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

interface RequirementBlock {
  readonly headerLine: string;
  readonly name: string;
  readonly raw: string;
}

interface RequirementSection {
  readonly before: string;
  readonly headerLine: string;
  readonly preamble: string;
  readonly bodyBlocks: RequirementBlock[];
  readonly after: string;
}

function normalizeLineEndings(content: string): string {
  return content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function normalizeBlockRaw(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').trim();
}

/** Strip an ATX closing run and surrounding whitespace from a requirement name. */
export function normalizeRequirementName(name: string): string {
  return name.replace(/[ \t]+#+[ \t]*$/, '').trim();
}

/** Case- and whitespace-insensitive fold used for typo detection only. */
function foldRequirementName(name: string): string {
  return normalizeRequirementName(name).toLowerCase().replace(/\s+/g, ' ');
}

/** Per-line mask where `true` marks a line inside a fenced code block. */
function buildCodeFenceMask(lines: readonly string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  let active: { marker: string; length: number } | null = null;

  for (let index = 0; index < lines.length; index++) {
    if (!active) {
      const match = lines[index].match(/^\s*(`{3,}|~{3,})/);
      if (match) {
        active = { marker: match[1][0], length: match[1].length };
        mask[index] = true;
      }
      continue;
    }
    mask[index] = true;
    const close = lines[index].match(/^\s*(`{3,}|~{3,})\s*$/);
    if (close && close[1][0] === active.marker && close[1].length >= active.length) {
      active = null;
    }
  }

  return mask;
}

/** Split a raw requirement block into its header, body, and scenario blocks. */
function splitRawBlock(raw: string): DeltaRequirement {
  const lines = normalizeLineEndings(raw).split('\n');
  const header = lines[0]?.match(REQUIREMENT_HEADER_REGEX);
  if (!header) {
    throw new DeltaMergeError(`Invalid requirement block header: ${lines[0] ?? ''}`);
  }

  const name = normalizeRequirementName(header[1]);
  const scenarioStarts: number[] = [];
  for (let index = 1; index < lines.length; index++) {
    if (SCENARIO_HEADER_REGEX.test(lines[index])) {
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

  return { name, body, scenarios, raw: normalizeLineEndings(raw).trimEnd() };
}

/** Parse one `### Requirement:` block from its verbatim text. */
export function parseRequirement(raw: string): DeltaRequirement {
  return splitRawBlock(raw);
}

/** The scenario label a `####` header renders as. */
function scenarioNameAt(line: string): string {
  return line
    .replace(SCENARIO_PREFIX_REGEX, '')
    .replace(/[ \t]+#+[ \t]*$/, '')
    .replace(/^Scenario:\s*/i, '')
    .trim();
}

/** Parse one `#### Scenario:` block from its verbatim text. */
export function parseScenario(raw: string): DeltaScenario {
  const lines = normalizeLineEndings(raw).split('\n');
  const header = lines[0]?.match(SCENARIO_HEADER_REGEX);
  if (!header) {
    throw new DeltaMergeError(`Invalid scenario block header: ${lines[0] ?? ''}`);
  }

  const name = scenarioNameAt(lines[0]);
  const when: string[] = [];
  const then: string[] = [];
  for (const line of lines.slice(1)) {
    const whenMatch = line.match(/^-[ \t]+\*\*WHEN\*\*[ \t]*(.*)$/);
    if (whenMatch) {
      when.push(whenMatch[1].trim());
      continue;
    }
    const thenMatch = line.match(/^-[ \t]+\*\*THEN\*\*[ \t]*(.*)$/);
    if (thenMatch) {
      then.push(thenMatch[1].trim());
    }
  }

  return { name, when, then, raw: normalizeLineEndings(raw).trimEnd() };
}

/** The body of a `## Purpose` section, or undefined when it is absent or empty. */
export function extractPurposeSection(content: string): string | undefined {
  const lines = normalizeLineEndings(content).split('\n');
  const mask = buildCodeFenceMask(lines);
  const start = lines.findIndex((line, index) => !mask[index] && /^##\s+Purpose\s*$/i.test(line));
  if (start === -1) {
    return undefined;
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (!mask[index] && /^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  const body = lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
  return body || undefined;
}

/** Split a base spec into the slices OpenSpec rejoins after a merge. */
function extractRequirementsSection(content: string): RequirementSection {
  const normalized = normalizeLineEndings(content);
  const lines = normalized.split('\n');
  const fenceMask = buildCodeFenceMask(lines);
  const headerIndex = lines.findIndex(
    (line, index) => !fenceMask[index] && /^##\s+Requirements\s*$/i.test(line),
  );

  if (headerIndex === -1) {
    const before = content.trimEnd();
    return {
      before: before ? `${before}\n\n` : '',
      headerLine: '## Requirements',
      preamble: '',
      bodyBlocks: [],
      after: '\n',
    };
  }

  let endIndex = lines.length;
  for (let index = headerIndex + 1; index < lines.length; index++) {
    if (!fenceMask[index] && /^##\s+/.test(lines[index])) {
      endIndex = index;
      break;
    }
  }

  const before = lines.slice(0, headerIndex).join('\n');
  const bodyLines = lines.slice(headerIndex + 1, endIndex);
  const bodyMask = fenceMask.slice(headerIndex + 1, endIndex);
  const bodyBlocks = parseBlocks(bodyLines, bodyMask);

  const preambleLines: string[] = [];
  let cursor = 0;
  while (cursor < bodyLines.length && !isRequirementHeader(bodyLines, bodyMask, cursor)) {
    preambleLines.push(bodyLines[cursor]);
    cursor++;
  }

  const rawAfter = lines.slice(endIndex).join('\n');
  return {
    before: before.trimEnd() ? `${before}\n` : before,
    headerLine: lines[headerIndex],
    preamble: preambleLines.join('\n').trimEnd(),
    bodyBlocks,
    after: rawAfter.startsWith('\n') ? rawAfter : `\n${rawAfter}`,
  };
}

function isRequirementHeader(
  lines: readonly string[],
  mask: readonly boolean[],
  index: number,
): boolean {
  return !mask[index] && REQUIREMENT_HEADER_REGEX.test(lines[index]);
}

function isTopLevelHeader(
  lines: readonly string[],
  mask: readonly boolean[],
  index: number,
): boolean {
  return !mask[index] && /^##\s+/.test(lines[index]);
}

/** Collect verbatim `### Requirement:` blocks from an already-sliced section body. */
function parseBlocks(lines: readonly string[], mask: readonly boolean[]): RequirementBlock[] {
  const blocks: RequirementBlock[] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    while (cursor < lines.length && !isRequirementHeader(lines, mask, cursor)) {
      cursor++;
    }
    if (cursor >= lines.length) {
      break;
    }

    const headerLine = lines[cursor];
    const match = headerLine.match(REQUIREMENT_HEADER_REGEX);
    if (!match) {
      cursor++;
      continue;
    }

    const buffer = [headerLine];
    cursor++;
    while (
      cursor < lines.length &&
      !isRequirementHeader(lines, mask, cursor) &&
      !isTopLevelHeader(lines, mask, cursor)
    ) {
      buffer.push(lines[cursor]);
      cursor++;
    }

    blocks.push({
      headerLine,
      name: normalizeRequirementName(match[1]),
      raw: buffer.join('\n').trimEnd(),
    });
  }

  return blocks;
}

/** Every `## ` section, keyed by its spelled title and in document order. */
function splitTopLevelSections(
  lines: readonly string[],
  mask: readonly boolean[],
): { title: string; lines: string[]; mask: boolean[] }[] {
  const indices: { title: string; index: number }[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (mask[index]) {
      continue;
    }
    const match = lines[index].match(TOP_LEVEL_SECTION_REGEX);
    if (match) {
      indices.push({ title: match[1].trim(), index });
    }
  }

  return indices.map((current, position) => {
    const end = position + 1 < indices.length ? indices[position + 1].index : lines.length;
    return {
      title: current.title,
      lines: lines.slice(current.index + 1, end),
      mask: mask.slice(current.index + 1, end),
    };
  });
}

/** Every section body whose title folds to `desired`, in document order. */
function getSectionBodies(
  sections: readonly { title: string; lines: string[]; mask: boolean[] }[],
  desired: string,
): { lines: string[]; mask: boolean[] }[] {
  const target = desired.toLowerCase();
  return sections.filter((section) => section.title.toLowerCase() === target);
}

function parseRequirementSection(
  sections: readonly { title: string; lines: string[]; mask: boolean[] }[],
  desired: string,
): DeltaRequirement[] {
  return getSectionBodies(sections, desired)
    .flatMap((body) => parseBlocks(body.lines, body.mask))
    .map((block) => splitRawBlock(block.raw));
}

/**
 * Requirement names listed under `## REMOVED Requirements`: a plain
 * `### Requirement:` header or a bullet carrying one.
 */
function parseRemovedNames(
  sections: readonly { lines: string[]; mask: boolean[] }[],
): DeltaRequirement[] {
  const removed: DeltaRequirement[] = [];
  for (const body of sections) {
    for (let index = 0; index < body.lines.length; index++) {
      if (body.mask[index]) {
        continue;
      }
      const line = body.lines[index];
      const header = line.match(REQUIREMENT_HEADER_REGEX);
      if (header) {
        removed.push({
          name: normalizeRequirementName(header[1]),
          body: '',
          scenarios: [],
          raw: '',
        });
        continue;
      }
      const bullet = line.match(REMOVED_BULLET_REGEX);
      if (bullet) {
        removed.push({
          name: normalizeRequirementName(bullet[1]),
          body: '',
          scenarios: [],
          raw: '',
        });
      }
    }
  }
  return removed;
}

interface RenameScan {
  readonly renamed: DeltaRename[];
  readonly invalid: InvalidRename[];
  readonly unpaired: UnpairedRename[];
}

/** Read RENAMED entries, recording every entry that is not in the header form. */
function parseRenamedSection(
  sections: readonly { lines: string[]; mask: boolean[] }[],
): RenameScan {
  const renamed: DeltaRename[] = [];
  const invalid: InvalidRename[] = [];
  const unpaired: UnpairedRename[] = [];
  let pending: string | null = null;

  for (const body of sections) {
    for (let index = 0; index < body.lines.length; index++) {
      if (body.mask[index]) {
        continue;
      }
      const line = body.lines[index];
      const from = line.match(RENAME_FROM_REGEX);
      const to = line.match(RENAME_TO_REGEX);

      if (from) {
        if (pending !== null) {
          unpaired.push({ side: 'FROM', name: pending });
        }
        pending = normalizeRequirementName(from[1]);
        continue;
      }

      if (to) {
        if (pending === null) {
          unpaired.push({ side: 'TO', name: normalizeRequirementName(to[1]) });
          continue;
        }
        renamed.push({ from: pending, to: normalizeRequirementName(to[1]) });
        pending = null;
        continue;
      }

      if (ANY_RENAME_REGEX.test(line)) {
        invalid.push({ line: line.trim() });
      }
    }

    if (pending !== null) {
      unpaired.push({ side: 'FROM', name: pending });
      pending = null;
    }
  }

  return { renamed, invalid, unpaired };
}

/** Parse a delta document into its operations and purpose. */
export function parseDelta(content: string): ParsedDelta {
  const normalized = normalizeLineEndings(content);
  const titleMatch = normalized.match(/^#[ \t]+(.*)$/m);
  const rawTitle = titleMatch ? titleMatch[1].trim() : '';
  const title = rawTitle.replace(/^Spec Delta[ \t]*:[ \t]*/i, '').trim();

  const lines = normalized.split('\n');
  const mask = buildCodeFenceMask(lines);
  const sections = splitTopLevelSections(lines, mask);
  const renamed = parseRenamedSection(getSectionBodies(sections, 'RENAMED Requirements'));

  return {
    title,
    purpose: extractPurposeSection(normalized) ?? '',
    added: parseRequirementSection(sections, 'ADDED Requirements'),
    modified: parseRequirementSection(sections, 'MODIFIED Requirements'),
    removed: parseRemovedNames(getSectionBodies(sections, 'REMOVED Requirements')),
    renamed: renamed.renamed,
    invalidRenames: renamed.invalid,
    unpairedRenames: renamed.unpaired,
  };
}

/** Parse a living capability spec into its title, purpose, and requirements. */
export function parseCapabilitySpec(content: string): CapabilitySpec {
  const normalized = normalizeLineEndings(content);
  const titleMatch = normalized.match(/^#[ \t]+(.*)$/m);
  const section = extractRequirementsSection(normalized);

  return {
    title: titleMatch ? titleMatch[1].trim() : '',
    purpose: extractPurposeSection(normalized) ?? '',
    requirements: section.bodyBlocks.map((block) => splitRawBlock(block.raw)),
  };
}

/** Serialize a capability spec back to the shape OpenSpec writes. */
export function serializeCapabilitySpec(spec: CapabilitySpec): string {
  const lines = [`# ${spec.title}`, '', '## Purpose'];
  if (spec.purpose) {
    lines.push(spec.purpose);
  }
  lines.push('', '## Requirements');
  if (spec.requirements.length > 0) {
    lines.push('', spec.requirements.map((requirement) => requirement.raw).join('\n\n'));
  }
  return `${lines.join('\n')}\n`;
}

function buildSpecSkeleton(capability: string, purpose: string): string {
  const body =
    purpose.trim() || `${PURPOSE_PLACEHOLDER_PREFIX}${capability}${PURPOSE_PLACEHOLDER_SUFFIX}`;
  return `# ${capability} Specification\n\n## Purpose\n${body}\n\n## Requirements\n`;
}

function collapseBlankRunsOutsideFences(content: string): string {
  const lines = content.split('\n');
  const mask = buildCodeFenceMask(lines);
  const kept: string[] = [];
  let blankRun = 0;
  for (let index = 0; index < lines.length; index++) {
    if (mask[index]) {
      blankRun = 0;
      kept.push(lines[index]);
      continue;
    }
    if (lines[index] === '') {
      blankRun++;
      if (blankRun > 1) continue;
      kept.push(lines[index]);
      continue;
    }
    blankRun = 0;
    kept.push(lines[index]);
  }
  return kept.join('\n');
}

/** Scenario names of a verbatim requirement block, multiplicity preserved. */
function scenarioNames(raw: string): string[] {
  const lines = normalizeLineEndings(raw).split('\n');
  const mask = buildCodeFenceMask(lines);
  const names: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (!mask[index] && SCENARIO_HEADER_REGEX.test(lines[index])) {
      names.push(scenarioNameAt(lines[index]));
    }
  }
  return names;
}

/** Names present in `current` more often than in `incoming`. */
function missingScenarioNames(currentRaw: string, incomingRaw: string): string[] {
  const remaining = new Map<string, number>();
  for (const name of scenarioNames(incomingRaw)) {
    remaining.set(name, (remaining.get(name) ?? 0) + 1);
  }
  const missing: string[] = [];
  for (const name of scenarioNames(currentRaw)) {
    const count = remaining.get(name) ?? 0;
    if (count > 0) {
      remaining.set(name, count - 1);
    } else {
      missing.push(name);
    }
  }
  return missing;
}

/** Refuse malformed RENAMED entries and duplicate names within one section. */
function validateDelta(delta: ParsedDelta, capability: string): void {
  if (delta.invalidRenames.length > 0) {
    const entry = delta.invalidRenames[0].line;
    throw new DeltaMergeError(
      `${capability} RENAMED failed - entry "${entry}" is not in the expected form. Write each rename as "- FROM: \`### Requirement: X\`" followed by "- TO: \`### Requirement: Y\`".`,
    );
  }

  for (const rename of delta.unpairedRenames) {
    const missingSide = rename.side === 'FROM' ? 'TO' : 'FROM';
    throw new DeltaMergeError(
      `${capability} RENAMED failed for header "### Requirement: ${rename.name}" - no matching ${missingSide}`,
    );
  }

  const seen = new Set<string>();
  for (const requirement of delta.added) {
    const key = normalizeRequirementName(requirement.name);
    if (seen.has(key)) {
      throw new DeltaMergeError(
        `${capability} ADDED failed for header "### Requirement: ${requirement.name}" - duplicate requirement in ADDED`,
      );
    }
    seen.add(key);
  }
}

function applyRenames(context: MergeContext, renames: readonly DeltaRename[]): void {
  for (const rename of renames) {
    const from = normalizeRequirementName(rename.from);
    const to = normalizeRequirementName(rename.to);
    if (!context.blocks.has(from)) {
      throw new DeltaMergeError(
        `${context.capability} RENAMED failed for header "### Requirement: ${rename.from}" - source not found`,
      );
    }
    if (context.blocks.has(to)) {
      throw new DeltaMergeError(
        `${context.capability} RENAMED failed for header "### Requirement: ${rename.to}" - target already exists`,
      );
    }
    const block = context.blocks.get(from) as RequirementBlock;
    const rawLines = block.raw.split('\n');
    rawLines[0] = `### Requirement: ${to}`;
    context.blocks.delete(from);
    context.blocks.set(to, { headerLine: rawLines[0], name: to, raw: rawLines.join('\n') });
    const index = context.order.indexOf(from);
    if (index >= 0) {
      context.order[index] = to;
    }
  }
}

function applyRemovals(context: MergeContext, removed: readonly DeltaRequirement[]): void {
  for (const requirement of removed) {
    const key = normalizeRequirementName(requirement.name);
    if (!context.blocks.has(key)) {
      throw new DeltaMergeError(
        `Cannot apply REMOVED: requirement "${requirement.name}" not found in base spec`,
      );
    }
    context.blocks.delete(key);
  }
}

function applyModifications(context: MergeContext, modified: readonly DeltaRequirement[]): void {
  for (const requirement of modified) {
    const key = normalizeRequirementName(requirement.name);
    const current = context.blocks.get(key);
    if (!current) {
      throw new DeltaMergeError(
        `Cannot apply MODIFIED: requirement "${requirement.name}" not found in base spec`,
      );
    }
    const missing = missingScenarioNames(current.raw, requirement.raw);
    if (missing.length > 0) {
      const names = missing.map((name) => `"${name}"`).join(', ');
      throw new DeltaMergeError(
        `${context.capability} MODIFIED failed for header "### Requirement: ${requirement.name}" - current spec contains scenario(s) not present in the modified block: ${names}. Refresh the change spec before archiving to avoid dropping scenarios.`,
      );
    }
    context.blocks.set(key, {
      headerLine: current.headerLine,
      name: key,
      raw: normalizeLineEndings(requirement.raw).trimEnd(),
    });
  }
}

function applyAdditions(context: MergeContext, added: readonly DeltaRequirement[]): void {
  for (const requirement of added) {
    const key = normalizeRequirementName(requirement.name);
    const existing = context.blocks.get(key);
    if (existing) {
      if (normalizeBlockRaw(existing.raw) === normalizeBlockRaw(requirement.raw)) {
        continue;
      }
      throw new DeltaMergeError(
        `${context.capability} ADDED failed for header "### Requirement: ${requirement.name}" - already exists`,
      );
    }
    const nearMiss = [...context.blocks.keys()].find(
      (candidate) => foldRequirementName(candidate) === foldRequirementName(key),
    );
    if (nearMiss !== undefined) {
      throw new DeltaMergeError(
        `${context.capability} ADDED failed for header "### Requirement: ${requirement.name}" - a requirement differing only in case or spacing already exists`,
      );
    }
    context.blocks.set(key, {
      headerLine: `### Requirement: ${requirement.name}`,
      name: key,
      raw: normalizeLineEndings(requirement.raw).trimEnd(),
    });
  }
}

interface MergeContext {
  readonly capability: string;
  readonly blocks: Map<string, RequirementBlock>;
  readonly order: string[];
}

function recompose(parts: RequirementSection, context: MergeContext): string {
  const kept: RequirementBlock[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < parts.bodyBlocks.length; index++) {
    const key = context.order[index];
    const replacement = context.blocks.get(key);
    if (replacement) {
      kept.push(replacement);
      seen.add(key);
    }
  }
  for (const [key, block] of context.blocks.entries()) {
    if (!seen.has(key)) {
      kept.push(block);
    }
  }

  const preamble = parts.preamble?.trim() ? parts.preamble.trimEnd() : '';
  const body = [preamble]
    .filter(Boolean)
    .concat(kept.map((block) => block.raw))
    .join('\n\n')
    .trimEnd();

  return `${collapseBlankRunsOutsideFences(
    [parts.before.trimEnd(), parts.headerLine, body, parts.after.trim()]
      .filter((slice) => slice !== '')
      .join('\n\n'),
  ).trimEnd()}\n`;
}

/**
 * Merge a parsed delta into a base capability spec. When `baseContent` is null
 * or empty, a new capability spec is created from the delta's Purpose.
 */
export function mergeDelta(
  baseContent: string | null,
  capability: string,
  delta: ParsedDelta,
): string {
  validateDelta(delta, capability);

  const hasBase = typeof baseContent === 'string' && baseContent.trim() !== '';
  if (!hasBase && delta.modified.length > 0) {
    throw new DeltaMergeError(
      `Cannot apply MODIFIED: requirement "${delta.modified[0].name}" not found in base spec`,
    );
  }
  if (!hasBase && delta.renamed.length > 0) {
    throw new DeltaMergeError(
      `Cannot apply RENAMED: requirement "${delta.renamed[0].from}" not found in base spec`,
    );
  }

  const target = hasBase ? (baseContent as string) : buildSpecSkeleton(capability, delta.purpose);
  const parts = extractRequirementsSection(target);
  const context: MergeContext = {
    capability,
    blocks: new Map(parts.bodyBlocks.map((block) => [block.name, block])),
    order: parts.bodyBlocks.map((block) => block.name),
  };

  applyRenames(context, delta.renamed);
  // A new spec has nothing to remove; OpenSpec ignores the operation.
  if (hasBase) {
    applyRemovals(context, delta.removed);
  }
  applyModifications(context, delta.modified);
  applyAdditions(context, delta.added);

  return recompose(parts, context);
}
