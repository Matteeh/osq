import { execFile } from 'node:child_process';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from './config.js';
import { DeltaMergeError, mergeDelta, parseDelta } from './delta.js';
import { getArchiveDir, getChangesDir } from './layout.js';
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
        if (lowered.includes('warn')) {
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

    try {
      mergeDelta(baseContent, capability, parseDelta(deltaContent));
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
 * Translate a task scope glob into an anchored regular expression. Supports `*`
 * (within one path segment), `**` (across segments), and `?`; a trailing `/`
 * expands to that directory's recursive contents.
 */
function globToRegExp(glob: string): RegExp {
  let normalized = glob.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.endsWith('/')) {
    normalized = `${normalized}**`;
  }
  normalized = normalized.replace(/\/+$/, '');

  let source = '^';
  let index = 0;
  while (index < normalized.length) {
    const char = normalized[index];
    if (char === '*') {
      if (normalized[index + 1] === '*') {
        index += 2;
        if (normalized[index] === '/') {
          index += 1;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        index += 1;
        source += '[^/]*';
      }
    } else if (char === '?') {
      index += 1;
      source += '[^/]';
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      index += 1;
    }
  }

  return new RegExp(`${source}$`);
}

/**
 * List repository-relative POSIX paths of every file under `tests/`. Only
 * preexisting files are returned, so a task that creates a brand new test file
 * never looks like it is touching an existing one.
 */
async function listExistingTestFiles(projectRoot: string): Promise<string[]> {
  const files: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        files.push(path.relative(projectRoot, full).split(path.sep).join('/'));
      }
    }
  };

  await walk(path.join(projectRoot, 'tests'));
  return files;
}

function touchedTestFiles(scope: string[], testFiles: string[]): string[] {
  const matchers = scope.map(globToRegExp);
  const touched = new Set<string>();
  for (const file of testFiles) {
    if (matchers.some((matcher) => matcher.test(file))) {
      touched.add(file);
    }
  }
  return [...touched].sort();
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

  let existingTestFiles: string[] | null = null;
  const getExistingTestFiles = async (): Promise<string[]> => {
    if (existingTestFiles === null) {
      existingTestFiles = await listExistingTestFiles(projectRoot);
    }
    return existingTestFiles;
  };

  for (const taskFile of taskEntries) {
    const taskPath = path.join(tasksDir, taskFile);
    const taskContent = await fs.readFile(taskPath, 'utf8');
    const task = parseTaskMd(taskContent);

    // Check: tests.modify, when declared, must be a boolean
    const testsModify = readTestsModifyDeclaration(taskContent);
    if (testsModify.present && !testsModify.valid) {
      errors.push(
        `Task in ${taskFile} tests.modify must be a boolean (got ${JSON.stringify(testsModify.value)})`,
      );
    }

    // Check: touching an existing test file requires tests.modify: true
    if (!task.testsModify && task.scope.length > 0) {
      const touched = touchedTestFiles(task.scope, await getExistingTestFiles());
      if (touched.length > 0) {
        errors.push(
          `Task in ${taskFile} scope touches existing test files (${touched.join(', ')}) without tests.modify: true`,
        );
      }
    }

    // Warning: task title contains " and "
    if (task.title.toLowerCase().includes(' and ')) {
      warnings.push(`Task in ${taskFile} title contains " and ": "${task.title}"`);
    }

    // Check: verify command empty or chains commands
    if (!task.verify) {
      errors.push(`Task in ${taskFile} verify command is empty`);
    } else if (
      task.verify.includes('&&') ||
      task.verify.includes(';') ||
      task.verify.includes('|')
    ) {
      errors.push(`Task in ${taskFile} verify chains commands ("${task.verify}")`);
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
