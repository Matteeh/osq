import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { hashBriefBytes } from '../report/planning.js';
import { buildManifest, writeManifest } from '../run/manifest.js';
import {
  type ApprovalDigest,
  type ApprovalFlag,
  buildApprovalDigest,
  summarizeApprovalFlags,
} from './digest.js';

/** How an optional approver review resolved before any seal is written. */
export type ApprovalReview = 'proceed' | 'confirmed' | 'declined';

/** Thrown when an approver declined a flagged approval; nothing is written. */
export class ApprovalDeclinedError extends Error {
  constructor(flags: readonly ApprovalFlag[]) {
    super(`Approval declined: ${summarizeApprovalFlags(flags)}`);
    this.name = 'ApprovalDeclinedError';
  }
}

/** The optional review port the CLI injects before the seal is written. */
export interface ApprovalReviewOptions {
  review?: (digest: ApprovalDigest) => Promise<ApprovalReview>;
}

/** An approval that passed review, with the manifest mode it recorded. */
export interface ConfirmedApproval {
  readonly digest: ApprovalDigest;
  readonly mode: 'shown' | 'confirmed';
}

/** Normalize an optional observation time to ISO, or null when unusable. */
export function toIso(value: Date | string | undefined): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value === 'string') {
    return Number.isFinite(Date.parse(value)) ? value : null;
  }
  return null;
}

/** SHA-256 of a folder's `brief.md` bytes, or of empty bytes when absent. */
export async function readBriefHash(folderPath: string): Promise<string> {
  const bytes = await fs.readFile(path.join(folderPath, 'brief.md')).catch(() => null);
  return hashBriefBytes(bytes ?? '');
}

/**
 * Build the digest and, when a review port is present, let it decide whether a
 * flagged approval may proceed. Refusals throw before anything is written.
 */
export async function confirmApproval(
  projectRoot: string,
  folderPath: string,
  config: OsqConfig,
  options: ApprovalReviewOptions,
): Promise<ConfirmedApproval> {
  const digest = await buildApprovalDigest(projectRoot, folderPath, config);
  let mode: 'shown' | 'confirmed' = 'shown';
  if (options.review) {
    const review = await options.review(digest);
    if (review === 'declined') {
      throw new ApprovalDeclinedError(digest.flags);
    }
    mode = review === 'confirmed' ? 'confirmed' : 'shown';
  }
  return { digest, mode };
}

/**
 * Write the approval seal and manifest into `targetFolder`, which is the
 * checkout's folder for an in-place approval or the worktree's copy otherwise.
 * The caller owns the hash, so both paths seal the checkout's authored content.
 */
export async function writeApprovalSeal(
  projectRoot: string,
  targetFolder: string,
  config: OsqConfig,
  digest: ApprovalDigest,
  mode: 'shown' | 'confirmed',
  hash: string,
): Promise<void> {
  const runDir = path.join(targetFolder, '.run');
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'approved'), `${hash}\n`, 'utf8');

  const manifest = await buildManifest(projectRoot, targetFolder, config, {
    ids: digest.flags.map((flag) => flag.id),
    mode,
  });
  await writeManifest(runDir, manifest);
}
