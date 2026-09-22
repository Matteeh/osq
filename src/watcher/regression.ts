import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/config.js';
import { parseTaskMd } from '../core/parser.js';
import {
  SCOPE_RESOLVER_VERSION,
  type StaleTaskAudit,
  attributeScopePaths,
  buildScopeRegressionMarker,
  computeTaskScopeHash,
  findDifferingPaths,
  listCanonicalDoneNumbers,
  parseActiveStaleTask,
  readDoneMarker,
  readFileChangedPaths,
} from '../core/scope-hash.js';
import { compareNumericPrefix } from '../core/state.js';
import { resolveBuildInfo } from './build.js';
import {
  type DoneMarkerMetadata,
  type RunTaskResult,
  recordRegressedEvent,
  writeRegressedMarker,
} from './outcome.js';
import { runVerificationGateResult } from './verify.js';

export { computeTaskScopeHash } from '../core/scope-hash.js';
export type { ScopeHashResult } from '../core/scope-hash.js';

/** Outcome of comparing a previously completed task's scope to the tree. */
export interface ScopeRegressionResult {
  regressed: true;
  taskNumber: string;
  differingPaths: string[];
  recordedHash: string;
  currentHash: string;
}

export interface ScopeAuditOptions {
  projectRoot: string;
  specFolderPath: string;
  eligibleTaskNumbers: readonly string[];
  verifyTimeoutSeconds: number;
  /** When false, detect and attribute only; never verify or write artifacts. */
  record?: boolean;
}

export interface ScopeAuditResult {
  stale: StaleTaskAudit[];
}

/**
 * Pre-lock scope recertification audit. Compares every eligible automated done
 * marker's recorded resolver-aware scope hash and version against the current
 * tree in one pass, verifies each stale task under the configured timeout, and
 * records one regression marker and typed event per stale task. Already-active
 * regressions are reported without re-verification or duplicate writes.
 */
export async function auditScopeRegressions(options: ScopeAuditOptions): Promise<ScopeAuditResult> {
  const { projectRoot, specFolderPath, eligibleTaskNumbers, verifyTimeoutSeconds } = options;
  const record = options.record ?? true;
  const runDir = path.join(specFolderPath, '.run');

  const doneInfo = new Map<string, Awaited<ReturnType<typeof readDoneMarker>>>();
  const changesByPath = new Map<string, Set<string>>();
  const completionHashes = new Map<string, Record<string, string | null>>();
  for (const number of await listCanonicalDoneNumbers(runDir)) {
    const info = await readDoneMarker(runDir, number);
    if (!info) continue;
    doneInfo.set(number, info);
    completionHashes.set(number, info.scopeFiles);
    for (const filePath of await readFileChangedPaths(specFolderPath, number)) {
      const tasks = changesByPath.get(filePath) ?? new Set<string>();
      tasks.add(number);
      changesByPath.set(filePath, tasks);
    }
  }

  const stale: StaleTaskAudit[] = [];
  for (const taskNumber of [...new Set(eligibleTaskNumbers)].sort(compareNumericPrefix)) {
    const recorded = doneInfo.get(taskNumber);
    if (!recorded) continue;
    const taskContent = await fs
      .readFile(path.join(specFolderPath, 'tasks', `${taskNumber}.md`), 'utf8')
      .catch(() => null);
    if (taskContent === null) continue;
    const taskData = parseTaskMd(taskContent);
    const current = await computeTaskScopeHash(projectRoot, taskData.scope);
    if (current.hash === recorded.scopeHash && recorded.scopeResolver === SCOPE_RESOLVER_VERSION) {
      continue;
    }

    // A matching aggregate hash is a version-only upgrade: report no differing
    // path from the legacy per-file projection rather than inventing one.
    const differing =
      current.hash === recorded.scopeHash
        ? []
        : findDifferingPaths(recorded.scopeFiles, current.fileHashes);
    const base = {
      differingPaths: differing.map((entry) => entry.display),
      attribution: attributeScopePaths(
        taskNumber,
        differing,
        current.fileHashes,
        changesByPath,
        completionHashes,
      ),
      recordedHash: recorded.scopeHash,
      currentHash: current.hash,
    };

    const active = await fs
      .readFile(path.join(runDir, 'regressed', `${taskNumber}.md`), 'utf8')
      .catch(() => null);
    if (active !== null) {
      stale.push(parseActiveStaleTask(taskNumber, active, base));
      continue;
    }
    const gate = record
      ? await runVerificationGateResult(projectRoot, taskData.verify, verifyTimeoutSeconds, {
          specFolderPath,
          taskNumber,
        })
      : null;
    const audit: StaleTaskAudit = {
      taskNumber,
      ...base,
      verifyCommand: taskData.verify,
      exitCode: gate?.exitCode ?? 1,
      duration: gate?.duration ?? 0,
      output: gate?.output ?? '',
      timedOut: gate?.timedOut ?? false,
      verificationPassed: gate?.passed ?? false,
      alreadyActive: false,
    };
    if (gate) {
      const marker = buildScopeRegressionMarker(audit).replace(
        '\n---\n',
        `\nrecorded_resolver: ${JSON.stringify(recorded.scopeResolver)}\ncurrent_resolver: ${SCOPE_RESOLVER_VERSION}\n---\n`,
      );
      await writeRegressedMarker(runDir, taskNumber, marker);
      await recordRegressedEvent(specFolderPath, taskNumber, {
        reason: 'scope_regression',
        differingPaths: audit.differingPaths,
        attribution: audit.attribution,
        recordedHash: audit.recordedHash,
        currentHash: audit.currentHash,
        command: audit.verifyCommand,
        exitCode: audit.exitCode,
        duration: audit.duration,
        output: audit.output,
        timedOut: audit.timedOut,
        verificationPassed: audit.verificationPassed,
        recordedResolver: recorded.scopeResolver,
        currentResolver: SCOPE_RESOLVER_VERSION,
      });
    }
    stale.push(audit);
  }
  return { stale };
}

async function eligibleEarlierTasks(runDir: string, currentTask: number): Promise<string[]> {
  return (await listCanonicalDoneNumbers(runDir)).filter(
    (number) => Number.parseInt(number, 10) < currentTask,
  );
}

/** Legacy first-match detection export: detection only, never writes artifacts. */
export async function checkDoneTasksScopeHashes(
  projectRoot: string,
  specFolderPath: string,
  currentTaskNumber: string,
): Promise<ScopeRegressionResult | null> {
  const currentTask = Number.parseInt(currentTaskNumber, 10);
  if (Number.isNaN(currentTask)) return null;
  const eligible = await eligibleEarlierTasks(path.join(specFolderPath, '.run'), currentTask);
  const audit = await auditScopeRegressions({
    projectRoot,
    specFolderPath,
    eligibleTaskNumbers: eligible,
    verifyTimeoutSeconds: 0,
    record: false,
  });
  const first = audit.stale[0];
  return first
    ? {
        regressed: true,
        taskNumber: first.taskNumber,
        differingPaths: first.differingPaths,
        recordedHash: first.recordedHash,
        currentHash: first.currentHash,
      }
    : null;
}

/** Resolve the metadata written to the done marker after a passing task. */
export async function buildDoneMetadata(
  projectRoot: string,
  scope: string[],
): Promise<DoneMarkerMetadata> {
  const [scopeHash, buildInfo] = await Promise.all([
    computeTaskScopeHash(projectRoot, scope),
    resolveBuildInfo(projectRoot),
  ]);
  return {
    scopeHash: scopeHash.hash,
    buildStamp: buildInfo.commit,
    exitCode: 0,
    fileHashes: scopeHash.fileHashes,
    scopeResolver: SCOPE_RESOLVER_VERSION,
  };
}

/**
 * Defensive pre-spawn guard for direct `runTask` callers: record and report
 * every stale earlier task without spawning. The watcher cycle audits before
 * `runTask`; this keeps direct calls safe.
 */
export async function guardScopeRegression(
  projectRoot: string,
  specFolderPath: string,
  currentTaskNumber: string,
  config: OsqConfig,
): Promise<RunTaskResult | null> {
  const currentTask = Number.parseInt(currentTaskNumber, 10);
  if (Number.isNaN(currentTask)) return null;
  const eligible = await eligibleEarlierTasks(path.join(specFolderPath, '.run'), currentTask);
  const audit = await auditScopeRegressions({
    projectRoot,
    specFolderPath,
    eligibleTaskNumbers: eligible,
    verifyTimeoutSeconds: config.timeouts.verifyTimeoutSeconds ?? 600,
  });
  const first = audit.stale[0];
  return first
    ? {
        success: false,
        reason: 'regressed',
        error: `Scope of task ${first.taskNumber} changed: ${first.differingPaths.join(', ')}`,
      }
    : null;
}
