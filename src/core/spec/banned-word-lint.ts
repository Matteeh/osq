import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { BannedWord } from '../foundation/config-banned-words.js';
import { scopeCoversPath } from '../run/scope.js';
import { type LintFinding, makeFinding } from './lint-findings.js';
import { parseTaskMd } from './parser.js';

/**
 * The banned-word half of impact lint: a change whose task scope reaches a
 * banned word's paths is warned about every inline code span, fenced code line,
 * and double-quoted scenario text that holds the word. Every finding is a
 * warning; none affects `valid`, `osq lint`'s exit code, or approval.
 */

export interface BannedWordLintInput {
  readonly projectRoot: string;
  readonly folderPath: string;
  /** The resolved config's `bannedWords` list, empty when nothing is banned. */
  readonly bannedWords: readonly BannedWord[];
}

/** A banned word paired with its index in the resolved `bannedWords` list. */
interface IndexedBan {
  readonly entry: BannedWord;
  readonly index: number;
}

/** One extracted text and the character offset it starts at, in file order. */
interface ScannedText {
  readonly offset: number;
  readonly text: string;
}

const FENCE_REGEX = /^\s*(?:```|~~~)/;
const HEADING_REGEX = /^#{1,6}\s/;
const SCENARIO_HEADING_REGEX = /^#{4}\s+Scenario:/;
const INLINE_CODE_REGEX = /`([^`]+)`/g;
const DOUBLE_QUOTED_REGEX = /"([^"]*)"/g;

/** Repository-relative POSIX path of a file inside the change folder. */
function repoPath(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join('/');
}

/** Numeric-aware ordering of task file names, so `2.md` follows `10.md`. */
function taskOrder(a: string, b: string): number {
  const left = Number.parseInt(a, 10);
  const right = Number.parseInt(b, 10);
  if (!Number.isNaN(left) && !Number.isNaN(right) && left !== right) {
    return left - right;
  }
  return a.localeCompare(b);
}

/** The change's task files, in task order. */
async function listTaskFiles(folderPath: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(path.join(folderPath, 'tasks'), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort(taskOrder);
}

/** The change's delta capabilities, in name order. */
async function listDeltaCapabilities(folderPath: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(path.join(folderPath, 'specs'), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Every text a banned word can be found in, in file order and deduplicated:
 * inline code spans, each fenced code line, and double-quoted text under a
 * `#### Scenario:` heading.
 */
function scanTexts(content: string): string[] {
  const found: ScannedText[] = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let inScenario = false;
  let offset = 0;

  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1;

    if (FENCE_REGEX.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      const text = line.trim();
      if (text.length > 0) found.push({ offset: lineStart, text });
      continue;
    }
    if (HEADING_REGEX.test(line)) {
      inScenario = SCENARIO_HEADING_REGEX.test(line);
      continue;
    }
    for (const match of line.matchAll(INLINE_CODE_REGEX)) {
      found.push({ offset: lineStart + (match.index ?? 0), text: match[1] });
    }
    if (inScenario) {
      for (const match of line.matchAll(DOUBLE_QUOTED_REGEX)) {
        if (match[1].length > 0) {
          found.push({ offset: lineStart + (match.index ?? 0), text: match[1] });
        }
      }
    }
  }

  found.sort((a, b) => a.offset - b.offset);
  const texts: string[] = [];
  const seen = new Set<string>();
  for (const entry of found) {
    if (seen.has(entry.text)) continue;
    seen.add(entry.text);
    texts.push(entry.text);
  }
  return texts;
}

/** True when one whitespace token holds the entry's word. */
function tokenHoldsWord(token: string, entry: BannedWord): boolean {
  if (!token.toLowerCase().includes(entry.word.toLowerCase())) return false;
  if (!token.includes('/')) return true;
  return scopeCoversPath(entry.paths, token);
}

/** True when any whitespace token of the text holds the entry's word. */
function textHoldsWord(text: string, entry: BannedWord): boolean {
  return text.split(/\s+/).some((token) => token.length > 0 && tokenHoldsWord(token, entry));
}

/** True when an entry path and a task scope entry cover each other. */
function scopeOverlapsBan(scope: readonly string[], entry: BannedWord): boolean {
  if (entry.paths.some((pathGlob) => scopeCoversPath(scope, pathGlob))) return true;
  return scope.some((scopeEntry) => scopeCoversPath(entry.paths, scopeEntry));
}

/** One warning per distinct text per ban, texts in file order. */
function bannedFindings(
  texts: readonly string[],
  bans: readonly IndexedBan[],
  file: string,
): LintFinding[] {
  const findings: LintFinding[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    for (const { entry, index } of bans) {
      if (!textHoldsWord(text, entry)) continue;
      const key = `${index}\u0000${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push(
        makeFinding(
          'warning',
          { file },
          `Banned word "${entry.word}" in "${text}": bannedWords[${index}] bans it in ${entry.paths.join(', ')}; name it another way`,
        ),
      );
    }
  }
  return findings;
}

/**
 * Warn once per distinct text that holds a banned word. A task file is checked
 * against a ban when one of the ban's paths and one of the task's `scope`
 * entries cover the other, and every delta spec is checked once any task file
 * is checked. Task files come first in task order, then delta specs by
 * capability name; each file's texts are in file order. A text holds the word
 * when a token contains it, ignoring case, unless the token holds `/` that the
 * ban's paths do not cover.
 *
 * @scenario spec-lint-and-approve: Texts that hold a banned word
 * @scenario spec-lint-and-approve: Fenced code and scenario quotes
 * @scenario spec-lint-and-approve: Scope that misses the ban
 * @scenario spec-lint-and-approve: A glob scope that reaches the ban
 * @scenario spec-lint-and-approve: Banned word warnings never block
 */
export async function collectBannedWordFindings(
  input: BannedWordLintInput,
): Promise<LintFinding[]> {
  if (input.bannedWords.length === 0) return [];
  const indexed = input.bannedWords.map((entry, index) => ({ entry, index }));
  const findings: LintFinding[] = [];
  let anyTaskChecked = false;

  for (const taskFile of await listTaskFiles(input.folderPath)) {
    const taskPath = path.join(input.folderPath, 'tasks', taskFile);
    const content = await fs.readFile(taskPath, 'utf8').catch(() => null);
    if (content === null) continue;
    const task = parseTaskMd(content);
    const bans = indexed.filter(({ entry }) => scopeOverlapsBan(task.scope, entry));
    if (bans.length === 0) continue;
    anyTaskChecked = true;
    findings.push(
      ...bannedFindings(scanTexts(content), bans, repoPath(input.projectRoot, taskPath)),
    );
  }

  if (!anyTaskChecked) return findings;

  for (const capability of await listDeltaCapabilities(input.folderPath)) {
    const deltaPath = path.join(input.folderPath, 'specs', capability, 'spec.md');
    const content = await fs.readFile(deltaPath, 'utf8').catch(() => null);
    if (content === null) continue;
    findings.push(
      ...bannedFindings(scanTexts(content), indexed, repoPath(input.projectRoot, deltaPath)),
    );
  }

  return findings;
}
