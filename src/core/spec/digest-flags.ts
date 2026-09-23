import fs from 'node:fs/promises';
import path from 'node:path';
import { CLAUDE_PLAN_COMMAND_PATH } from '../foundation/init-blocks.js';
import { verifyStartsConflictFlags } from './digest-verify-starts.js';
import type { ApprovalDigestCapability, ApprovalFlag } from './digest.js';
import type { VerifyStarts } from './parser.js';

/** One task projection: identity, verify, declared scope, and resolved scope paths. */
export interface ApprovalFlagTask {
  readonly number: string;
  readonly verify: string;
  readonly verifyStarts: VerifyStarts;
  readonly scope: readonly string[];
  readonly paths: readonly string[];
}

/** Everything the flag rules need from the digested change and its project. */
export interface ApprovalFlagInput {
  readonly projectRoot: string;
  readonly openspecRoot: string;
  readonly proposalVerify: string;
  readonly tasks: readonly ApprovalFlagTask[];
  readonly capabilities: readonly ApprovalDigestCapability[];
}

const SENSITIVE_KINDS = [
  'package manifest',
  'lockfile',
  'CI workflow',
  'osq config',
  'OpenSpec config',
  'managed instructions',
  'env file',
] as const;

const PACKAGE_MANIFEST_BASENAMES = new Set(
  'package.json pnpm-workspace.yaml pyproject.toml Cargo.toml go.mod'.split(' '),
);
const LOCKFILE_BASENAMES = new Set(
  'pnpm-lock.yaml package-lock.json npm-shrinkwrap.json yarn.lock bun.lock bun.lockb poetry.lock uv.lock Cargo.lock go.sum'.split(
    ' ',
  ),
);
const OSQ_CONFIG_BASENAMES = new Set('osq.config.ts osq.config.js osq.config.mjs'.split(' '));
const MANAGED_INSTRUCTION_BASENAMES = new Set('AGENTS.md PLANNER.md CLAUDE.md'.split(' '));
const ENV_TEMPLATE_BASENAMES = new Set('.env.example .env.sample .env.template'.split(' '));
const ENV_FILE_REGEX = /^\.env(?:\..+)?$/;
const RUNNER_MARKERS = ['--test', 'vitest', 'jest', 'mocha', 'pytest', 'go test', 'cargo test'];
const PACKAGE_RUNNER_REGEX = /\b(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:test|verify)\b/;

function basename(relativePath: string): string {
  const index = relativePath.lastIndexOf('/');
  return index === -1 ? relativePath : relativePath.slice(index + 1);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareTaskNumbers(a: string, b: string): number {
  const numA = Number.parseInt(a, 10);
  const numB = Number.parseInt(b, 10);
  if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) return numA - numB;
  return compareText(a, b);
}

function taskPhrase(numbers: readonly string[]): string {
  const sorted = [...numbers].sort(compareTaskNumbers);
  return sorted.length === 1 ? `task ${sorted[0]}` : `tasks ${sorted.join(', ')}`;
}

/** One flag per task pair sharing any resolved scope path. */
function sharedFileFlags(tasks: readonly ApprovalFlagTask[]): ApprovalFlag[] {
  const ordered = [...tasks].sort((a, b) => compareTaskNumbers(a.number, b.number));
  const flags: ApprovalFlag[] = [];
  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      const first = ordered[left];
      const second = ordered[right];
      const other = new Set(second.paths);
      const shared = first.paths.filter((entry) => other.has(entry)).sort(compareText);
      if (shared.length === 0) continue;
      flags.push({
        id: 'shared_file',
        label: `shared files in tasks ${first.number} and ${second.number}`,
        excerpt: `${shared.join(', ')}; the watcher will halt for recertification when task ${second.number} changes them`,
      });
    }
  }
  return flags;
}

/** The first sensitive kind a resolved path matches, or null. */
function sensitiveKindOf(relativePath: string, openspecRoot: string): string | null {
  const name = basename(relativePath);
  if (PACKAGE_MANIFEST_BASENAMES.has(name)) return 'package manifest';
  if (LOCKFILE_BASENAMES.has(name)) return 'lockfile';
  if (relativePath.startsWith('.github/workflows/') || relativePath === '.gitlab-ci.yml') {
    return 'CI workflow';
  }
  if (OSQ_CONFIG_BASENAMES.has(name)) return 'osq config';
  if (relativePath === `${openspecRoot}/config.yaml`) return 'OpenSpec config';
  const claudePath = CLAUDE_PLAN_COMMAND_PATH.split(path.sep).join('/');
  if (
    MANAGED_INSTRUCTION_BASENAMES.has(name) ||
    relativePath === claudePath ||
    relativePath.startsWith('.opencode/agent/')
  ) {
    return 'managed instructions';
  }
  if (ENV_FILE_REGEX.test(name) && !ENV_TEMPLATE_BASENAMES.has(name)) return 'env file';
  return null;
}

/** One flag per sensitive kind present, naming each path and its tasks. */
function sensitivePathFlags(
  tasks: readonly ApprovalFlagTask[],
  openspecRoot: string,
): ApprovalFlag[] {
  const byKind = new Map<string, Map<string, Set<string>>>();
  for (const task of tasks) {
    for (const relativePath of task.paths) {
      const kind = sensitiveKindOf(relativePath, openspecRoot);
      if (kind === null) continue;
      const paths = byKind.get(kind) ?? new Map<string, Set<string>>();
      const numbers = paths.get(relativePath) ?? new Set<string>();
      numbers.add(task.number);
      paths.set(relativePath, numbers);
      byKind.set(kind, paths);
    }
  }
  const flags: ApprovalFlag[] = [];
  for (const kind of SENSITIVE_KINDS) {
    const paths = byKind.get(kind);
    if (!paths || paths.size === 0) continue;
    const excerpt = [...paths.entries()]
      .sort((a, b) => compareText(a[0], b[0]))
      .map(([relativePath, numbers]) => `${relativePath} in ${taskPhrase([...numbers])}`)
      .join('; ');
    flags.push({ id: 'sensitive_path', label: `${kind} in scope`, excerpt });
  }
  return flags;
}

/** True when a command names neither a test file nor a recognized runner. */
function verifyLacksTest(command: string): boolean {
  const trimmed = command.trim();
  if (trimmed === '') return false;
  if (trimmed.includes('.test.') || trimmed.includes('.spec.')) return false;
  if (/(?:^|[\s/])(?:tests?|__tests__)\//.test(trimmed)) return false;
  if (RUNNER_MARKERS.some((marker) => trimmed.includes(marker))) return false;
  return !PACKAGE_RUNNER_REGEX.test(trimmed);
}

/** One flag per task and proposal verify that names no test file or runner. */
function verifyWithoutTestFlags(
  tasks: readonly ApprovalFlagTask[],
  proposalVerify: string,
): ApprovalFlag[] {
  const ordered = [...tasks].sort((a, b) => compareTaskNumbers(a.number, b.number));
  const flags: ApprovalFlag[] = [];
  for (const task of ordered) {
    if (verifyLacksTest(task.verify)) {
      flags.push({
        id: 'verify_without_test',
        label: `verify without a test in task ${task.number}`,
        excerpt: task.verify,
      });
    }
  }
  if (verifyLacksTest(proposalVerify)) {
    flags.push({
      id: 'verify_without_test',
      label: 'verify without a test in the proposal',
      excerpt: proposalVerify,
    });
  }
  return flags;
}

/** One flag per capability whose delta removes requirements. */
function removedRequirementFlags(
  capabilities: readonly ApprovalDigestCapability[],
): ApprovalFlag[] {
  return [...capabilities]
    .filter((capability) => capability.removed.length > 0)
    .sort((a, b) => compareText(a.name, b.name))
    .map((capability) => ({
      id: 'removed_requirement' as const,
      label: `removes ${capability.removed.length} requirements from ${capability.name}`,
      excerpt: capability.removed.join(', '),
    }));
}

/** One flag per delta capability whose living spec file does not exist. */
async function unknownCapabilityFlags(input: ApprovalFlagInput): Promise<ApprovalFlag[]> {
  const flags: ApprovalFlag[] = [];
  const ordered = [...input.capabilities].sort((a, b) => compareText(a.name, b.name));
  for (const capability of ordered) {
    const specPath = path.join(
      input.projectRoot,
      input.openspecRoot,
      'specs',
      capability.name,
      'spec.md',
    );
    const exists = await fs
      .stat(specPath)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      flags.push({
        id: 'unknown_capability',
        label: `unknown capability ${capability.name}`,
        excerpt: `no living spec at ${input.openspecRoot}/specs/${capability.name}/spec.md`,
      });
    }
  }
  return flags;
}

/** Build every approval flag in the fixed id order, then task-number or name order. */
export async function buildApprovalFlags(input: ApprovalFlagInput): Promise<ApprovalFlag[]> {
  const openspecRoot = input.openspecRoot
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
  return [
    ...sharedFileFlags(input.tasks),
    ...sensitivePathFlags(input.tasks, openspecRoot),
    ...verifyWithoutTestFlags(input.tasks, input.proposalVerify),
    ...removedRequirementFlags(input.capabilities),
    ...(await unknownCapabilityFlags(input)),
    ...(await verifyStartsConflictFlags(input.projectRoot, input.tasks)),
  ];
}
