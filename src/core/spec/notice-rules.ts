import { DEFAULT_NOTICES_CONFIG, type NoticesConfig } from '../foundation/config-notices.js';
import { isCapabilityOptedIn } from '../foundation/config-traceability.js';
import type { OsqConfig } from '../foundation/config.js';
import { scopeCoversPath } from '../run/scope.js';
import { readAssumptions } from './assumptions.js';
import type { ApprovalDigest } from './digest.js';
import { hashChangeFolder } from './hasher.js';
import {
  type ChangeDelta,
  type TaskFacts,
  readChangeDeltas,
  readProposalBody,
  readTaskFacts,
} from './notice-readers.js';
import type { ApprovalNoticeId, RuleFinding } from './notices.js';
import { countPlanRevisions, readPlanReady } from './plan-ready.js';

interface RuleContext {
  readonly folderPath: string;
  readonly config: OsqConfig;
  readonly notices: NoticesConfig;
  readonly digest: ApprovalDigest;
  readonly tasks: readonly TaskFacts[];
  readonly proposalBody: string;
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function finding(id: ApprovalNoticeId, label: string, detail: string): RuleFinding {
  return { id, label, detail };
}

function add(list: RuleFinding[], value: RuleFinding | null): void {
  if (value) list.push(value);
}

function rulesPathNotice(context: RuleContext): RuleFinding | null {
  const patterns = [
    'AGENTS.md',
    'PLANNER.md',
    'CLAUDE.md',
    `${context.config.paths.decisions}/`,
    `${context.config.paths.templates}/`,
    ...context.notices.rulePaths,
  ];
  const parts: string[] = [];
  for (const task of context.tasks) {
    const hits = task.paths
      .filter((entry) => scopeCoversPath(patterns, entry))
      .sort(compareCodeUnits);
    if (hits.length > 0) parts.push(`task ${task.number}: ${hits.join(', ')}`);
  }
  if (parts.length === 0) return null;
  return finding('rules_path', "scope reaches osq's rules", parts.join('; '));
}

function removedRequirementNotice(context: RuleContext): RuleFinding | null {
  const parts: string[] = [];
  for (const capability of context.digest.capabilities) {
    for (const requirement of capability.removed) parts.push(`${capability.name}: ${requirement}`);
  }
  if (parts.length === 0) return null;
  return finding('removed_requirement', 'removes requirements', parts.join('; '));
}

function adrDepartureNotice(context: RuleContext): RuleFinding | null {
  const flags = context.digest.flags.filter((flag) => flag.id === 'adr_departure');
  if (flags.length === 0) return null;
  return finding(
    'adr_departure',
    'departs from an ADR',
    flags.map((flag) => flag.excerpt).join('; '),
  );
}

function manyTasksNotice(context: RuleContext): RuleFinding | null {
  const count = context.digest.tasks.length;
  if (count <= context.notices.maxTasks) return null;
  const detail = `more than notices.maxTasks (${context.notices.maxTasks})`;
  return finding('many_tasks', `${count} tasks`, detail);
}

function largeScopeNotice(context: RuleContext): RuleFinding | null {
  const over = context.digest.tasks.filter(
    (task) => task.scopeFiles > context.notices.maxResolvedFiles,
  );
  if (over.length === 0) return null;
  const detail = over.map((task) => `task ${task.number}: ${task.scopeFiles} files`).join('; ');
  return finding('large_scope', 'large task scope', detail);
}

function packageJsonNotice(context: RuleContext): RuleFinding | null {
  const parts: string[] = [];
  for (const task of context.tasks) {
    const hits = task.paths
      .filter((entry) => entry.split('/').pop() === 'package.json')
      .sort(compareCodeUnits);
    for (const hit of hits) parts.push(`task ${task.number}: ${hit}`);
  }
  if (parts.length === 0) return null;
  return finding('package_json', 'package.json in scope', parts.join('; '));
}

function assumptionsNotice(context: RuleContext): RuleFinding | null {
  const lines = readAssumptions(context.proposalBody);
  if (lines === null || lines.length === 0) return null;
  const label = lines.length === 1 ? '1 assumption' : `${lines.length} assumptions`;
  return finding('assumptions', label, lines.join('; '));
}

function verifyStartsAnyNotice(context: RuleContext): RuleFinding | null {
  const anys = context.tasks.filter((task) => task.verifyStarts === 'any');
  if (anys.length === 0) return null;
  const detail = anys.map((task) => `task ${task.number}`).join('; ');
  return finding('verify_starts_any', 'verify_starts: any', detail);
}

function uncoveredParts(context: RuleContext, capabilities: readonly ChangeDelta[]): string[] {
  const optedIn = context.config.traceability?.capabilities ?? [];
  const listed = new Set(context.tasks.flatMap((task) => task.scenarios));
  const parts: string[] = [];
  for (const capability of capabilities) {
    if (!isCapabilityOptedIn(optedIn, capability.name)) continue;
    for (const requirement of [...capability.delta.added, ...capability.delta.modified]) {
      const covered = requirement.scenarios.some((scenario) =>
        listed.has(`${capability.name}\u0000${scenario.name}`),
      );
      if (!covered) parts.push(`${capability.name}: ${requirement.name}`);
    }
  }
  return parts;
}

async function uncoveredRequirementNotice(context: RuleContext): Promise<RuleFinding | null> {
  const parts = uncoveredParts(context, await readChangeDeltas(context.folderPath));
  if (parts.length === 0) return null;
  return finding('uncovered_requirement', "requirements no task's tests cover", parts.join('; '));
}

function testsModifyNotice(context: RuleContext): RuleFinding | null {
  const parts: string[] = [];
  for (const task of context.digest.tasks) {
    if (!task.testsModify) continue;
    const tests = [...task.existingTests].sort(compareCodeUnits);
    parts.push(
      tests.length === 0 ? `task ${task.number}` : `task ${task.number}: ${tests.join(', ')}`,
    );
  }
  if (parts.length === 0) return null;
  return finding('tests_modify', 'tests.modify', parts.join('; '));
}

function newCapabilityNotice(context: RuleContext): RuleFinding | null {
  const creates = context.digest.capabilities.filter((capability) => capability.creates);
  if (creates.length === 0) return null;
  return finding('new_capability', 'new capability', creates.map((c) => c.name).join('; '));
}

async function planRevisedNotice(context: RuleContext): Promise<RuleFinding | null> {
  const records = await readPlanReady(context.folderPath);
  const currentHash = await hashChangeFolder(context.folderPath);
  const count = countPlanRevisions(records, currentHash);
  if (count === 0) return null;
  const label = count === 1 ? 'plan revised 1 time' : `plan revised ${count} times`;
  return finding('plan_revised', label, 'since osq first recorded it ready');
}

/** Every rule's finding for one change, before ordering and severity. */
export async function collectApprovalNotices(input: {
  readonly projectRoot: string;
  readonly folderPath: string;
  readonly config: OsqConfig;
  readonly digest: ApprovalDigest;
}): Promise<RuleFinding[]> {
  const context: RuleContext = {
    folderPath: input.folderPath,
    config: input.config,
    notices: input.config.notices ?? DEFAULT_NOTICES_CONFIG,
    digest: input.digest,
    tasks: await readTaskFacts(input.projectRoot, input.folderPath),
    proposalBody: await readProposalBody(input.folderPath),
  };
  const findings: RuleFinding[] = [];
  add(findings, rulesPathNotice(context));
  add(findings, removedRequirementNotice(context));
  add(findings, adrDepartureNotice(context));
  add(findings, manyTasksNotice(context));
  add(findings, largeScopeNotice(context));
  add(findings, packageJsonNotice(context));
  add(findings, assumptionsNotice(context));
  add(findings, verifyStartsAnyNotice(context));
  add(findings, await uncoveredRequirementNotice(context));
  add(findings, testsModifyNotice(context));
  add(findings, newCapabilityNotice(context));
  add(findings, await planRevisedNotice(context));
  return findings;
}
