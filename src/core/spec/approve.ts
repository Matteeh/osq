import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import {
  type PlanningSessionReader,
  appendObservedSessions,
  findPlanningSessions,
  resolveChangeCreationTime,
} from '../report/planning-observed.js';
import { findUnpricedPlanningModels } from '../report/planning-price-gaps.js';
import { hashBriefBytes, resolveOsqPackageVersion } from '../report/planning.js';
import { buildManifest, writeManifest } from '../run/manifest.js';
import { findChange } from '../status/change-locations.js';
import {
  type ApprovalDigest,
  type ApprovalFlag,
  buildApprovalDigest,
  summarizeApprovalFlags,
} from './digest.js';
import { hashChangeFolder } from './hasher.js';
import { lintChangeFolder } from './linter.js';

export async function findSpecFolder(specsDir: string, idOrPrefix: string): Promise<string> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(specsDir);
  } catch {
    throw new Error(`Specs directory not found at ${specsDir}`);
  }

  const trimmed = idOrPrefix.trim();
  const num = Number.parseInt(trimmed, 10);
  const padded = !Number.isNaN(num) ? String(num).padStart(3, '0') : trimmed;

  for (const entry of entries) {
    if (
      entry === trimmed ||
      entry === padded ||
      entry.startsWith(`${trimmed}-`) ||
      entry.startsWith(`${padded}-`)
    ) {
      const fullPath = path.join(specsDir, entry);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        return fullPath;
      }
    }
  }

  throw new Error(`Spec "${idOrPrefix}" not found in ${specsDir}`);
}

export interface ApproveResult {
  specId: string;
  folderName: string;
  folderPath: string;
  hash: string;
  warnings: string[];
  /** Number of local planning sessions matched at approval time. */
  planningMatches: number;
  /** Recorded-token planning models the change's folder leaves unpriced. */
  missingPrices: string[];
  /** The digest built for this approval, flags included. */
  digest: ApprovalDigest;
}

/** How an optional approver review resolved before the seal was written. */
export type ApprovalReview = 'proceed' | 'confirmed' | 'declined';

/** Thrown when an approver declined a flagged approval; nothing is written. */
export class ApprovalDeclinedError extends Error {
  constructor(flags: readonly ApprovalFlag[]) {
    super(`Approval declined: ${summarizeApprovalFlags(flags)}`);
    this.name = 'ApprovalDeclinedError';
  }
}

export interface ApproveOptions {
  /** Independent local session readers supplied by the CLI. */
  planningReaders?: readonly PlanningSessionReader[];
  /** Single observation end; defaults to the current time. */
  now?: Date | string;
  /** Optional port between the CLI and core for digest review and confirmation. */
  review?: (digest: ApprovalDigest) => Promise<ApprovalReview>;
}

function toIso(value: Date | string | undefined): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value === 'string') {
    return Number.isFinite(Date.parse(value)) ? value : null;
  }
  return null;
}

async function readBriefHash(folderPath: string): Promise<string> {
  const bytes = await fs.readFile(path.join(folderPath, 'brief.md')).catch(() => null);
  return hashBriefBytes(bytes ?? '');
}

export async function approveSpec(
  projectRoot: string,
  specIdOrPrefix: string,
  config: OsqConfig,
  options: ApproveOptions = {},
): Promise<ApproveResult> {
  const change = await findChange(projectRoot, config, specIdOrPrefix);
  const folderPath = change.folderPath;
  const specsDir = change.tree.changesDir;
  const folderName = path.basename(folderPath);
  const specId = folderName.match(/^(\d+)/)?.[1] || folderName;

  const lintResult = await lintChangeFolder(projectRoot, folderPath, config);
  if (!lintResult.valid) {
    throw new Error(
      `Lint failed for spec "${folderName}":\n  - ${lintResult.errors.join('\n  - ')}`,
    );
  }

  // Build the digest after lint and before any observation write, then let the
  // optional review port decide whether a flagged approval may proceed.
  const digest = await buildApprovalDigest(projectRoot, folderPath, config);
  let mode: 'shown' | 'confirmed' = 'shown';
  if (options.review) {
    const review = await options.review(digest);
    if (review === 'declined') {
      throw new ApprovalDeclinedError(digest.flags);
    }
    mode = review === 'confirmed' ? 'confirmed' : 'shown';
  }

  // Discover local planning sessions after lint so a failed change is never
  // recorded, then append observed pairs before the manifest is built.
  const observations = await findPlanningSessions(folderPath, {
    createdAt: await resolveChangeCreationTime(folderPath),
    observedAt: toIso(options.now) ?? new Date().toISOString(),
    changesDir: specsDir,
    planning: config.planning ?? DEFAULT_CONFIG.planning,
    readers: options.planningReaders ?? [],
  });
  await appendObservedSessions(folderPath, observations, {
    briefHash: await readBriefHash(folderPath),
    osqVersion: await resolveOsqPackageVersion(),
  });

  // Price gaps are read after observation so a session found at approval is
  // named too. Approval itself is unaffected.
  const missingPrices = await findUnpricedPlanningModels([folderPath], config.planning?.prices);

  const hash = await hashChangeFolder(folderPath);

  // Approval only refreshes the seal. It never retires failure markers: that is
  // the exclusive job of an explicit `osq retry`.
  const runDir = path.join(folderPath, '.run');
  await fs.mkdir(runDir, { recursive: true });

  const approvedPath = path.join(runDir, 'approved');
  await fs.writeFile(approvedPath, `${hash}\n`, 'utf8');

  const manifest = await buildManifest(projectRoot, folderPath, config, {
    ids: digest.flags.map((flag) => flag.id),
    mode,
  });
  await writeManifest(runDir, manifest);

  return {
    specId,
    folderName,
    folderPath,
    hash,
    warnings: lintResult.warnings,
    planningMatches: observations.length,
    missingPrices,
    digest,
  };
}
