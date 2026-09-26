/**
 * Function ranges for mutation checks: each top-level function's range, the
 * ranges a covered function's mutants may touch, and a function's own hash.
 * A line-based scan is used; no TypeScript parser is involved.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveScope } from '../run/scope.js';
import { scanSource } from './tag-scan.js';

/** A top-level function declaration and its line range. */
export interface TopLevelFunction {
  readonly file: string;
  readonly name: string;
  /** 1-based declaration line. */
  readonly line: number;
  /** 1-based last line of the range. */
  readonly endLine: number;
  readonly exported: boolean;
  /** False when the range text's `(`, `[`, and `{` do not balance. */
  readonly known: boolean;
}

const FUNCTION_DECL = /^(export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/;
const CONST_DECL =
  /^(export\s+)?const\s+([A-Za-z_$][\w$]*)(?::(?:=>|[^=])*)?\s*=\s*(?:async\s*)?(?:function\b|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/;
const JS_TS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

/** The declaration a column-0 line opens, or null. */
function declaration(line: string): { name: string; exported: boolean } | null {
  const match = FUNCTION_DECL.exec(line) ?? CONST_DECL.exec(line);
  return match === null ? null : { name: match[2] ?? '', exported: match[1] !== undefined };
}

function isRangeBoundary(line: string): boolean {
  if (line === '') return false;
  const first = line[0] ?? '';
  if (first === ' ' || first === '\t' || first === '\r') return false;
  return first !== '}' && first !== ')' && first !== ']' && first !== ';';
}

function lastNonBlank(lines: readonly string[], start: number, end: number): number {
  for (let index = end; index >= start; index -= 1) {
    if ((lines[index] ?? '').trim() !== '') return index;
  }
  return start;
}

function endLineFor(lines: readonly string[], start: number): number {
  for (let index = start + 1; index < lines.length; index += 1) {
    if (isRangeBoundary(lines[index] ?? '')) return lastNonBlank(lines, start, index - 1) + 1;
  }
  return lastNonBlank(lines, start, lines.length - 1) + 1;
}

function skipLine(text: string, at: number): number {
  const end = text.indexOf('\n', at);
  return end === -1 ? text.length : end;
}
function skipBlock(text: string, at: number): number {
  const end = text.indexOf('*/', at + 2);
  return end === -1 ? text.length : end + 2;
}
function skipQuoted(text: string, at: number, quote: string): number {
  let index = at + 1;
  while (index < text.length && text[index] !== quote) index += text[index] === '\\' ? 2 : 1;
  return index < text.length ? index + 1 : text.length;
}
function skipTemplate(text: string, at: number): number {
  let index = at + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\') index += 2;
    else if (char === '`') return index + 1;
    else if (char === '$' && text[index + 1] === '{') index = skipInterpolation(text, index + 2);
    else index += 1;
  }
  return text.length;
}
function skipInterpolation(text: string, at: number): number {
  let depth = 1;
  let index = at;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\') index += 2;
    else if (char === '`') index = skipTemplate(text, index);
    else if (char === "'" || char === '"') index = skipQuoted(text, index, char);
    else if (char === '/' && text[index + 1] === '/') index = skipLine(text, index);
    else if (char === '/' && text[index + 1] === '*') index = skipBlock(text, index);
    else if (char === '{') {
      depth += 1;
      index += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
      index += 1;
    } else {
      index += 1;
    }
  }
  return text.length;
}

const isIdent = (char: string | undefined): boolean => char !== undefined && /[\w$]/.test(char);

/** Balance delimiters and collect `name(` calls in one pass, skipping literals and comments. */
function scanCode(
  text: string,
  candidates: readonly string[],
): { balanced: boolean; called: Set<string> } {
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  const called = new Set<string>();
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '/' && text[index + 1] === '/') {
      index = skipLine(text, index);
      continue;
    }
    if (char === '/' && text[index + 1] === '*') {
      index = skipBlock(text, index);
      continue;
    }
    if (char === "'" || char === '"') {
      index = skipQuoted(text, index, char);
      continue;
    }
    if (char === '`') {
      index = skipTemplate(text, index);
      continue;
    }
    if (!isIdent(text[index - 1])) {
      for (const name of candidates) {
        if (!text.startsWith(name, index) || isIdent(text[index + name.length])) continue;
        let after = index + name.length;
        while (text[after] === ' ' || text[after] === '\t') after += 1;
        // A second `(` directly after the call's `(` is a parenthesized first
        // argument; the traceability scenarios count only simple calls.
        if (text[after] !== '(' || text[after + 1] === '(') continue;
        called.add(name);
        break;
      }
    }
    if (char === '(') paren += 1;
    else if (char === ')') paren -= 1;
    else if (char === '[') bracket += 1;
    else if (char === ']') bracket -= 1;
    else if (char === '{') brace += 1;
    else if (char === '}') brace -= 1;
    if (paren < 0 || bracket < 0 || brace < 0) return { balanced: false, called };
    index += 1;
  }
  return { balanced: paren === 0 && bracket === 0 && brace === 0, called };
}

/** Every top-level function in `text`, in declaration order. */
export function findTopLevelFunctions(file: string, text: string): TopLevelFunction[] {
  const lines = text.split('\n');
  const functions: TopLevelFunction[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const decl = declaration(lines[index] ?? '');
    if (decl === null) continue;
    const endLine = endLineFor(lines, index);
    const body = lines.slice(index, endLine).join('\n');
    functions.push({
      file,
      name: decl.name,
      line: index + 1,
      endLine,
      exported: decl.exported,
      known: scanCode(body, []).balanced,
    });
  }
  return functions;
}
/** The exact range text of one function. */
function rangeText(text: string, fn: TopLevelFunction): string {
  const lines = text.split('\n');
  return lines.slice(fn.line - 1, fn.endLine).join('\n');
}
function hashText(text: string): string {
  return `sha256:${crypto.createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

/**
 * A covered function's mutation ranges: its own range plus the range of every
 * non-exported top-level function in the same file it reaches through such
 * functions. Sorted by start line and written `<file>:<start>-<end>`. Unknown
 * when the function or any range is not known.
 */
export function mutationRanges(file: string, text: string, name: string): string[] | null {
  const functions = findTopLevelFunctions(file, text);
  const target = functions.find((fn) => fn.name === name);
  if (target === undefined) return null;
  const byName = new Map(functions.filter((fn) => !fn.exported).map((fn) => [fn.name, fn]));
  const candidates = [...byName.keys()];
  const selected = new Map<number, TopLevelFunction>([[target.line, target]]);
  const queue: TopLevelFunction[] = [target];
  while (queue.length > 0) {
    const current = queue.shift() as TopLevelFunction;
    for (const callee of scanCode(rangeText(text, current), candidates).called) {
      const fn = byName.get(callee);
      if (fn === undefined || selected.has(fn.line)) continue;
      selected.set(fn.line, fn);
      queue.push(fn);
    }
  }
  const ranges = [...selected.values()].sort((a, b) => a.line - b.line);
  if (ranges.some((fn) => !fn.known)) return null;
  return ranges.map((fn) => `${file}:${fn.line}-${fn.endLine}`);
}

/** `sha256:` of a function's own range text, or null when it is absent or unknown. */
export function hashFunctionRange(file: string, text: string, name: string): string | null {
  const fn = findTopLevelFunctions(file, text).find((entry) => entry.name === name);
  return fn === undefined || !fn.known ? null : hashText(rangeText(text, fn));
}

/**
 * The `functionHashes` baseline: for each exported function with a `@scenario`
 * tag in a scoped JavaScript or TypeScript file, `<file>#<name>` to the hash of
 * its own range, or null when that range is unknown.
 */
export async function readScopedFunctionHashes(
  projectRoot: string,
  scope: readonly string[],
): Promise<Record<string, string | null>> {
  const hashes: Record<string, string | null> = {};
  for (const entry of await resolveScope(projectRoot, scope)) {
    if (entry.absolutePath === null || !JS_TS.has(path.extname(entry.relativePath))) continue;
    const text = await fs.readFile(entry.absolutePath, 'utf8').catch(() => null);
    if (text === null) continue;
    const tagged = scanSource(entry.relativePath, text).functions.filter(
      (fn) => fn.scenarios.length > 0,
    );
    if (tagged.length === 0) continue;
    const ranges = findTopLevelFunctions(entry.relativePath, text);
    for (const fn of tagged) {
      const match = ranges.find((range) => range.name === fn.name);
      hashes[`${entry.relativePath}#${fn.name}`] = match?.known
        ? hashText(rangeText(text, match))
        : null;
    }
  }
  return hashes;
}
