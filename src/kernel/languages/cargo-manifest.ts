import type { ManifestRead } from './adapter.js';
const DEP_TABLES = new Set([
  'dependencies',
  'dev-dependencies',
  'build-dependencies',
  'dev_dependencies',
  'build_dependencies',
]);
const BARE_KEY = /[A-Za-z0-9_-]/;
const NO_STRING: ParsedValue = { text: null, packageName: null };
/** A cursor over the manifest text and its current 1-based line. */
interface Scanner {
  readonly text: string;
  i: number;
  line: number;
  failure: number;
}
/** One parsed value: its string text, and an inline table's `package` string. */
interface ParsedValue {
  readonly text: string | null;
  readonly packageName: string | null;
}
/** Record the line reading stopped on and fail. */
function fail(s: Scanner, line: number): null {
  s.failure = line;
  return null;
}
function advanceTo(s: Scanner, end: number): void {
  const limit = Math.min(end, s.text.length);
  for (; s.i < limit; s.i += 1) if (s.text.charCodeAt(s.i) === 10) s.line += 1;
}
/** Skip spaces and tabs; with `all`, also newlines and comments. */
function skip(s: Scanner, all: boolean): void {
  for (;;) {
    const ch = s.text[s.i];
    if (ch === ' ' || ch === '\t' || ch === '\r' || (all && ch === '\n')) advanceTo(s, s.i + 1);
    else if (all && ch === '#') {
      const newline = s.text.indexOf('\n', s.i);
      advanceTo(s, newline === -1 ? s.text.length : newline);
    } else return;
  }
}
/** True when the statement's line ends here, consuming a trailing comment. */
function atLineEnd(s: Scanner): boolean {
  skip(s, false);
  if (s.text[s.i] === '#') {
    const newline = s.text.indexOf('\n', s.i);
    advanceTo(s, newline === -1 ? s.text.length : newline);
  }
  return s.text[s.i] === undefined || s.text[s.i] === '\n';
}
function readString(s: Scanner, quote: string, escapes: boolean): string | null {
  advanceTo(s, s.i + 1);
  let out = '';
  while (s.i < s.text.length) {
    const ch = s.text[s.i];
    if (ch === '\n') return null;
    if (escapes && ch === '\\') {
      const next = s.text[s.i + 1];
      if (next === undefined || next === '\n') return null;
      advanceTo(s, s.i + 2);
      out += next;
      continue;
    }
    if (ch === quote) {
      advanceTo(s, s.i + 1);
      return out;
    }
    out += ch;
    s.i += 1;
  }
  return null;
}
function readKeys(s: Scanner): string[] | null {
  const segments: string[] = [];
  for (;;) {
    skip(s, false);
    const ch = s.text[s.i];
    let segment: string | null = null;
    if (ch === '"' || ch === "'") segment = readString(s, ch, ch === '"');
    else if (BARE_KEY.test(ch ?? '')) {
      const start = s.i;
      while (BARE_KEY.test(s.text[s.i] ?? '')) s.i += 1;
      segment = s.text.slice(start, s.i);
    }
    if (segment === null) return null;
    segments.push(segment);
    skip(s, false);
    if (s.text[s.i] !== '.') return segments;
    s.i += 1;
  }
}
function readValue(s: Scanner): ParsedValue | null {
  skip(s, false);
  const start = s.line;
  const ch = s.text[s.i];
  if (s.text.startsWith('"""', s.i) || s.text.startsWith("'''", s.i)) {
    const delim = s.text.startsWith('"""', s.i) ? '"""' : "'''";
    advanceTo(s, s.i + 3);
    const end = s.text.indexOf(delim, s.i);
    if (end === -1) return fail(s, start);
    advanceTo(s, end + 3);
    return NO_STRING;
  }
  if (ch === '"' || ch === "'") {
    const text = readString(s, ch, ch === '"');
    return text === null ? fail(s, start) : { text, packageName: null };
  }
  if (ch === '[') return readArray(s, start);
  if (ch === '{') return readTable(s, start);
  const from = s.i;
  while (s.i < s.text.length && !/[\s,\]}#]/.test(s.text[s.i])) s.i += 1;
  return s.i === from ? fail(s, start) : NO_STRING;
}
function closeArray(s: Scanner): ParsedValue {
  advanceTo(s, s.i + 1);
  return NO_STRING;
}
function readArray(s: Scanner, startLine: number): ParsedValue | null {
  advanceTo(s, s.i + 1);
  for (;;) {
    skip(s, true);
    if (s.i >= s.text.length) return fail(s, startLine);
    if (s.text[s.i] === ']') return closeArray(s);
    if (readValue(s) === null) return null;
    skip(s, true);
    const ch = s.text[s.i];
    if (ch === ',') s.i += 1;
    else if (ch === ']') return closeArray(s);
    else return fail(s, s.line);
  }
}
function closeTable(s: Scanner, packageName: string | null): ParsedValue {
  advanceTo(s, s.i + 1);
  return { text: null, packageName };
}
function readTable(s: Scanner, startLine: number): ParsedValue | null {
  advanceTo(s, s.i + 1);
  let packageName: string | null = null;
  for (;;) {
    skip(s, false);
    const ch = s.text[s.i];
    if (ch === undefined || ch === '\n') return fail(s, startLine);
    if (ch === '}') return closeTable(s, packageName);
    const keys = readKeys(s);
    if (keys === null || s.text[s.i] !== '=') return fail(s, startLine);
    s.i += 1;
    const value = readValue(s);
    if (value === null) return null;
    if (keys.length === 1 && keys[0] === 'package' && value.text !== null) packageName = value.text;
    skip(s, false);
    const next = s.text[s.i];
    if (next === '}') return closeTable(s, packageName);
    if (next !== ',') return fail(s, startLine);
    s.i += 1;
  }
}
function readHeader(s: Scanner): string[] | null {
  const startLine = s.line;
  s.i += 1;
  const array = s.text[s.i] === '[';
  if (array) s.i += 1;
  const path = readKeys(s);
  if (path === null || s.text[s.i] !== ']') return fail(s, startLine);
  s.i += 1;
  if (array && s.text[s.i] !== ']') return fail(s, startLine);
  if (array) s.i += 1;
  return atLineEnd(s) ? path : fail(s, startLine);
}
/** How many leading path segments name a dependency table, or 0. */
function dependencyDepth(path: readonly string[]): number {
  if (DEP_TABLES.has(path[0] ?? '')) return 1;
  if (path[0] === 'workspace' && path[1] === 'dependencies') return 2;
  if (path[0] === 'target' && DEP_TABLES.has(path[2] ?? '')) return 3;
  return 0;
}
/** Record the crate a header or a `key = value` line names, if any. */
function recordCrate(
  crates: Map<string, string>,
  path: readonly string[],
  value: ParsedValue | null,
): void {
  const depth = dependencyDepth(path);
  if (depth === 0 || path.length <= depth) return;
  const key = path.slice(0, depth + 1).join('\u0000');
  const isPackage = path.length === depth + 2 && path[depth + 1] === 'package';
  if (value === null) {
    if (!crates.has(key)) crates.set(key, path[depth]);
  } else if (isPackage && value.text !== null) crates.set(key, value.text);
  else if (value.packageName !== null) crates.set(key, value.packageName);
  else if (!crates.has(key)) crates.set(key, path[depth]);
}
function readEntry(s: Scanner, header: readonly string[], crates: Map<string, string>): boolean {
  const startLine = s.line;
  const keys = readKeys(s);
  if (keys === null || s.text[s.i] !== '=') {
    s.failure = startLine;
    return false;
  }
  advanceTo(s, s.i + 1);
  const value = readValue(s);
  if (value === null) return false;
  if (!atLineEnd(s)) {
    s.failure = startLine;
    return false;
  }
  recordCrate(crates, [...header, ...keys], value);
  return true;
}
function scanCrates(s: Scanner): string[] | null {
  const crates = new Map<string, string>();
  let header: readonly string[] = [];
  for (;;) {
    skip(s, true);
    if (s.i >= s.text.length) break;
    if (s.text[s.i] === '[') {
      const path = readHeader(s);
      if (path === null) return null;
      header = path;
      recordCrate(crates, path, null);
      continue;
    }
    if (!readEntry(s, header, crates)) return null;
  }
  return [...new Set(crates.values())].sort();
}
/**
 * The sorted, distinct crate names a `Cargo.toml` declares, or the line where
 * reading stopped.
 *
 * @scenario languages: Crates a manifest declares
 * @adr 017
 */
export function cargoManifestDependencies(content: string): ManifestRead {
  const s: Scanner = { text: content, i: 0, line: 1, failure: 1 };
  const names = scanCrates(s);
  return names === null
    ? { ok: false, error: `line ${s.failure}: cannot read this TOML` }
    : { ok: true, names };
}
