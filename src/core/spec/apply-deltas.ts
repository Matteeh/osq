import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { type ParsedDelta, mergeDelta, parseCapabilitySpec, parseDelta } from './delta.js';

function resolveOpenSpecRoot(config: OsqConfig): string {
  const paths = config.paths as OsqConfig['paths'] & { readonly openspecRoot?: string };
  return paths.openspecRoot ?? 'openspec';
}

/**
 * The living spec a delta merges to, or null when that text holds no
 * requirement: a capability this change empties, which archive removes.
 *
 * @scenario watcher-and-harness: Emptied capability removed
 * @scenario spec-lint-and-approve: Living spec replay in landing order
 * @adr 002
 */
export function mergeLivingSpec(
  baseContent: string | null,
  capability: string,
  delta: ParsedDelta,
): string | null {
  const merged = mergeDelta(baseContent, capability, delta);
  return parseCapabilitySpec(merged).requirements.length === 0 ? null : merged;
}

/** Remove a capability folder once its living files are gone. */
async function removeEmptiedCapability(targetDir: string, targetPath: string): Promise<void> {
  await fs.rm(targetPath, { force: true });
  await fs.rm(path.join(targetDir, 'osq.yml'), { force: true });
  await fs.rmdir(targetDir).catch(() => {});
}

/**
 * Merge every delta spec into `openspec/specs/`. A delta that leaves its
 * capability with no requirement removes that capability's folder instead.
 *
 * @scenario watcher-and-harness: Emptied capability removed
 * @adr 002
 */
export async function applyOpenSpecDeltas(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
): Promise<void> {
  const deltasDir = path.join(specFolderPath, 'specs');
  const entries = await fs.readdir(deltasDir, { withFileTypes: true }).catch((): Dirent[] => []);
  const capabilities = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (capabilities.length === 0) {
    return;
  }

  const specsRoot = path.join(projectRoot, resolveOpenSpecRoot(config), 'specs');

  for (const capability of capabilities) {
    const deltaPath = path.join(deltasDir, capability, 'spec.md');
    const deltaContent = await fs.readFile(deltaPath, 'utf8').catch(() => null);
    if (deltaContent === null) {
      continue;
    }

    const delta = parseDelta(deltaContent);
    const targetDir = path.join(specsRoot, capability);
    const targetPath = path.join(targetDir, 'spec.md');
    const baseContent = await fs.readFile(targetPath, 'utf8').catch(() => null);
    const merged = mergeLivingSpec(baseContent, capability, delta);
    if (merged === null) {
      await removeEmptiedCapability(targetDir, targetPath);
      continue;
    }

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetPath, merged, 'utf8');
  }
}
