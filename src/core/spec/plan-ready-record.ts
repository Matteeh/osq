import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { buildApprovalDigest } from './digest.js';
import { hashChangeFolder } from './hasher.js';
import type { LintFinding } from './lint-findings.js';
import { buildApprovalNotices, recordNotices } from './notices.js';
import { type PlanReadyTraceabilityEntry, appendPlanReady, readPlanReady } from './plan-ready.js';

async function exists(target: string): Promise<boolean> {
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

/**
 * Record a clean lint of an unapproved change as its plan ready: append one
 * `plan_ready` line to `<folder>/.run/plan.jsonl` with the folder's hash, its
 * current notices, and its traceability link findings, unless the folder is
 * already approved or rejected, or its last record already holds this hash.
 * Resolves true when it appended.
 *
 * @scenario spec-lint-and-approve: First clean lint
 * @scenario spec-lint-and-approve: Lint again unchanged
 * @scenario spec-lint-and-approve: Revised after ready
 * @scenario spec-lint-and-approve: No record
 * @scenario spec-lint-and-approve: Link findings recorded
 * @scenario spec-lint-and-approve: No link findings
 */
export async function recordPlanReady(
  projectRoot: string,
  folderPath: string,
  config: OsqConfig,
  traceability: readonly LintFinding[] = [],
): Promise<boolean> {
  const runDir = path.join(folderPath, '.run');
  if (await exists(path.join(runDir, 'approved'))) return false;
  if (await exists(path.join(runDir, 'rejected.md'))) return false;

  const hash = await hashChangeFolder(folderPath);
  const records = await readPlanReady(folderPath);
  const last = records[records.length - 1];
  if (last !== undefined && last.data.hash === hash) return false;

  const digest = await buildApprovalDigest(projectRoot, folderPath, config);
  const notices = await buildApprovalNotices(projectRoot, folderPath, config, digest);
  const entries: PlanReadyTraceabilityEntry[] = traceability.map((finding) => ({
    severity: finding.severity,
    file: finding.file,
    message: finding.message,
  }));
  await appendPlanReady(folderPath, hash, recordNotices(notices), entries);
  return true;
}
