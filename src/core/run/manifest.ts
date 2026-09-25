import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { governingAdrs, readDecisions } from '../foundation/decisions.js';
import { resolveExecutorIdentity } from '../foundation/harness-catalog.js';
import { PACKAGE_ROOT } from '../foundation/package-root.js';
import { type PlanRecord, planningRecordSource, readPlanRecords } from '../report/planning.js';
import { parseSpecMdFromFolder } from '../spec/parser.js';
import { getSpecsDir } from '../status/layout.js';

/** Recorded approval flags: the distinct sorted ids and how they were handled. */
export interface ApprovalFlagsData {
  ids: string[];
  mode: 'shown' | 'confirmed';
}

/** Content-addressed hashes plus the exact inputs an approval was produced with. */
export interface ManifestData {
  hashes: Record<string, string | null>;
  osqVersion: string;
  harness: string;
  model: string;
  planner: string | null;
  effort: string | null;
  createdAt: string;
  /** Set only when `createdAt` is the change folder's creation time. */
  createdAtSource?: 'created';
  /** Only the approval path records it; a planning-only manifest omits it. */
  approvedAt?: string;
  /** Count of valid `plan_started` records present at manifest build time. */
  planningSessions: number;
  /**
   * The approval's distinct flag ids and whether they were confirmed. Only the
   * approval path records it; a planning-only manifest omits the field so the
   * report can tell an approval apart from a queued plan.
   */
  approvalFlags?: ApprovalFlagsData;
  /**
   * Number of each accepted ADR governing the change to its content hash. Only
   * the approval path records it; an approval with no governing ADR records an
   * empty object and a planning-only manifest omits the field.
   */
  decisions?: Record<string, string>;
}

export async function hashFileContent(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const digest = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    return `sha256:${digest}`;
  } catch {
    return null;
  }
}

/** First existing `osq.config.{ts,js,mjs}` under `projectRoot`, or `null`. */
export async function resolveConfigPath(projectRoot: string): Promise<string | null> {
  for (const name of ['osq.config.ts', 'osq.config.js', 'osq.config.mjs']) {
    const candidate = path.join(projectRoot, name);
    const exists = await fs
      .stat(candidate)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      return candidate;
    }
  }
  return null;
}

async function readPackageVersion(packagePath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(packagePath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === 'string' && parsed.version.trim().length > 0) {
      return parsed.version.trim();
    }
  } catch {
    // Missing or malformed package.json.
  }
  return null;
}

/** Version of the osq build currently executing, or `unknown`. */
async function resolveOsqVersion(): Promise<string> {
  const version = await readPackageVersion(path.join(PACKAGE_ROOT, 'package.json'));
  return version ?? 'unknown';
}

interface ResolvedCreation {
  createdAt: string;
  createdAtSource?: 'created';
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

/**
 * The manifest's creation time, in order: an existing manifest's valid
 * `createdAt` (kept together with its `createdAtSource` when present), the
 * change folder's valid birth time, then the current time. The creation marker
 * is added only for a genuine creation time, and for the current-time fallback
 * only when `osq plan` (no approval flags) writes the manifest.
 */
async function resolveCreation(
  specFolderPath: string,
  hasApproval: boolean,
): Promise<ResolvedCreation> {
  try {
    const raw = await fs.readFile(path.join(specFolderPath, '.run', 'manifest.json'), 'utf8');
    const existing = JSON.parse(raw) as { createdAt?: unknown; createdAtSource?: unknown };
    const createdAt = validIso(existing.createdAt);
    if (createdAt !== null) {
      return existing.createdAtSource === 'created'
        ? { createdAt, createdAtSource: 'created' }
        : { createdAt };
    }
  } catch {
    // Missing or malformed manifest.
  }
  try {
    const stat = await fs.stat(specFolderPath);
    const birth = stat.birthtime;
    if (birth && Number.isFinite(birth.getTime()) && birth.getTime() > 0) {
      return { createdAt: birth.toISOString(), createdAtSource: 'created' };
    }
  } catch {
    // Unreadable folder.
  }
  const now = new Date().toISOString();
  return hasApproval ? { createdAt: now } : { createdAt: now, createdAtSource: 'created' };
}

/**
 * Manifest planner attribution: the model from the most recent observed session
 * that reports one, then the most recent owned `--session` record that reports
 * one, else null. Configuration alone never supplies attribution.
 */
function resolvePlanningAttribution(records: readonly PlanRecord[]): string | null {
  const latestModel = (source: 'owned' | 'observed'): string | null => {
    let bestTimestamp = '';
    let bestModel: string | null = null;
    for (const record of records) {
      if (record.type !== 'plan_started') continue;
      if (planningRecordSource(record) !== source) continue;
      const model = record.data.model;
      if (!model) continue;
      if (bestModel === null || record.timestamp > bestTimestamp) {
        bestTimestamp = record.timestamp;
        bestModel = model;
      }
    }
    return bestModel;
  };
  return latestModel('observed') ?? latestModel('owned');
}

/**
 * Builds the approval manifest for a change: content-addressed hashes of the
 * agent and planner docs, the resolved config, and every capability spec the
 * change reads or writes, plus build and harness identity.
 */
export async function buildManifest(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
  approvalFlags?: { ids: readonly string[]; mode: 'shown' | 'confirmed' },
): Promise<ManifestData> {
  const spec = await parseSpecMdFromFolder(specFolderPath);
  const configPath = await resolveConfigPath(projectRoot);
  const specsDir = getSpecsDir(config.paths.openspecRoot, projectRoot);

  const hashes: Record<string, string | null> = {
    'AGENTS.md': await hashFileContent(path.join(projectRoot, 'AGENTS.md')),
    'PLANNER.md': await hashFileContent(path.join(projectRoot, 'PLANNER.md')),
    config: configPath ? await hashFileContent(configPath) : null,
  };

  // Capability writes are declared solely by delta spec folders under `specs/`.
  const deltasDir = path.join(specFolderPath, 'specs');
  const writtenCapabilities = (await fs.readdir(deltasDir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const features = new Set<string>([...(spec?.features.reads ?? []), ...writtenCapabilities]);
  for (const name of features) {
    hashes[name] = await hashFileContent(path.join(specsDir, name, 'spec.md'));
  }

  const identity = resolveExecutorIdentity(config);
  const planRecords = await readPlanRecords(specFolderPath);
  const planningSessions = planRecords.filter((record) => record.type === 'plan_started').length;
  const creation = await resolveCreation(specFolderPath, approvalFlags !== undefined);

  const manifest: ManifestData = {
    hashes,
    osqVersion: await resolveOsqVersion(),
    harness: identity.harness,
    model: identity.model,
    planner: resolvePlanningAttribution(planRecords),
    effort: identity.effort,
    createdAt: creation.createdAt,
    planningSessions,
  };
  if (creation.createdAtSource) {
    manifest.createdAtSource = creation.createdAtSource;
  }
  if (approvalFlags) {
    manifest.approvedAt = new Date().toISOString();
    manifest.approvalFlags = {
      ids: [...new Set(approvalFlags.ids)].sort(),
      mode: approvalFlags.mode,
    };
    const records = await readDecisions(projectRoot, config);
    const decisions: Record<string, string> = {};
    for (const adr of governingAdrs(records, writtenCapabilities)) {
      decisions[adr.number] = adr.hash;
    }
    manifest.decisions = decisions;
  }
  return manifest;
}

/** Writes `manifest.json` under `runDir` as indented JSON. */
export async function writeManifest(runDir: string, manifest: ManifestData): Promise<void> {
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
}
