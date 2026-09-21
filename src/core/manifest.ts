import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OsqConfig } from './config.js';
import { resolveExecutorIdentity } from './harness-catalog.js';
import { getSpecsDir } from './layout.js';
import { parseSpecMdFromFolder, resolveChangeDoc } from './parser.js';
import { readPlanRecords } from './planning.js';

/**
 * Package root of the running osq build: `src/core/` when executed through
 * `tsx`, `dist/core/` once compiled. Both resolve two levels up.
 */
const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

/** Content-addressed hashes plus the exact inputs an approval was produced with. */
export interface ManifestData {
  hashes: Record<string, string | null>;
  osqVersion: string;
  harness: string;
  model: string;
  planner: string | null;
  effort: string | null;
  createdAt: string;
  approvedAt: string;
  /** Count of valid `plan_started` records present at manifest build time. */
  planningSessions: number;
}

async function hashFileContent(filePath: string): Promise<string | null> {
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

/** ISO timestamp of the change document's last modification, or now. */
async function resolveCreatedAt(specFolderPath: string): Promise<string> {
  const resolved = await resolveChangeDoc(specFolderPath);
  if (!resolved) {
    return new Date().toISOString();
  }
  const stat = await fs.stat(resolved.path).catch(() => null);
  return stat ? stat.mtime.toISOString() : new Date().toISOString();
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
  const planningSessions = (await readPlanRecords(specFolderPath)).filter(
    (record) => record.type === 'plan_started',
  ).length;

  return {
    hashes,
    osqVersion: await resolveOsqVersion(),
    harness: identity.harness,
    model: identity.model,
    planner: config.planner?.model ?? null,
    effort: identity.effort,
    createdAt: await resolveCreatedAt(specFolderPath),
    approvedAt: new Date().toISOString(),
    planningSessions,
  };
}

/** Writes `manifest.json` under `runDir` as indented JSON. */
export async function writeManifest(runDir: string, manifest: ManifestData): Promise<void> {
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
}
