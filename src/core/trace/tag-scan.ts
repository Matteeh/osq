/**
 * The tag and scenario call scanner. It reads one file's text with regular
 * expressions over lines, never a TypeScript parser, which would be a fifth
 * runtime dependency.
 */

/** One scenario a function serves, from a `@scenario` tag. */
export interface TaggedScenario {
  readonly capability: string;
  readonly name: string;
}

/** One exported function the scanner reads, with its tags. */
export interface ScannedFunction {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly scenarios: readonly TaggedScenario[];
  readonly adrs: readonly string[];
}

/** One readable `scenario(...)` call in a scenario test file. */
export interface ScenarioCall {
  readonly file: string;
  readonly line: number;
  readonly capability: string;
  readonly name: string;
  readonly covers: string;
}

/** A tag or scenario call the scanner cannot read, with its 1-based line. */
export interface UnreadableForm {
  readonly file: string;
  readonly line: number;
  readonly reason: string;
  /** The call's literal capability, present only when that much was readable. */
  readonly capability?: string;
}

/** Everything one source file yields. */
export interface TagScan {
  readonly scenarioTestFile: boolean;
  readonly functions: readonly ScannedFunction[];
  readonly calls: readonly ScenarioCall[];
  readonly unreadable: readonly UnreadableForm[];
}

const UNATTACHED = 'tag is not attached to an exported function';
const BAD_TAG = 'tag is not a valid @scenario or @adr';
const BAD_SCENARIO = '@scenario is not "<capability>: <name>"';
const BAD_ADR = '@adr has no digits';
const BAD_CAPABILITY = 'scenario call capability is not a literal';
const BAD_NAME = 'scenario call name is not a literal';
const BAD_COVERS = 'scenario call covers is not an identifier';
const ALIASED_IMPORT = 'scenario is imported under another name';
const FUNCTION_DECL = /^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/;
const CONST_DECL =
  /^\s*export\s+const\s+([A-Za-z_$][\w$]*)(?::(?:=>|[^=])*)?\s*=\s*(?:async\s*)?(?:function\b|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/;

/** The exported function a declaration line names, or null. */
function declarationName(line: string | undefined): string | null {
  if (line === undefined) return null;
  return (FUNCTION_DECL.exec(line) ?? CONST_DECL.exec(line))?.[1] ?? null;
}

/** True when a trimmed comment line holds a tag. */
function isTagLike(trimmed: string): boolean {
  const comment = trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
  return comment && (trimmed.includes('@scenario') || trimmed.includes('@adr'));
}

/** A comment line's text with its markers stripped. */
function cleanTagText(trimmed: string): string {
  return trimmed
    .replace(/^(?:\/\*+|\/\/|\*+)/, '')
    .replace(/\*\/\s*$/, '')
    .trim();
}

type ParsedTag =
  | { readonly kind: 'scenario'; readonly capability: string; readonly name: string }
  | { readonly kind: 'adr'; readonly number: string }
  | { readonly kind: 'bad'; readonly reason: string };

/** One `@scenario` or `@adr` line, or how it is unreadable. */
function parseTag(text: string): ParsedTag {
  if (text.startsWith('@scenario')) {
    const rest = text.slice('@scenario'.length).trim();
    const colon = rest.indexOf(':');
    const capability = colon === -1 ? '' : rest.slice(0, colon).trim();
    const name = colon === -1 ? '' : rest.slice(colon + 1).trim();
    if (capability === '' || name === '') return { kind: 'bad', reason: BAD_SCENARIO };
    return { kind: 'scenario', capability, name };
  }
  if (text.startsWith('@adr')) {
    const rest = text.slice('@adr'.length).trim();
    if (!/^\d+$/.test(rest)) return { kind: 'bad', reason: BAD_ADR };
    return { kind: 'adr', number: rest };
  }
  return { kind: 'bad', reason: BAD_TAG };
}

type TagsByLine = Map<number, { scenarios: TaggedScenario[]; adrs: string[] }>;

/** Read every comment, attaching tags to the declaration below a doc comment. */
function collectTags(file: string, text: string, unreadable: UnreadableForm[]): TagsByLine {
  const lines = text.split('\n');
  const tags: TagsByLine = new Map();
  let block: { kind: 'doc' | 'plain'; tagLines: { line: number; text: string }[] } | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? '').trim();
    if (block === null) {
      if (trimmed.startsWith('/**')) block = { kind: 'doc', tagLines: [] };
      else if (trimmed.startsWith('/*')) block = { kind: 'plain', tagLines: [] };
      else if (trimmed.startsWith('//')) {
        if (isTagLike(trimmed)) {
          unreadable.push(unreadableForm(file, index + 1, parseTag(cleanTagText(trimmed))));
        }
        continue;
      } else continue;
    }
    if (isTagLike(trimmed)) block.tagLines.push({ line: index + 1, text: trimmed });
    if (!trimmed.includes('*/')) continue;
    const attached = block.kind === 'doc' && declarationName(lines[index + 1]) !== null;
    const accumulator = tags.get(index + 2) ?? { scenarios: [], adrs: [] };
    for (const tagLine of block.tagLines) {
      const tag = parseTag(cleanTagText(tagLine.text));
      if (attached && tag.kind === 'scenario') {
        accumulator.scenarios.push({ capability: tag.capability, name: tag.name });
      } else if (attached && tag.kind === 'adr') {
        accumulator.adrs.push(tag.number);
      } else {
        unreadable.push(unreadableForm(file, tagLine.line, tag));
      }
    }
    if (attached) tags.set(index + 2, accumulator);
    block = null;
  }
  return tags;
}

/** A tag line's unreadable form. */
function unreadableForm(file: string, line: number, tag: ParsedTag): UnreadableForm {
  return { file, line, reason: tag.kind === 'bad' ? tag.reason : UNATTACHED };
}

/** Every exported function in the documented forms, with the tags attached to it. */
function scanFunctions(file: string, text: string, tags: TagsByLine): ScannedFunction[] {
  const functions: ScannedFunction[] = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const name = declarationName(lines[index]);
    if (name === null) continue;
    const attached = tags.get(index + 1);
    functions.push({
      file,
      line: index + 1,
      name,
      scenarios: attached?.scenarios ?? [],
      adrs: attached?.adrs ?? [],
    });
  }
  return functions;
}

/** The 1-based line of a character offset. */
function lineOf(text: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index && position < text.length; position += 1) {
    if (text[position] === '\n') line += 1;
  }
  return line;
}

const CALL_START = /\bscenario\s*\(/g;
const READABLE_CALL =
  /\bscenario\s*\(\s*(['"])((?:[^\\])*?)\1\s*,\s*(['"])((?:[^\\])*?)\3\s*,\s*\{\s*covers\s*:\s*([A-Za-z_$][\w$]*)\s*(?:\}|,)/g;
const COVERS = /^\s*\{\s*covers\s*:\s*([A-Za-z_$][\w$]*)\s*(?:\}|,)/;

/** Why a `scenario(` call could not be read, naming the argument that isn't a literal. */
function callReason(text: string, start: number): string {
  const after = text.slice(start);
  const first = /^\s*(['"])((?:[^\\])*?)\1\s*,\s*/.exec(after);
  if (first === null) return BAD_CAPABILITY;
  const rest = after.slice(first[0].length);
  const second = /^\s*(['"])((?:[^\\])*?)\1\s*,\s*/.exec(rest);
  if (second === null) return BAD_NAME;
  return COVERS.test(rest.slice(second[0].length)) ? BAD_TAG : BAD_COVERS;
}

/** Read every `scenario(` call, recording the unreadable ones. */
function scanScenarioCalls(
  file: string,
  text: string,
  calls: ScenarioCall[],
  unreadable: UnreadableForm[],
): void {
  const readable = new Set<number>();
  for (const match of text.matchAll(READABLE_CALL)) {
    const index = match.index ?? 0;
    readable.add(index);
    calls.push({
      file,
      line: lineOf(text, index),
      capability: match[2] ?? '',
      name: match[4] ?? '',
      covers: match[5] ?? '',
    });
  }
  for (const match of text.matchAll(CALL_START)) {
    const index = match.index ?? 0;
    if (readable.has(index)) continue;
    const start = index + match[0].length;
    const capability = /^\s*(['"])((?:[^\\])*?)\1/.exec(text.slice(start))?.[2];
    unreadable.push({
      file,
      line: lineOf(text, index),
      reason: callReason(text, start),
      capability: capability ?? undefined,
    });
  }
}
const TESTING_IMPORT = /(?:from\s*|require\s*\(\s*|import\s*\(\s*)['"]@matteeh\/osq\/testing['"]/;
const NAMED_TESTING_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]@matteeh\/osq\/testing['"]/g;

/** True when the file imports the testing helper; record an aliased `scenario` import. */
function scanTestingImport(file: string, text: string, unreadable: UnreadableForm[]): boolean {
  if (!TESTING_IMPORT.test(text)) return false;
  for (const match of text.matchAll(NAMED_TESTING_IMPORT)) {
    for (const part of (match[1] ?? '').split(',')) {
      const alias = /^\s*scenario\s+as\s+([A-Za-z_$][\w$]*)\s*$/.exec(part);
      if (alias !== null && alias[1] !== 'scenario') {
        unreadable.push({ file, line: lineOf(text, match.index ?? 0), reason: ALIASED_IMPORT });
      }
    }
  }
  return true;
}

/** Scan one file's text for exported functions with tags, scenario calls, and unreadable forms. */
export function scanSource(file: string, text: string): TagScan {
  const calls: ScenarioCall[] = [];
  const unreadable: UnreadableForm[] = [];
  const scenarioTestFile = scanTestingImport(file, text, unreadable);
  const tags = collectTags(file, text, unreadable);
  const functions = scanFunctions(file, text, tags);
  if (scenarioTestFile) scanScenarioCalls(file, text, calls, unreadable);
  return { scenarioTestFile, functions, calls, unreadable };
}
