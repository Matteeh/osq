import type { LineRange } from './adapter.js';

/** One token the Rust module scanner keeps. */
interface Token {
  readonly kind: 'attr' | 'ident' | 'punct';
  readonly value: string;
  readonly line: number;
}

/** Whether a character code starts a Rust identifier. */
function isIdentStart(code: number): boolean {
  return code === 95 || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/** Whether a character code continues a Rust identifier. */
const isIdentPart = (code: number): boolean => isIdentStart(code) || (code >= 48 && code <= 57);

/** Skip a nested block comment and return the index after its end. */
function skipBlockComment(source: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < source.length) {
    if (source[i] === '/' && source[i + 1] === '*') {
      depth += 1;
      i += 2;
    } else if (source[i] === '*' && source[i + 1] === '/') {
      depth -= 1;
      i += 2;
      if (depth === 0) return i;
    } else {
      i += 1;
    }
  }
  return i;
}

/** Skip a quoted string, honouring escapes, and return the index after its end. */
function skipQuoted(source: string, start: number): number {
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === '\\') i += 2;
    else if (source[i] === '"') return i + 1;
    else i += 1;
  }
  return i;
}

/** A raw string's opening quote and hash count. */
type RawPrefix = { readonly quote: number; readonly hashes: number };

/** Read a raw string prefix at `start`, or null when there is none. */
function rawPrefixAt(source: string, start: number): RawPrefix | null {
  let i = start;
  if (source[i] === 'r') i += 1;
  else if (source[i] === 'b' && source[i + 1] === 'r') i += 2;
  else return null;
  let hashes = 0;
  while (source[i] === '#') {
    hashes += 1;
    i += 1;
  }
  return source[i] === '"' ? { quote: i, hashes } : null;
}

/** Skip a raw string and return the index after its closing hashes. */
function skipRaw(source: string, quote: number, hashes: number): number {
  const close = `"${'#'.repeat(hashes)}`;
  const end = source.indexOf(close, quote + 1);
  return end === -1 ? source.length : end + close.length;
}

/** Skip a char literal, or a lifetime's quote alone. */
function skipCharOrLifetime(source: string, start: number): number {
  const next = source[start + 1];
  if (next === '\\') {
    let i = start + 2;
    if (source[i] === 'x') i += 3;
    else if (source[i] === 'u' && source[i + 1] === '{') {
      const close = source.indexOf('}', i + 2);
      i = close === -1 ? source.length : close + 1;
    } else i += 1;
    return source[i] === "'" ? i + 1 : i;
  }
  if (next !== undefined && next !== '\n' && source[start + 2] === "'") return start + 3;
  return start + 1;
}

/** Skip an attribute, or return null when `#` starts none. */
function skipAttribute(source: string, start: number): number | null {
  let i: number;
  if (source[start + 1] === '[') i = start + 1;
  else if (source[start + 1] === '!' && source[start + 2] === '[') i = start + 2;
  else return null;
  let depth = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') {
      const newline = source.indexOf('\n', i + 2);
      i = newline === -1 ? source.length : newline;
    } else if (c === '/' && source[i + 1] === '*') i = skipBlockComment(source, i);
    else if (c === '"') i = skipQuoted(source, i);
    else if (c === "'") i = skipCharOrLifetime(source, i);
    else if (c === '[') {
      depth += 1;
      i += 1;
    } else if (c === ']') {
      depth -= 1;
      i += 1;
      if (depth === 0) return i;
    } else i += 1;
  }
  return source.length;
}

/** Turn Rust source into the attributes, identifiers and punctuation the parser needs. */
function scanTokens(source: string): Token[] {
  const tokens: Token[] = [];
  const length = source.length;
  let i = 0;
  let line = 1;
  const advance = (to: number): void => {
    const end = Math.min(to, length);
    while (i < end) {
      if (source.charCodeAt(i) === 10) line += 1;
      i += 1;
    }
  };

  while (i < length) {
    const c = source[i];
    const raw =
      (c === 'r' || c === 'b') && (c === 'r' || source[i + 1] === 'r')
        ? rawPrefixAt(source, i)
        : null;
    if (raw !== null) {
      advance(skipRaw(source, raw.quote, raw.hashes));
      continue;
    }
    if (c === '\n') {
      line += 1;
      i += 1;
    } else if (c === ' ' || c === '\t' || c === '\r') {
      i += 1;
    } else if (c === '/' && source[i + 1] === '/') {
      const newline = source.indexOf('\n', i + 2);
      advance(newline === -1 ? length : newline);
    } else if (c === '/' && source[i + 1] === '*') {
      advance(skipBlockComment(source, i));
    } else if (c === '"') {
      advance(skipQuoted(source, i));
    } else if (c === 'b' && source[i + 1] === '"') {
      advance(skipQuoted(source, i + 1));
    } else if (c === "'") {
      advance(skipCharOrLifetime(source, i));
    } else if (c === '#') {
      const end = skipAttribute(source, i);
      if (end === null) {
        i += 1;
      } else {
        tokens.push({ kind: 'attr', value: source.slice(i, end), line });
        advance(end);
      }
    } else if (isIdentStart(source.charCodeAt(i))) {
      let j = i + 1;
      while (j < length && isIdentPart(source.charCodeAt(j))) j += 1;
      tokens.push({ kind: 'ident', value: source.slice(i, j), line });
      advance(j);
    } else if ('{}[];()'.includes(c)) {
      tokens.push({ kind: 'punct', value: c, line });
      i += 1;
    } else {
      i += 1;
    }
  }
  return tokens;
}

/** Whether a token is exactly the `#[cfg(test)]` attribute, whitespace ignored. */
function isCfgTest(token: Token): boolean {
  return token.kind === 'attr' && token.value.replace(/\s+/g, '') === '#[cfg(test)]';
}

/** Skip past attributes, a `pub` visibility and the `mod` name, returning the open brace index. */
function openBraceOf(tokens: readonly Token[], from: number): number {
  let j = from;
  while (j < tokens.length && tokens[j].kind === 'attr') j += 1;
  if (tokens[j]?.kind === 'ident' && tokens[j].value === 'pub') {
    j += 1;
    if (tokens[j]?.kind === 'punct' && tokens[j].value === '(') {
      let depth = 0;
      do {
        const token = tokens[j];
        if (token.kind === 'punct') {
          if (token.value === '(') depth += 1;
          else if (token.value === ')') depth -= 1;
        }
        j += 1;
      } while (depth > 0 && j < tokens.length);
    }
  }
  if (tokens[j]?.kind !== 'ident' || tokens[j].value !== 'mod') return -1;
  j += 1;
  if (tokens[j]?.kind === 'ident') j += 1;
  return tokens[j]?.kind === 'punct' && tokens[j].value === '{' ? j : -1;
}

/**
 * The line ranges of every outermost `mod` item a `#[cfg(test)]` attribute
 * annotates, from the attribute's line to the module's closing brace.
 *
 * @scenario languages: Test module line ranges
 * @adr 017
 */
export function rustTestModuleRanges(source: string): readonly LineRange[] {
  const tokens = scanTokens(source);
  const ranges: LineRange[] = [];
  let i = 0;
  while (i < tokens.length) {
    const open = isCfgTest(tokens[i]) ? openBraceOf(tokens, i + 1) : -1;
    if (open === -1) {
      i += 1;
      continue;
    }
    let depth = 0;
    let k = open;
    for (; k < tokens.length; k += 1) {
      const token = tokens[k];
      if (token.kind !== 'punct') continue;
      if (token.value === '{') depth += 1;
      else if (token.value === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (k >= tokens.length) {
      i += 1;
      continue;
    }
    ranges.push({ start: tokens[i].line, end: tokens[k].line });
    i = k + 1;
  }
  return ranges;
}
