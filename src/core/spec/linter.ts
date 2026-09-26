import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { resolveScope } from '../run/scope.js';
import { getArchiveDir, getChangesDir, getRejectedDir } from '../status/layout.js';
import { compareNumericPrefix } from '../status/state.js';
import { collectDecisionsFindings } from './decisions-lint.js';
import { DeltaMergeError, type DeltaRequirement, mergeDelta, parseDelta } from './delta.js';
import { isExcludedChangePath } from './hasher.js';
import { collectImpactFindings } from './impact-lint.js';
import { type ImportGraph, buildImportGraph } from './import-graph.js';
import {
  type LintFinding,
  LintFindingSet,
  type LintSeverity,
  makeFinding,
} from './lint-findings.js';
import { type MergedSpecInput, validateMergedSpecs } from './merged-spec-check.js';
import {
  OPENSPEC_ERROR_PREFIX,
  type OpenSpecIssueContext,
  appendUnsupportedNote,
  execFileCapture,
  scanOpenSpecIssues,
} from './openspec-issues.js';
import {
  OPENSPEC_EXPECTED_VERSION,
  type OpenSpecVersionAssessment,
  assessOpenSpecVersion,
  formatInRangeWarning,
} from './openspec-version.js';
import {
  type TaskData,
  hasDeclaredWrites,
  parseFrontmatter,
  parseSpecMd,
  parseTaskMd,
  resolveChangeDoc,
} from './parser.js';
import { collectTraceabilityFindings } from './traceability-lint.js';
import {
  listNamedPaths,
  missingNamedPaths,
  namesExistingRepositoryPath,
  tokenizeVerifyCommand,
} from './verify-paths.js';
import {
  type VerifyStartTask,
  analyzeVerifyStarts,
  namedPathCoveredByScopes,
} from './verify-starts.js';

export { OPENSPEC_EXPECTED_VERSION, OPENSPEC_ERROR_PREFIX };

/** Remediation guidance citing ADR 004 for any validator pin violation. */
const OPENSPEC_PIN_REMEDIATION =
  'Refer to ADR 004 (decisions/004-pinned-openspec-validator.md) and run: pnpm add -D @fission-ai/openspec@1.13.1';

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

/** The one find-it error for a missing or empty proposal `## Surface` section. */
const PROPOSAL_SURFACE_ERROR =
  'proposal.md needs a ## Surface section: list the commands, flags, config keys, frontmatter fields, document sections, dead reasons, and event types this change adds, changes, or removes, or write None';

/** HTML comments are structural scaffolding, not declared surface text. */
const HTML_COMMENT_REGEX = /<!--[\s\S]*?-->/g;

/**
 * Reads a proposal body's `## Surface` section content. The heading must occupy
 * its own line; a mention inside prose does not count. Returns `null` when the
 * section is absent.
 */
function readSurfaceSection(body: string): string | null {
  const match = /^##\s+Surface\s*$/m.exec(body);
  if (!match) {
    return null;
  }
  const rest = body.slice(match.index + match[0].length);
  const boundary = rest.search(/\n##(?!#)\s/);
  return boundary === -1 ? rest : rest.slice(0, boundary);
}

/**
 * True when a proposal has no `## Surface` section, or the section holds only
 * HTML comments and whitespace. Lint checks presence, never the declared text.
 */
function proposalSurfaceIsEmpty(body: string): boolean {
  const section = readSurfaceSection(body);
  if (section === null) {
    return true;
  }
  return section.replace(HTML_COMMENT_REGEX, '').trim().length === 0;
}

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

function chainedVerifyError(label: string, command: string): string {
  return `Task in ${label} verify chains commands ("${command}"); move the chain into a package script and name that script, for example pnpm run <script>`;
}

/** Resolve an absolute path to its repository-relative POSIX form. */
function repositoryPath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
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
function scanControlCharacters(
  relPath: string,
  file: string,
  content: string,
  findings: LintFindingSet,
): void {
  const match = PROHIBITED_CONTROL_REGEX.exec(content);
  if (!match) {
    return;
  }
  const code = match[0].charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
  findings.error({ file }, `File ${relPath} contains prohibited control character (0x${code})`);
}

/** Report any task line carrying two or more acceptance checkbox items. */
function scanFusedAcceptance(
  taskFile: string,
  file: string,
  content: string,
  findings: LintFindingSet,
): void {
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    const count = line.match(ACCEPTANCE_CHECKBOX_REGEX)?.length ?? 0;
    if (count > 1) {
      findings.error(
        { file },
        `Task in ${taskFile} contains fused acceptance lines on line ${index + 1}`,
      );
    }
  });
}

export interface LintResult {
  readonly valid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
  readonly findings: LintFinding[];
  readonly repository: LintFinding[];
}

export interface LintOptions {
  readonly logger?: LintLogger;
  /** The change folder being linted, used to attribute OpenSpec issues. */
  readonly changeFolder?: string;
  /** A graph built once per lint run; built here when absent. */
  readonly importGraph?: ImportGraph;
}

export interface OpenSpecFindings {
  readonly errors: string[];
  readonly warnings: string[];
}

export interface OpenSpecValidationOutcome extends OpenSpecFindings {
  readonly ran: boolean;
  readonly bin: string | null;
  readonly version: string | null;
  readonly findings: LintFinding[];
  readonly repository: LintFinding[];
}

interface OpenSpecSettings {
  readonly bin?: string;
  readonly schema?: string;
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

function levelOf(value: unknown): LintSeverity {
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

const FINDING_CONTAINERS: ReadonlyArray<readonly [string, LintSeverity | undefined]> = [
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
  const push = (level: LintSeverity, message: string): void => {
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

  const visit = (value: unknown, hint?: LintSeverity): void => {
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

/**
 * Maps a validator version assessment to the single finding it produces: none
 * for the pin, one warning inside the declared peer range, and one error citing
 * ADR 004 and the install command outside it.
 */
function versionFinding(assessment: OpenSpecVersionAssessment): {
  readonly error?: string;
  readonly warning?: string;
} {
  if (assessment.status === 'in-range' && assessment.range !== null) {
    return { warning: formatInRangeWarning(assessment.version, assessment.range) };
  }
  if (assessment.status === 'out-of-range') {
    return {
      error: `OpenSpec validator version ${assessment.version} differs from pinned ${OPENSPEC_EXPECTED_VERSION}. ${OPENSPEC_PIN_REMEDIATION}`,
    };
  }
  return {};
}

/** The proposal file an items-less OpenSpec finding is charged to. */
function legacyProposalFile(context: OpenSpecIssueContext): string {
  return context.changeFolder
    ? `${context.openspecRoot}/changes/${context.changeFolder}/proposal.md`
    : 'proposal.md';
}

/** Charge an items-less OpenSpec output to the linted change. */
function addLegacyFindings(
  output: string,
  context: OpenSpecIssueContext,
  findings: LintFindingSet,
): number {
  const file = legacyProposalFile(context);
  const legacy = parseOpenSpecFindings(output);
  for (const message of legacy.errors) {
    findings.error({ file }, `${OPENSPEC_ERROR_PREFIX} ${appendUnsupportedNote(message)}`);
  }
  for (const message of legacy.warnings) {
    findings.warning({ file }, `${OPENSPEC_ERROR_PREFIX} ${appendUnsupportedNote(message)}`);
  }
  return legacy.errors.length + legacy.warnings.length;
}

/** Run one validator command and fold its issues into the finding collector. */
async function collectCommandFindings(
  bin: string,
  args: string[],
  projectRoot: string,
  timeout: number,
  context: OpenSpecIssueContext,
  findings: LintFindingSet,
  repository: LintFinding[],
): Promise<{ code: number; count: number; detail: string }> {
  const outcome = await execFileCapture(bin, args, {
    cwd: projectRoot,
    env: { ...process.env, OPENSPEC_TELEMETRY: '0' },
    timeout,
  });
  const scan = await scanOpenSpecIssues(outcome.stdout, context);
  let count: number;
  if (scan === null) {
    count = addLegacyFindings(outcome.stdout, context, findings);
  } else {
    for (const finding of scan.findings) {
      findings.addOwn(finding);
    }
    for (const finding of scan.repository) {
      repository.push(finding);
    }
    count = scan.findings.length + scan.repository.length;
  }
  return {
    code: outcome.code,
    count,
    detail: (outcome.stderr || outcome.stdout).trim().split('\n')[0],
  };
}

/** Assess the installed validator and record the one version finding it yields. */
async function collectVersionFindings(
  projectRoot: string,
  logger: LintLogger | undefined,
  file: string,
  findings: LintFindingSet,
): Promise<string | null> {
  const version = await resolveOpenSpecVersion(projectRoot);
  if (!version) {
    findings.error(
      { file },
      `OpenSpec validator version could not be resolved from node_modules/@fission-ai/openspec/package.json. ${OPENSPEC_PIN_REMEDIATION}`,
    );
    return null;
  }
  logger?.info(`openspec version ${version}`);
  const finding = versionFinding(await assessOpenSpecVersion(version));
  if (finding.error !== undefined) {
    findings.error({ file }, finding.error);
  }
  if (finding.warning !== undefined) {
    findings.warning({ file }, finding.warning);
  }
  return version;
}

/**
 * Runs the local OpenSpec validator for changes and specs. Validation failures
 * are returned prefixed with `openspec:`. A missing binary or a version outside
 * the declared peer range is an error that cites ADR 004 and the install
 * command; a version inside the range that differs from the pin warns and cites
 * ADR 005. Linting fails closed rather than silently degrading.
 */
export async function validateWithOpenSpec(
  projectRoot: string,
  config: OsqConfig,
  options: LintOptions = {},
): Promise<OpenSpecValidationOutcome> {
  const file = 'package.json';
  const findings = new LintFindingSet();
  const repository: LintFinding[] = [];
  const bin = await resolveOpenSpecBin(projectRoot, config);
  if (!bin) {
    findings.error(
      { file },
      `OpenSpec validator binary is unavailable at node_modules/.bin/openspec. ${OPENSPEC_PIN_REMEDIATION}`,
    );
    return {
      errors: findings.errors(),
      warnings: findings.warnings(),
      findings: [...findings.findings],
      repository,
      ran: false,
      bin: null,
      version: null,
    };
  }

  const version = await collectVersionFindings(projectRoot, options.logger, file, findings);
  const timeout = config.timeouts.verifyTimeoutSeconds * 1000;
  const context: OpenSpecIssueContext = {
    projectRoot,
    openspecRoot: resolveOpenSpecRoot(config),
    changeFolder: options.changeFolder ?? null,
  };
  const commands: string[][] = [
    ['validate', '--changes', '--strict', '--json', '--no-interactive'],
    ['validate', '--specs', '--strict', '--json', '--no-interactive'],
  ];

  for (const args of commands) {
    const { code, count, detail } = await collectCommandFindings(
      bin,
      args,
      projectRoot,
      timeout,
      context,
      findings,
      repository,
    );
    if (code !== 0 && count === 0) {
      findings.error(
        { file },
        `${OPENSPEC_ERROR_PREFIX} ${args.join(' ')} exited with code ${code}${detail ? `: ${detail}` : ''}`,
      );
    }
  }

  return {
    errors: findings.errors(),
    warnings: findings.warnings(),
    findings: [...findings.findings],
    repository,
    ran: true,
    bin,
    version,
  };
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
  deltaFile: string,
  requirements: DeltaRequirement[],
  findings: LintFinding[],
): void {
  for (const requirement of requirements) {
    const verb = instructionVerbOf(requirement.name);
    if (!verb) {
      continue;
    }
    findings.push(
      makeFinding(
        'error',
        { file: deltaFile, requirement: requirement.name },
        `${OPENSPEC_ERROR_PREFIX} ${capability}: requirement "${requirement.name}" is instruction-shaped ("${verb}"); delta specs must define living capability requirements, not instructions`,
      ),
    );
  }
}

/**
 * Verifies that every delta operation targeting a requirement resolves against
 * the living base spec at `openspec/specs/<capability>/spec.md`. Applying the
 * delta through the deterministic merge engine reports unmatched MODIFIED,
 * REMOVED, or RENAMED targets; ADDED-only deltas may create a new capability.
 * Merged results are validated against their living spec's repository findings.
 */
export async function verifyDeltaTargets(
  projectRoot: string,
  folderPath: string,
  config: OsqConfig,
  repositoryFindings: readonly LintFinding[] = [],
): Promise<LintFinding[]> {
  const findings: LintFinding[] = [];
  const mergedSpecs: MergedSpecInput[] = [];
  const deltasDir = path.join(folderPath, 'specs');

  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(deltasDir, { withFileTypes: true });
  } catch {
    return findings;
  }

  const capabilities = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (capabilities.length === 0) {
    return findings;
  }

  const specsRoot = path.join(projectRoot, resolveOpenSpecRoot(config), 'specs');

  for (const capability of capabilities) {
    const deltaPath = path.join(deltasDir, capability, 'spec.md');
    const deltaFile = repositoryPath(projectRoot, deltaPath);
    const deltaContent = await fs.readFile(deltaPath, 'utf8').catch(() => null);
    if (deltaContent === null) {
      continue;
    }

    const baseContent = await fs
      .readFile(path.join(specsRoot, capability, 'spec.md'), 'utf8')
      .catch(() => null);

    const delta = parseDelta(deltaContent);
    scanInstructionShapedRequirements(
      capability,
      deltaFile,
      [...delta.added, ...delta.modified, ...delta.removed],
      findings,
    );

    try {
      const merged = mergeDelta(baseContent, capability, delta);
      mergedSpecs.push({ capability, mergedContent: merged, deltaFile });
    } catch (error) {
      if (error instanceof DeltaMergeError) {
        findings.push(
          makeFinding(
            'error',
            { file: deltaFile },
            `${OPENSPEC_ERROR_PREFIX} ${capability}: ${error.message}`,
          ),
        );
      } else {
        throw error;
      }
    }
  }

  if (mergedSpecs.length > 0) {
    findings.push(
      ...(await collectMergedSpecFindings(projectRoot, config, mergedSpecs, repositoryFindings)),
    );
  }

  return findings;
}

/** Validate every merged spec when the validator binary is available. */
async function collectMergedSpecFindings(
  projectRoot: string,
  config: OsqConfig,
  mergedSpecs: readonly MergedSpecInput[],
  repositoryFindings: readonly LintFinding[],
): Promise<LintFinding[]> {
  const bin = await resolveOpenSpecBin(projectRoot, config);
  if (!bin) {
    return [];
  }
  return validateMergedSpecs(
    config,
    bin,
    resolveOpenSpecRoot(config),
    mergedSpecs,
    repositoryFindings,
  );
}

/**
 * One task's resolved existing scope files, collected during linting so later
 * cross-task analysis reuses the resolver projection instead of re-walking.
 */
interface ResolvedTaskScope {
  readonly taskFile: string;
  readonly taskNumber: string;
  readonly taskPath: string;
  readonly existingPaths: readonly string[];
  /** Every resolved scope path, existing or not. */
  readonly resolvedPaths: readonly string[];
  readonly task: TaskData;
  readonly verifyAnalysis: VerifyCommandAnalysis | null;
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
function collectOverlapWarnings(
  scopes: readonly ResolvedTaskScope[],
): Array<{ file: string; message: string }> {
  const ordered = [...scopes].sort((a, b) => compareNumericPrefix(a.taskFile, b.taskFile));
  const warnings: Array<{ file: string; message: string }> = [];

  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      const other = new Set(ordered[right].existingPaths);
      const shared = ordered[left].existingPaths
        .filter((relativePath) => other.has(relativePath))
        .sort();
      for (const relativePath of shared) {
        warnings.push({
          file: relativePath,
          message: `Tasks ${ordered[left].taskNumber} and ${ordered[right].taskNumber} share resolved scope file ${relativePath}`,
        });
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
function collectHarnessFixtureWarnings(
  scopes: readonly ResolvedTaskScope[],
): Array<{ file: string; message: string }> {
  const ordered = [...scopes].sort((a, b) => compareNumericPrefix(a.taskFile, b.taskFile));
  const warnings: Array<{ file: string; message: string }> = [];
  for (const scope of ordered) {
    const hasHarness = scope.existingPaths.some((entry) => entry.startsWith('src/harness/'));
    const hasFixtures = scope.existingPaths.some(
      (entry) => entry === 'tests/fixtures/events' || entry.startsWith('tests/fixtures/events/'),
    );
    if (hasHarness && !hasFixtures) {
      warnings.push({
        file: scope.taskPath,
        message: `Task in ${scope.taskFile} resolves src/harness/ scope but no file under tests/fixtures/events/`,
      });
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
  const findings = new LintFindingSet();
  const packageScripts = await readRootPackageScripts(projectRoot);

  // Check: no authored change-folder file contains prohibited control characters
  for (const relPath of await collectArtifactFiles(folderPath, folderPath)) {
    const content = await fs.readFile(path.join(folderPath, relPath), 'utf8');
    scanControlCharacters(
      relPath,
      repositoryPath(projectRoot, path.join(folderPath, relPath)),
      content,
      findings,
    );
  }

  const resolvedDoc = await resolveChangeDoc(folderPath);
  if (!resolvedDoc) {
    findings.error(
      { file: repositoryPath(projectRoot, path.join(folderPath, 'proposal.md')) },
      'proposal.md (or legacy spec.md) not found in change folder',
    );
    return lintResult(findings);
  }

  const docRepoPath = repositoryPath(projectRoot, resolvedDoc.path);
  const specContent = await fs.readFile(resolvedDoc.path, 'utf8');
  const spec = parseSpecMd(specContent);

  // Check: proposals must declare a change-level verify command
  if (resolvedDoc.kind === 'proposal' && !spec.verify) {
    findings.error(
      { file: docRepoPath },
      'proposal.md must declare a verify command in frontmatter',
    );
  }

  // Check: proposals must declare a non-empty ## Surface section; legacy spec.md
  // change documents are exempt exactly as they are for the verify check.
  if (
    resolvedDoc.kind === 'proposal' &&
    proposalSurfaceIsEmpty(parseFrontmatter(specContent).body)
  ) {
    findings.error({ file: docRepoPath, section: 'Surface' }, PROPOSAL_SURFACE_ERROR);
  }

  // Check: Decisions section and project rules block, when the project has ADRs.
  // A legacy spec.md change document is exempt exactly as it is for Surface.
  if (resolvedDoc.kind === 'proposal') {
    for (const finding of await collectDecisionsFindings({
      projectRoot,
      folderPath,
      proposalPath: docRepoPath,
      proposalBody: parseFrontmatter(specContent).body,
      config,
    })) {
      findings.addOwn(finding);
    }
  }

  // Check: the change-level verify participates in the same trust analysis
  if (spec.verify) {
    const docLabel = path.basename(resolvedDoc.path);
    const analysis = await analyzeVerifyCommand(projectRoot, spec.verify, packageScripts);
    if (analysis.placeholder) {
      findings.error({ file: docRepoPath }, placeholderVerifyError(docLabel));
    } else if (!chainsVerifyCommand(spec.verify)) {
      if (analysis.missingScript !== null) {
        findings.error(
          { file: docRepoPath },
          missingPackageScriptError(docLabel, analysis.missingScript),
        );
      } else if (analysis.unresolved) {
        findings.warning({ file: docRepoPath }, unresolvedVerifyWarning(docLabel, spec.verify));
      }
    }
  }

  // Check: features.writes is retired; delta specs are the sole writes declaration
  if (hasDeclaredWrites(parseFrontmatter(specContent).data)) {
    findings.error(
      { file: docRepoPath },
      'features.writes is no longer supported in proposal frontmatter; write declarations are derived strictly from delta specs under specs/<capability>/spec.md',
    );
  }

  // Check: contract tables count
  if (spec.contractTablesCount > config.limits.maxContractTables) {
    findings.error(
      { file: docRepoPath },
      `Contract has ${spec.contractTablesCount} tables (max allowed is ${config.limits.maxContractTables})`,
    );
  }

  // Check: depends_on exists
  for (const dep of spec.dependsOn) {
    const exists = await checkDependencyExists(projectRoot, dep, config);
    if (!exists) {
      findings.error({ file: docRepoPath }, `depends_on names missing change: ${dep}`);
    }
  }

  // Check: fixes names an existing active, archived, or rejected change
  for (const fixed of spec.fixes) {
    const exists = await checkDependencyExists(projectRoot, fixed, config);
    if (!exists) {
      findings.error({ file: docRepoPath }, `fixes names missing change: ${fixed}`);
    }
  }

  // Tasks checks
  const tasksDir = path.join(folderPath, 'tasks');
  const tasksRepoPath = repositoryPath(projectRoot, tasksDir);
  let taskEntries: string[] = [];
  try {
    taskEntries = (await fs.readdir(tasksDir)).filter((e) => e.endsWith('.md'));
  } catch {
    findings.error({ file: tasksRepoPath }, 'tasks directory not found in change folder');
  }

  if (taskEntries.length === 0) {
    findings.error({ file: tasksRepoPath }, 'No task files found under tasks/');
  }

  const resolvedTaskScopes: ResolvedTaskScope[] = [];

  for (const taskFile of taskEntries) {
    const taskPath = path.join(tasksDir, taskFile);
    const taskRepoPath = repositoryPath(projectRoot, taskPath);
    const taskContent = await fs.readFile(taskPath, 'utf8');
    const task = parseTaskMd(taskContent);

    // Check: acceptance items must each occupy their own line
    scanFusedAcceptance(taskFile, taskRepoPath, taskContent, findings);

    // Check: tests.modify, when declared, must be a boolean
    const testsModify = readTestsModifyDeclaration(taskContent);
    if (testsModify.present && !testsModify.valid) {
      findings.error(
        { file: taskRepoPath },
        `Task in ${taskFile} tests.modify must be a boolean (got ${JSON.stringify(testsModify.value)})`,
      );
    }

    // Resolve the declared scope once through the shared deterministic resolver.
    const resolved = task.scope.length > 0 ? await resolveScope(projectRoot, task.scope) : [];
    const existingPaths = resolved
      .filter((entry) => entry.absolutePath !== null)
      .map((entry) => entry.relativePath);
    const taskLabel = `Task in ${taskFile}`;
    const analysis = task.verify
      ? await analyzeVerifyCommand(projectRoot, task.verify, packageScripts)
      : null;
    resolvedTaskScopes.push({
      taskFile,
      taskNumber: taskFile.replace(/\.md$/, ''),
      taskPath: taskRepoPath,
      existingPaths,
      resolvedPaths: resolved.map((entry) => entry.relativePath),
      task,
      verifyAnalysis: analysis,
    });

    // Check: touching an existing test file requires tests.modify: true
    if (!task.testsModify && existingPaths.length > 0) {
      const touched = existingPaths.filter(isTestFilePath).sort();
      if (touched.length > 0) {
        findings.error(
          { file: taskRepoPath },
          `Task in ${taskFile} scope touches existing test files (${touched.join(', ')}) without tests.modify: true`,
        );
      }
    }

    // Check: verify command empty, placeholder, chained, or missing script
    if (analysis === null) {
      findings.error({ file: taskRepoPath }, `Task in ${taskFile} verify command is empty`);
    } else if (analysis.placeholder) {
      findings.error({ file: taskRepoPath }, placeholderVerifyError(taskLabel));
    } else if (chainsVerifyCommand(task.verify)) {
      findings.error({ file: taskRepoPath }, chainedVerifyError(taskFile, task.verify));
    } else if (analysis.missingScript !== null) {
      findings.error(
        { file: taskRepoPath },
        missingPackageScriptError(taskLabel, analysis.missingScript),
      );
    }

    // Check: acceptance checklist length
    if (task.acceptance.length > config.limits.maxAcceptanceLines) {
      findings.error(
        { file: taskRepoPath },
        `Task in ${taskFile} acceptance lines (${task.acceptance.length}) exceeds limit ${config.limits.maxAcceptanceLines}`,
      );
    }

    // Check: scope expands to more than maxScopeFiles
    if (task.scope.length > config.limits.maxScopeFiles) {
      findings.error(
        { file: taskRepoPath },
        `Task in ${taskFile} scope specifies ${task.scope.length} patterns, exceeding limit ${config.limits.maxScopeFiles}`,
      );
    }
  }

  // Check: harness scope should cover the event fixtures without failing lint
  for (const entry of collectHarnessFixtureWarnings(resolvedTaskScopes)) {
    findings.warning({ file: entry.file }, entry.message);
  }

  // Check: shared resolved files across tasks are reported as non-failing warnings
  for (const entry of collectOverlapWarnings(resolvedTaskScopes)) {
    findings.warning({ file: entry.file }, entry.message);
  }

  // Tasks are analyzed in numeric order so earlier scopes can cover a later
  // task's new paths. The unresolved-target warning is suppressed when every
  // missing named path is one the task's own or an earlier task's scope covers.
  const orderedScopes = [...resolvedTaskScopes].sort((a, b) =>
    compareNumericPrefix(a.taskFile, b.taskFile),
  );
  const earlierScopes: string[][] = [];
  for (const scope of orderedScopes) {
    if (scope.verifyAnalysis?.unresolved && !chainsVerifyCommand(scope.task.verify)) {
      const namedPaths = listNamedPaths(scope.task.verify);
      const missingPaths = await missingNamedPaths(projectRoot, scope.task.verify);
      const covered =
        namedPaths.length > 0 &&
        missingPaths.every((namedPath) =>
          namedPathCoveredByScopes(namedPath, [scope.task.scope, ...earlierScopes]),
        );
      if (!covered) {
        findings.warning(
          { file: scope.taskPath },
          unresolvedVerifyWarning(`Task in ${scope.taskFile}`, scope.task.verify),
        );
      }
    }
    earlierScopes.push([...scope.task.scope]);
  }

  // Check: a task whose verify names a test it creates must declare red, and a
  // named path no task scope up to this task covers cannot be created at all
  const verifyStartTasks: VerifyStartTask[] = orderedScopes.map((scope) => ({
    taskNumber: scope.taskNumber,
    verify: scope.task.verify,
    verifyStarts: scope.task.verifyStarts,
    scope: scope.task.scope,
  }));
  const verifyStarts = await analyzeVerifyStarts(projectRoot, verifyStartTasks);
  for (const contradiction of verifyStarts.contradictions) {
    findings.warning(
      { file: taskRepoPathFor(projectRoot, tasksDir, contradiction.taskNumber) },
      `Task in ${contradiction.taskNumber}.md declares verify_starts: ${contradiction.start} but its verify names ${contradiction.path}, which the task creates`,
    );
  }
  for (const uncreatable of verifyStarts.uncreatable) {
    findings.warning(
      { file: taskRepoPathFor(projectRoot, tasksDir, uncreatable.taskNumber) },
      `Task in ${uncreatable.taskNumber}.md verify names ${uncreatable.path}, which no task in the change can create`,
    );
  }

  // Check: import-graph impact warnings never fail the change. The graph is
  // built once per lint run by the CLI and passed through `LintOptions`.
  const importGraph =
    options.importGraph ??
    (await buildImportGraph(projectRoot, { skip: [config.paths.openspecRoot] }));
  for (const finding of await collectImpactFindings({
    projectRoot,
    folderPath,
    config,
    proposalPath: docRepoPath,
    reads: spec.features.reads,
    tasks: resolvedTaskScopes.map((scope) => ({
      taskNumber: scope.taskNumber,
      taskPath: scope.taskPath,
      existingPaths: scope.existingPaths,
      testsModify: scope.task.testsModify,
      verify: scope.task.verify,
    })),
    importGraph,
  })) {
    findings.addOwn(finding);
  }

  // Check: scenario traceability links and the blast radius of changed
  // scenarios. Reuses the graph already built for impact lint and builds the
  // scenario index once.
  for (const finding of await collectTraceabilityFindings({
    projectRoot,
    folderPath,
    config,
    proposalPath: docRepoPath,
    tasks: resolvedTaskScopes.map((scope) => ({
      taskNumber: scope.taskNumber,
      taskPath: scope.taskPath,
      resolvedPaths: scope.resolvedPaths,
      testsModify: scope.task.testsModify,
    })),
    importGraph,
  })) {
    findings.addOwn(finding);
  }

  // Check: pinned OpenSpec validator and strict validation. Runs before the
  // delta check so living-spec repository findings can suppress inherited
  // warnings in the merged specs.
  const changeFolder = path.basename(folderPath);
  const openSpec = await validateWithOpenSpec(projectRoot, config, {
    ...options,
    changeFolder,
  });
  for (const finding of openSpec.findings) {
    findings.addOwn(finding);
  }
  for (const finding of openSpec.repository) {
    findings.addRepository(finding);
  }

  // Check: delta targets resolve against living base specs before approval and
  // the living spec each delta will produce validates after archive.
  for (const finding of await verifyDeltaTargets(
    projectRoot,
    folderPath,
    config,
    openSpec.repository,
  )) {
    findings.addOwn(finding);
  }

  return lintResult(findings);
}

/** Repository path of a task file named by its numeric task number. */
function taskRepoPathFor(projectRoot: string, tasksDir: string, taskNumber: string): string {
  return repositoryPath(projectRoot, path.join(tasksDir, `${taskNumber}.md`));
}

/** Assemble the public lint result from the accumulated findings. */
function lintResult(findings: LintFindingSet): LintResult {
  return {
    valid: findings.errors().length === 0,
    errors: findings.errors(),
    warnings: findings.warnings(),
    findings: [...findings.findings],
    repository: [...findings.repository],
  };
}
