import { execFile } from 'node:child_process';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { resolveScope } from '../run/scope.js';
import { getArchiveDir, getChangesDir, getRejectedDir } from '../status/layout.js';
import { compareNumericPrefix } from '../status/state.js';
import { DeltaMergeError, type DeltaRequirement, mergeDelta, parseDelta } from './delta.js';
import { isExcludedChangePath } from './hasher.js';
import {
  hasDeclaredWrites,
  parseFrontmatter,
  parseSpecMd,
  parseTaskMd,
  resolveChangeDoc,
} from './parser.js';

/** The exact `@fission-ai/openspec` version this profile is pinned against. */
export const OPENSPEC_EXPECTED_VERSION = '1.13.1';

/** Remediation guidance citing ADR 004 for any validator pin violation. */
const OPENSPEC_PIN_REMEDIATION =
  'Refer to ADR 004 (decisions/004-pinned-openspec-validator.md) and run: pnpm add -D @fission-ai/openspec@1.13.1';

/** Prefix applied to every finding surfaced by the OpenSpec validator. */
export const OPENSPEC_ERROR_PREFIX = 'openspec:';

export interface LintLogger {
  info(msg: string): void;
  verbose(msg: string): void;
  warn(msg: string): void;
}

/**
 * ASCII control characters prohibited in authored change-folder files. Newline
 * (`\n`, 0x0A) and tab (`\t`, 0x09) are permitted as structural Markdown
 * whitespace; every other control character indicates a mangled write.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control character detector
const PROHIBITED_CONTROL_REGEX = /[\x00-\x08\x0B-\x1F\x7F]/;

/** Acceptance checkbox pattern; two or more on one line indicates fused lines. */
const ACCEPTANCE_CHECKBOX_REGEX = /[-*]\s*\[[ xX]\]/g;

/**
 * Requirement names that begin with an imperative instruction verb. A living
 * capability spec declares observable state; a delta requirement whose name
 * starts with "update" or "document" is an instruction and is rejected.
 */
const INSTRUCTION_SHAPED_REQUIREMENT_REGEX = /^(?:update|document)/i;

/** The exact template verify sentinel planning must replace before approval. */
const PLACEHOLDER_VERIFY_COMMAND = 'node -e "process.exit(0)"';

/** Package managers whose direct or `run` invocations reference a script. */
const PACKAGE_MANAGER_BINARIES = new Set(['pnpm', 'npm', 'yarn', 'bun']);

/** Package-script verbs that introduce the referenced script name. */
const PACKAGE_RUN_VERBS = new Set(['run', 'run-script']);

/**
 * Package-manager subcommands that are not package scripts. Recognizing these
 * as scripts would turn an ordinary package-manager command into a spurious
 * missing-script error, so they fall through to the generic path analysis.
 */
const PACKAGE_MANAGER_SUBCOMMANDS = new Set([
  'add',
  'audit',
  'bin',
  'cache',
  'config',
  'create',
  'dedupe',
  'dlx',
  'doctor',
  'env',
  'exec',
  'import',
  'init',
  'install',
  'licenses',
  'link',
  'list',
  'login',
  'logout',
  'ls',
  'outdated',
  'pack',
  'patch',
  'prune',
  'publish',
  'rebuild',
  'remove',
  'root',
  'setup',
  'store',
  'unlink',
  'uninstall',
  'update',
  'upgrade',
  'version',
  'whoami',
  'why',
  'workspace',
  'workspaces',
]);

/** A URL scheme prefix; such a token is never a repository-relative path. */
const URL_SCHEME_REGEX = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * The outcome of analyzing one verify command. Every field is derived without
 * executing or shell-expanding the command.
 */
export interface VerifyCommandAnalysis {
  /** The command is the template sentinel or a normalized equivalent. */
  readonly placeholder: boolean;
  /** The recognized package script name, when the command invokes one. */
  readonly packageScript: string | null;
  /** The recognized package script name that the root manifest lacks. */
  readonly missingScript: string | null;
  /** No existing repository path and no recognized package script was named. */
  readonly unresolved: boolean;
}

/**
 * Split a command into conservative tokens, honoring single and double quotes
 * so a quoted operand stays one token. This never expands shell syntax; it only
 * separates whitespace-delimited operands.
 */
function tokenizeVerifyCommand(command: string): string[] {
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
 * Recognize the template sentinel under the narrow normalizations the spec
 * allows: surrounding and repeated ASCII whitespace, single or double quotes
 * around the expression, `-e` or `--eval`, and an optional trailing semicolon.
 */
function isPlaceholderVerify(tokens: string[]): boolean {
  if (tokens.length !== 3 || tokens[0] !== 'node') {
    return false;
  }
  if (tokens[1] !== '-e' && tokens[1] !== '--eval') {
    return false;
  }
  const expression = tokens[2].trim().replace(/;+$/, '').replace(/\s+/g, '');
  return expression === 'process.exit(0)';
}

/** A shell chain operator; lint already rejects these for task verifies. */
function chainsVerifyCommand(command: string): boolean {
  return command.includes('&&') || command.includes(';') || command.includes('|');
}

/** Extract the referenced package script name from a recognized invocation. */
function extractPackageScript(tokens: string[]): string | null {
  const [bin, first, second] = tokens;
  if (bin === undefined || !PACKAGE_MANAGER_BINARIES.has(bin)) {
    return null;
  }
  if (first === undefined || first.startsWith('-')) {
    return null;
  }
  if (PACKAGE_RUN_VERBS.has(first)) {
    if (second === undefined || second.startsWith('-')) {
      return null;
    }
    return second;
  }
  if (PACKAGE_MANAGER_SUBCOMMANDS.has(first)) {
    return null;
  }
  return first;
}

/** True when any non-option operand resolves beneath `projectRoot`. */
async function namesExistingRepositoryPath(
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

/**
 * Analyze one verify command read-only: detect the template sentinel, resolve a
 * recognized package script against the root manifest, or fall back to an
 * unresolved-target warning when no existing path or script is named.
 */
export async function analyzeVerifyCommand(
  projectRoot: string,
  command: string,
  packageScripts: ReadonlySet<string>,
): Promise<VerifyCommandAnalysis> {
  const tokens = tokenizeVerifyCommand(command);

  if (isPlaceholderVerify(tokens)) {
    return { placeholder: true, packageScript: null, missingScript: null, unresolved: false };
  }

  const packageScript = extractPackageScript(tokens);
  if (packageScript !== null) {
    return {
      placeholder: false,
      packageScript,
      missingScript: packageScripts.has(packageScript) ? null : packageScript,
      unresolved: false,
    };
  }

  return {
    placeholder: false,
    packageScript: null,
    missingScript: null,
    unresolved: !(await namesExistingRepositoryPath(projectRoot, tokens)),
  };
}

/**
 * Read the root manifest's `scripts` keys once. A missing or malformed manifest
 * deterministically yields an empty set rather than throwing, and the command
 * itself is never executed.
 */
async function readRootPackageScripts(projectRoot: string): Promise<ReadonlySet<string>> {
  try {
    const raw = await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { scripts?: unknown };
    const scripts = parsed.scripts;
    if (scripts !== null && typeof scripts === 'object' && !Array.isArray(scripts)) {
      return new Set(Object.keys(scripts as Record<string, unknown>));
    }
  } catch {
    // Missing or malformed manifest: no known scripts.
  }
  return new Set();
}

function placeholderVerifyError(label: string): string {
  return `${label} verify is the template placeholder ${PLACEHOLDER_VERIFY_COMMAND}; replace it with a real command that verifies the completed change's final tree`;
}

function missingPackageScriptError(label: string, script: string): string {
  return `${label} verify references package script "${script}" that is not defined in the root package.json`;
}

function unresolvedVerifyWarning(label: string, command: string): string {
  return `${label} verify names neither an existing repository path nor a package script: "${command}"`;
}

/**
 * Recursively list a change folder's authored files relative to `baseDir`,
 * applying the shared root-relative exclusion predicate. `.run`, `.git`, and
 * `.DS_Store` are excluded at any depth while the transient root
 * `plan-prompt.md` is excluded without hiding a nested same-named authored file.
 */
async function collectArtifactFiles(dir: string, baseDir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).split(path.sep).join('/');
    if (isExcludedChangePath(relPath)) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...(await collectArtifactFiles(fullPath, baseDir)));
    } else if (entry.isFile()) {
      files.push(relPath);
    }
  }
  return files;
}

/** Report the first prohibited control character found in `content`. */
function scanControlCharacters(relPath: string, content: string, errors: string[]): void {
  const match = PROHIBITED_CONTROL_REGEX.exec(content);
  if (!match) {
    return;
  }
  const code = match[0].charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
  errors.push(`File ${relPath} contains prohibited control character (0x${code})`);
}

/** Report any task line carrying two or more acceptance checkbox items. */
function scanFusedAcceptance(taskFile: string, content: string, errors: string[]): void {
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    const count = line.match(ACCEPTANCE_CHECKBOX_REGEX)?.length ?? 0;
    if (count > 1) {
      errors.push(`Task in ${taskFile} contains fused acceptance lines on line ${index + 1}`);
    }
  });
}

export interface LintResult {
  readonly valid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
}

export interface LintOptions {
  readonly logger?: LintLogger;
}

export interface OpenSpecFindings {
  readonly errors: string[];
  readonly warnings: string[];
}

export interface OpenSpecValidationOutcome extends OpenSpecFindings {
  readonly ran: boolean;
  readonly bin: string | null;
  readonly version: string | null;
}

interface OpenSpecSettings {
  readonly bin?: string;
  readonly schema?: string;
}

interface OpenSpecCommandOutcome {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

async function pathExists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

function resolveOpenSpecSettings(config: OsqConfig): OpenSpecSettings {
  const extended = config as OsqConfig & { readonly openspec?: OpenSpecSettings };
  return extended.openspec ?? {};
}

function resolveOpenSpecRoot(config: OsqConfig): string {
  const paths = config.paths as OsqConfig['paths'] & { readonly openspecRoot?: string };
  return paths.openspecRoot ?? 'openspec';
}

/**
 * Resolves the project-local OpenSpec binary. Only a binary inside the
 * project's own `node_modules/.bin` (or an explicitly configured absolute
 * path) is used; missing installs resolve to `null` so linting degrades
 * gracefully rather than failing on projects without OpenSpec.
 */
export async function resolveOpenSpecBin(
  projectRoot: string,
  config: OsqConfig,
): Promise<string | null> {
  const binName = resolveOpenSpecSettings(config).bin?.trim() || 'openspec';

  if (path.isAbsolute(binName) || binName.includes('/') || binName.includes('\\')) {
    return (await pathExists(binName)) ? binName : null;
  }

  const localBin = path.join(projectRoot, 'node_modules', '.bin', binName);
  return (await pathExists(localBin)) ? localBin : null;
}

/** Reads the resolved `@fission-ai/openspec` version from the local install. */
export async function resolveOpenSpecVersion(projectRoot: string): Promise<string | null> {
  const manifestPath = path.join(
    projectRoot,
    'node_modules',
    '@fission-ai',
    'openspec',
    'package.json',
  );

  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw) as { version?: string };
    return manifest.version ?? null;
  } catch {
    return null;
  }
}

function messageOf(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of ['message', 'error', 'description', 'title', 'label', 'detail']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

function levelOf(value: unknown): 'error' | 'warning' {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['severity', 'level', 'type', 'kind']) {
      const candidate = record[key];
      if (typeof candidate === 'string') {
        const lowered = candidate.toLowerCase();
        if (lowered.includes('warn') || lowered.includes('info')) {
          return 'warning';
        }
        if (lowered.includes('error') || lowered.includes('fail')) {
          return 'error';
        }
      }
    }
  }
  return 'error';
}

const FINDING_CONTAINERS: ReadonlyArray<readonly [string, 'error' | 'warning' | undefined]> = [
  ['errors', 'error'],
  ['warnings', 'warning'],
  ['issues', undefined],
  ['findings', undefined],
  ['problems', undefined],
  ['validations', undefined],
  ['results', undefined],
  ['items', undefined],
];

/**
 * Tolerantly extracts validation findings from `openspec validate --json`.
 * Accepts a top-level array or an object exposing `issues`/`errors`/`warnings`
 * (or similar) and classifies each finding by its error/warning severity.
 */
export function parseOpenSpecFindings(output: string): OpenSpecFindings {
  const errors: string[] = [];
  const warnings: string[] = [];
  const trimmed = output.trim();
  if (!trimmed) {
    return { errors, warnings };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { errors, warnings };
  }

  const seen = new Set<string>();
  const push = (level: 'error' | 'warning', message: string): void => {
    const normalized = message.trim();
    if (!normalized) {
      return;
    }
    const key = `${level}:${normalized}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    (level === 'warning' ? warnings : errors).push(normalized);
  };

  const visit = (value: unknown, hint?: 'error' | 'warning'): void => {
    if (typeof value === 'string') {
      push(hint ?? 'error', value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, hint);
      }
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }

    const record = value as Record<string, unknown>;
    const message = messageOf(record);
    if (message) {
      push(hint ?? levelOf(record), message);
    }

    for (const [key, keyHint] of FINDING_CONTAINERS) {
      if (key in record) {
        visit(record[key], hint ?? keyHint);
      }
    }
  };

  visit(parsed);
  return { errors, warnings };
}

function execFileCapture(
  bin: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeout: number },
): Promise<OpenSpecCommandOutcome> {
  return new Promise((resolve) => {
    execFile(bin, args, options, (error, stdout, stderr) => {
      const code = error
        ? typeof (error as { code?: unknown }).code === 'number'
          ? ((error as { code: number }).code as number)
          : 1
        : 0;
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code });
    });
  });
}

/**
 * Runs the local OpenSpec validator for changes and specs. Validation failures
 * are returned prefixed with `openspec:`. The validator is pinned: a missing
 * binary or a version that differs from `OPENSPEC_EXPECTED_VERSION` is an error
 * that cites ADR 004 and the install command, so linting fails closed rather
 * than silently degrading.
 */
export async function validateWithOpenSpec(
  projectRoot: string,
  config: OsqConfig,
  options: LintOptions = {},
): Promise<OpenSpecValidationOutcome> {
  const logger = options.logger;
  const bin = await resolveOpenSpecBin(projectRoot, config);
  if (!bin) {
    return {
      errors: [
        `OpenSpec validator binary is unavailable at node_modules/.bin/openspec. ${OPENSPEC_PIN_REMEDIATION}`,
      ],
      warnings: [],
      ran: false,
      bin: null,
      version: null,
    };
  }

  const version = await resolveOpenSpecVersion(projectRoot);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!version) {
    errors.push(
      `OpenSpec validator version could not be resolved from node_modules/@fission-ai/openspec/package.json. ${OPENSPEC_PIN_REMEDIATION}`,
    );
  } else {
    logger?.info(`openspec version ${version}`);
    if (version !== OPENSPEC_EXPECTED_VERSION) {
      errors.push(
        `OpenSpec validator version ${version} differs from pinned ${OPENSPEC_EXPECTED_VERSION}. ${OPENSPEC_PIN_REMEDIATION}`,
      );
    }
  }

  const timeout = config.timeouts.verifyTimeoutSeconds * 1000;
  const commands: string[][] = [
    ['validate', '--changes', '--strict', '--json', '--no-interactive'],
    ['validate', '--specs', '--strict', '--json', '--no-interactive'],
  ];

  for (const args of commands) {
    const outcome = await execFileCapture(bin, args, {
      cwd: projectRoot,
      env: { ...process.env, OPENSPEC_TELEMETRY: '0' },
      timeout,
    });

    const findings = parseOpenSpecFindings(outcome.stdout);
    for (const error of findings.errors) {
      errors.push(`${OPENSPEC_ERROR_PREFIX} ${error}`);
    }
    for (const warning of findings.warnings) {
      warnings.push(`${OPENSPEC_ERROR_PREFIX} ${warning}`);
    }

    if (outcome.code !== 0 && findings.errors.length === 0 && findings.warnings.length === 0) {
      const detail = (outcome.stderr || outcome.stdout).trim().split('\n')[0];
      errors.push(
        `${OPENSPEC_ERROR_PREFIX} ${args.join(' ')} exited with code ${outcome.code}${
          detail ? `: ${detail}` : ''
        }`,
      );
    }
  }

  return { errors, warnings, ran: true, bin, version };
}

async function checkDependencyExists(
  projectRoot: string,
  depId: string,
  config: OsqConfig,
): Promise<boolean> {
  const dirsToCheck = [
    getChangesDir(config.paths.openspecRoot, projectRoot),
    getArchiveDir(config.paths.openspecRoot, projectRoot),
    // A rejected change is a historical change: the reference stays auditable
    // even though it never satisfies dependency completion.
    getRejectedDir(config.paths.openspecRoot, projectRoot),
  ];
  const paddedDep = depId.padStart(3, '0');

  for (const dir of dirsToCheck) {
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        if (entry.startsWith(`${paddedDep}-`) || entry === paddedDep) {
          return true;
        }
      }
    } catch {
      // Directory may not exist yet
    }
  }

  return false;
}

/** Returns the leading instruction verb in a requirement name, else null. */
function instructionVerbOf(name: string): string | null {
  const match = name.trim().match(INSTRUCTION_SHAPED_REQUIREMENT_REGEX);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Reports delta requirements whose names are instruction-shaped. Deltas must
 * define living capability requirements, so names starting with an imperative
 * verb such as "update" or "document" are rejected with the capability and the
 * offending requirement title.
 */
function scanInstructionShapedRequirements(
  capability: string,
  requirements: DeltaRequirement[],
  errors: string[],
): void {
  for (const requirement of requirements) {
    const verb = instructionVerbOf(requirement.name);
    if (!verb) {
      continue;
    }
    errors.push(
      `${OPENSPEC_ERROR_PREFIX} ${capability}: requirement "${requirement.name}" is instruction-shaped ("${verb}"); delta specs must define living capability requirements, not instructions`,
    );
  }
}

/**
 * Verifies that every delta operation targeting a requirement resolves against
 * the living base spec at `openspec/specs/<capability>/spec.md`. Applying the
 * delta through the deterministic merge engine reports unmatched MODIFIED,
 * REMOVED, or RENAMED targets; ADDED-only deltas may create a new capability.
 */
export async function verifyDeltaTargets(
  projectRoot: string,
  folderPath: string,
  config: OsqConfig,
): Promise<string[]> {
  const errors: string[] = [];
  const deltasDir = path.join(folderPath, 'specs');

  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(deltasDir, { withFileTypes: true });
  } catch {
    return errors;
  }

  const capabilities = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (capabilities.length === 0) {
    return errors;
  }

  const specsRoot = path.join(projectRoot, resolveOpenSpecRoot(config), 'specs');

  for (const capability of capabilities) {
    const deltaContent = await fs
      .readFile(path.join(deltasDir, capability, 'spec.md'), 'utf8')
      .catch(() => null);
    if (deltaContent === null) {
      continue;
    }

    const baseContent = await fs
      .readFile(path.join(specsRoot, capability, 'spec.md'), 'utf8')
      .catch(() => null);

    const delta = parseDelta(deltaContent);
    scanInstructionShapedRequirements(
      capability,
      [...delta.added, ...delta.modified, ...delta.removed],
      errors,
    );

    try {
      mergeDelta(baseContent, capability, delta);
    } catch (error) {
      if (error instanceof DeltaMergeError) {
        errors.push(`${OPENSPEC_ERROR_PREFIX} ${capability}: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  return errors;
}

/**
 * One task's resolved existing scope files, collected during linting so later
 * cross-task analysis reuses the resolver projection instead of re-walking.
 */
interface ResolvedTaskScope {
  readonly taskFile: string;
  readonly taskNumber: string;
  readonly existingPaths: readonly string[];
}

/**
 * Compares each pair of tasks' resolved existing files and returns one
 * deterministic warning per shared task-pair/file. Tasks are ordered by numeric
 * filename with the established stable fallback, and paths within a pair are
 * sorted, so directory enumeration order never affects the diagnostics.
 * Declarations that resolve to no existing file are already excluded from
 * `existingPaths`; the shared resolver deduplicated them per task, so a task
 * never warns against itself.
 */
function collectOverlapWarnings(scopes: readonly ResolvedTaskScope[]): string[] {
  const ordered = [...scopes].sort((a, b) => compareNumericPrefix(a.taskFile, b.taskFile));
  const warnings: string[] = [];

  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      const other = new Set(ordered[right].existingPaths);
      const shared = ordered[left].existingPaths
        .filter((relativePath) => other.has(relativePath))
        .sort();
      for (const relativePath of shared) {
        warnings.push(
          `Tasks ${ordered[left].taskNumber} and ${ordered[right].taskNumber} share resolved scope file ${relativePath}`,
        );
      }
    }
  }

  return warnings;
}

/**
 * Warns once per task whose resolved scope contains a `src/harness/` file but
 * no resolved file under `tests/fixtures/events/`. Reuses the resolver
 * projection already collected for overlap analysis instead of re-walking.
 */
function collectHarnessFixtureWarnings(scopes: readonly ResolvedTaskScope[]): string[] {
  const ordered = [...scopes].sort((a, b) => compareNumericPrefix(a.taskFile, b.taskFile));
  const warnings: string[] = [];
  for (const scope of ordered) {
    const hasHarness = scope.existingPaths.some((entry) => entry.startsWith('src/harness/'));
    const hasFixtures = scope.existingPaths.some(
      (entry) => entry === 'tests/fixtures/events' || entry.startsWith('tests/fixtures/events/'),
    );
    if (hasHarness && !hasFixtures) {
      warnings.push(
        `Task in ${scope.taskFile} resolves src/harness/ scope but no file under tests/fixtures/events/`,
      );
    }
  }
  return warnings;
}

/** Test files governed by the `tests.modify` gate; mirrors the `tests/**` default. */
function isTestFilePath(relativePath: string): boolean {
  return relativePath === 'tests' || relativePath.startsWith('tests/');
}

interface TestsModifyDeclaration {
  readonly present: boolean;
  readonly valid: boolean;
  readonly value?: unknown;
}

/**
 * Reads `tests.modify` from raw task frontmatter so a non-boolean value can be
 * rejected. `parseTaskMd` intentionally collapses invalid types to `false`;
 * schema validation therefore lives here. The nested `tests: { modify: ... }`
 * form takes precedence over the flat `tests.modify` key.
 */
function readTestsModifyDeclaration(content: string): TestsModifyDeclaration {
  const { data } = parseFrontmatter(content);
  const nested = data.tests;
  if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) {
    const record = nested as Record<string, unknown>;
    if ('modify' in record) {
      const value = record.modify;
      return { present: true, valid: typeof value === 'boolean', value };
    }
  }

  if ('tests.modify' in data) {
    const value = data['tests.modify'];
    return { present: true, valid: typeof value === 'boolean', value };
  }

  return { present: false, valid: true };
}

export async function lintChangeFolder(
  projectRoot: string,
  folderPath: string,
  config: OsqConfig,
  options: LintOptions = {},
): Promise<LintResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const packageScripts = await readRootPackageScripts(projectRoot);

  // Check: no authored change-folder file contains prohibited control characters
  for (const relPath of await collectArtifactFiles(folderPath, folderPath)) {
    const content = await fs.readFile(path.join(folderPath, relPath), 'utf8');
    scanControlCharacters(relPath, content, errors);
  }

  const resolvedDoc = await resolveChangeDoc(folderPath);
  if (!resolvedDoc) {
    errors.push('proposal.md (or legacy spec.md) not found in change folder');
    return { valid: false, errors, warnings };
  }

  const specContent = await fs.readFile(resolvedDoc.path, 'utf8');
  const spec = parseSpecMd(specContent);

  // Check: proposals must declare a change-level verify command
  if (resolvedDoc.kind === 'proposal' && !spec.verify) {
    errors.push('proposal.md must declare a verify command in frontmatter');
  }

  // Check: the change-level verify participates in the same trust analysis
  if (spec.verify) {
    const docLabel = path.basename(resolvedDoc.path);
    const analysis = await analyzeVerifyCommand(projectRoot, spec.verify, packageScripts);
    if (analysis.placeholder) {
      errors.push(placeholderVerifyError(docLabel));
    } else if (!chainsVerifyCommand(spec.verify)) {
      if (analysis.missingScript !== null) {
        errors.push(missingPackageScriptError(docLabel, analysis.missingScript));
      } else if (analysis.unresolved) {
        warnings.push(unresolvedVerifyWarning(docLabel, spec.verify));
      }
    }
  }

  // Check: features.writes is retired; delta specs are the sole writes declaration
  if (hasDeclaredWrites(parseFrontmatter(specContent).data)) {
    errors.push(
      'features.writes is no longer supported in proposal frontmatter; write declarations are derived strictly from delta specs under specs/<capability>/spec.md',
    );
  }

  // Check: contract tables count
  if (spec.contractTablesCount > config.limits.maxContractTables) {
    errors.push(
      `Contract has ${spec.contractTablesCount} tables (max allowed is ${config.limits.maxContractTables})`,
    );
  }

  // Check: depends_on exists
  for (const dep of spec.dependsOn) {
    const exists = await checkDependencyExists(projectRoot, dep, config);
    if (!exists) {
      errors.push(`depends_on names missing change: ${dep}`);
    }
  }

  // Tasks checks
  const tasksDir = path.join(folderPath, 'tasks');
  let taskEntries: string[] = [];
  try {
    taskEntries = (await fs.readdir(tasksDir)).filter((e) => e.endsWith('.md'));
  } catch {
    errors.push('tasks directory not found in change folder');
  }

  if (taskEntries.length === 0) {
    errors.push('No task files found under tasks/');
  }

  const resolvedTaskScopes: ResolvedTaskScope[] = [];

  for (const taskFile of taskEntries) {
    const taskPath = path.join(tasksDir, taskFile);
    const taskContent = await fs.readFile(taskPath, 'utf8');
    const task = parseTaskMd(taskContent);

    // Check: acceptance items must each occupy their own line
    scanFusedAcceptance(taskFile, taskContent, errors);

    // Check: tests.modify, when declared, must be a boolean
    const testsModify = readTestsModifyDeclaration(taskContent);
    if (testsModify.present && !testsModify.valid) {
      errors.push(
        `Task in ${taskFile} tests.modify must be a boolean (got ${JSON.stringify(testsModify.value)})`,
      );
    }

    // Resolve the declared scope once through the shared deterministic resolver.
    const resolved = task.scope.length > 0 ? await resolveScope(projectRoot, task.scope) : [];
    const existingPaths = resolved
      .filter((entry) => entry.absolutePath !== null)
      .map((entry) => entry.relativePath);
    resolvedTaskScopes.push({ taskFile, taskNumber: taskFile.replace(/\.md$/, ''), existingPaths });

    // Check: touching an existing test file requires tests.modify: true
    if (!task.testsModify && existingPaths.length > 0) {
      const touched = existingPaths.filter(isTestFilePath).sort();
      if (touched.length > 0) {
        errors.push(
          `Task in ${taskFile} scope touches existing test files (${touched.join(', ')}) without tests.modify: true`,
        );
      }
    }

    // Check: verify command empty, placeholder, chained, missing script, or unresolved
    if (!task.verify) {
      errors.push(`Task in ${taskFile} verify command is empty`);
    } else {
      const taskLabel = `Task in ${taskFile}`;
      const analysis = await analyzeVerifyCommand(projectRoot, task.verify, packageScripts);
      if (analysis.placeholder) {
        errors.push(placeholderVerifyError(taskLabel));
      } else if (chainsVerifyCommand(task.verify)) {
        errors.push(`Task in ${taskFile} verify chains commands ("${task.verify}")`);
      } else if (analysis.missingScript !== null) {
        errors.push(missingPackageScriptError(taskLabel, analysis.missingScript));
      } else if (analysis.unresolved) {
        warnings.push(unresolvedVerifyWarning(taskLabel, task.verify));
      }
    }

    // Check: acceptance checklist length
    if (task.acceptance.length > config.limits.maxAcceptanceLines) {
      errors.push(
        `Task in ${taskFile} acceptance lines (${task.acceptance.length}) exceeds limit ${config.limits.maxAcceptanceLines}`,
      );
    }

    // Check: scope expands to more than maxScopeFiles
    if (task.scope.length > config.limits.maxScopeFiles) {
      errors.push(
        `Task in ${taskFile} scope specifies ${task.scope.length} patterns, exceeding limit ${config.limits.maxScopeFiles}`,
      );
    }
  }

  // Check: harness scope should cover the event fixtures without failing lint
  warnings.push(...collectHarnessFixtureWarnings(resolvedTaskScopes));

  // Check: shared resolved files across tasks are reported as non-failing warnings
  warnings.push(...collectOverlapWarnings(resolvedTaskScopes));

  // Check: delta targets resolve against living base specs before approval
  errors.push(...(await verifyDeltaTargets(projectRoot, folderPath, config)));

  // Check: pinned OpenSpec validator
  const openSpec = await validateWithOpenSpec(projectRoot, config, options);
  errors.push(...openSpec.errors);
  warnings.push(...openSpec.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
