import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from './config.js';
import { hashChangeFolder } from './hasher.js';
import { getChangesDir } from './layout.js';
import { lintChangeFolder } from './linter.js';
import { buildManifest, writeManifest } from './manifest.js';
import {
  type PlanningSessionReader,
  appendObservedSessions,
  findPlanningSessions,
  resolveChangeCreationTime,
} from './planning-observed.js';
import { hashBriefBytes, resolveOsqPackageVersion } from './planning.js';

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
}

export interface ApproveOptions {
  /** Independent local session readers supplied by the CLI. */
  planningReaders?: readonly PlanningSessionReader[];
  /** Single observation end; defaults to the current time. */
  now?: Date | string;
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
  const specsDir = getChangesDir(config.paths.openspecRoot, projectRoot);
  const folderPath = await findSpecFolder(specsDir, specIdOrPrefix);
  const folderName = path.basename(folderPath);
  const specId = folderName.match(/^(\d+)/)?.[1] || folderName;

  const lintResult = await lintChangeFolder(projectRoot, folderPath, config);
  if (!lintResult.valid) {
    throw new Error(
      `Lint failed for spec "${folderName}":\n  - ${lintResult.errors.join('\n  - ')}`,
    );
  }

  // Discover local planning sessions after lint so a failed change is never
  // recorded, then append observed pairs before the manifest is built.
  const observations = await findPlanningSessions(folderPath, {
    createdAt: await resolveChangeCreationTime(folderPath),
    observedAt: toIso(options.now) ?? new Date().toISOString(),
    readers: options.planningReaders ?? [],
  });
  await appendObservedSessions(folderPath, observations, {
    briefHash: await readBriefHash(folderPath),
    osqVersion: await resolveOsqPackageVersion(),
  });

  const hash = await hashChangeFolder(folderPath);

  // Approval only refreshes the seal. It never retires failure markers: that is
  // the exclusive job of an explicit `osq retry`.
  const runDir = path.join(folderPath, '.run');
  await fs.mkdir(runDir, { recursive: true });

  const approvedPath = path.join(runDir, 'approved');
  await fs.writeFile(approvedPath, `${hash}\n`, 'utf8');

  const manifest = await buildManifest(projectRoot, folderPath, config);
  await writeManifest(runDir, manifest);

  return {
    specId,
    folderName,
    folderPath,
    hash,
    warnings: lintResult.warnings,
    planningMatches: observations.length,
  };
}
