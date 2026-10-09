import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { buildApprovalDigest } from './digest.js';
import { hashChangeFolder } from './hasher.js';
import { buildApprovalNotices, recordNotices } from './notices.js';
import { appendPlanReady, readPlanReady } from './plan-ready.js';

async function exists(target: string): Promise<boolean> {
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

/**
 * Record a clean lint of an unapproved change as its plan ready: append one
 * `plan_ready` line to `<folder>/.run/plan.jsonl` with the folder's hash and
 * its current notices, unless the folder is already approved or rejected, or
 * its last record already holds this hash. Resolves true when it appended.
 *
 * @scenario spec-lint-and-approve: First clean lint
 * @scenario spec-lint-and-approve: Lint again unchanged
 * @scenario spec-lint-and-approve: Revised after ready
 * @scenario spec-lint-and-approve: No record
 */
export async function recordPlanReady(
  projectRoot: string,
  folderPath: string,
  config: OsqConfig,
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
  await appendPlanReady(folderPath, hash, recordNotices(notices));
  return true;
}
