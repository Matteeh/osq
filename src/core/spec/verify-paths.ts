import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveScope } from '../run/scope.js';

/**
 * Shared read-only analysis of the paths a verify command names. Lint, the
 * approval digest, and the watcher all consume this module so a command's
 * operands are interpreted one way.
 */

/** A URL scheme prefix; such a token is never a repository-relative path. */
const URL_SCHEME_REGEX = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Glob metacharacters that mark a named path as a pattern. */
const GLOB_METACHARACTER_REGEX = /[*?]/;

/**
 * Split a command into conservative tokens, honoring single and double quotes
 * so a quoted operand stays one token. This never expands shell syntax; it only
 * separates whitespace-delimited operands.
 */
export function tokenizeVerifyCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;
  let hasContent = false;

  for (const char of command) {
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      hasContent = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (hasContent) {
        tokens.push(current);
        current = '';
        hasContent = false;
      }
      continue;
    }

    current += char;
    hasContent = true;
  }

  if (hasContent) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * True when one operand is a named path: not an option, not absolute, not a
 * `KEY=value` assignment or URL, and containing a path separator. A bare first
 * token lacks a separator, so the command binary is never named; a path-shaped
 * first token is.
 */
function isNamedPathOperand(token: string, index: number): boolean {
  if (token.length === 0) {
    return false;
  }
  if (token.startsWith('-') || token.startsWith('/')) {
    return false;
  }
  if (token.includes('=') || URL_SCHEME_REGEX.test(token)) {
    return false;
  }
  if (index === 0 && !token.includes('/') && !token.includes('\\')) {
    return false;
  }
  return token.includes('/') || token.includes('\\');
}

/** The path operands a verify command names, in command order. */
export function listNamedPaths(command: string): string[] {
  const named: string[] = [];
  tokenizeVerifyCommand(command).forEach((token, index) => {
    if (isNamedPathOperand(token, index)) {
      named.push(token);
    }
  });
  return named;
}

/**
 * The named paths a verify command would not find under `projectRoot`. An exact
 * operand is present when the filesystem entry exists; a glob operand is present
 * when `resolveScope` matches at least one file for it. Duplicate operands report
 * once, in first-seen command order.
 */
export async function missingNamedPaths(projectRoot: string, command: string): Promise<string[]> {
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const named of listNamedPaths(command)) {
    if (seen.has(named)) {
      continue;
    }
    seen.add(named);

    if (GLOB_METACHARACTER_REGEX.test(named)) {
      const matches = await resolveScope(projectRoot, [named]);
      if (matches.length === 0) {
        missing.push(named);
      }
      continue;
    }

    if (!(await pathExists(path.join(projectRoot, named)))) {
      missing.push(named);
    }
  }

  return missing;
}

/** True when any non-option operand resolves beneath `projectRoot`. */
export async function namesExistingRepositoryPath(
  projectRoot: string,
  tokens: string[],
): Promise<boolean> {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || token.startsWith('-') || token.startsWith('/')) {
      continue;
    }
    if (token.includes('=') || URL_SCHEME_REGEX.test(token)) {
      continue;
    }
    // A bare first token is the command binary, not a behavioral path; a
    // path-shaped first token is itself the local behavior being invoked.
    if (index === 0 && !token.includes('/') && !token.includes('\\')) {
      continue;
    }
    if (await pathExists(path.join(projectRoot, token))) {
      return true;
    }
  }
  return false;
}

async function pathExists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}
