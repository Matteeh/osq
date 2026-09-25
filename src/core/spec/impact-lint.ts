import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import {
  readCapabilityOwnership,
  undeclaredReadFindings,
  writeWithoutDeltaFindings,
} from './capability-impact.js';
import type { ImportGraph } from './import-graph.js';
import type { LintFinding } from './lint-findings.js';
import {
  type TestImpactTask,
  frozenTestFindings,
  verifyWithoutScopeFindings,
} from './test-impact.js';

/**
 * Import-graph impact lint: one entrypoint that runs the test-impact and
 * capability-impact checks for a change folder and returns their warnings.
 * Every finding is a warning; none affects `valid`, `osq lint`'s exit code, or
 * approval.
 */

export type ImpactTask = TestImpactTask;

export interface ImpactLintInput {
  readonly projectRoot: string;
  readonly folderPath: string;
  readonly config: OsqConfig;
  /** Repository-relative `proposal.md` the read warning is attributed to. */
  readonly proposalPath: string;
  readonly reads: readonly string[];
  readonly tasks: readonly ImpactTask[];
  readonly importGraph: ImportGraph;
}

/** Capability names with a delta spec directory in the change folder. */
async function readDeltaCapabilities(folderPath: string): Promise<Set<string>> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(path.join(folderPath, 'specs'), { withFileTypes: true });
  } catch {
    return new Set();
  }

  return new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
}

/** Run every impact check and return the change's own import-graph warnings. */
export async function collectImpactFindings(input: ImpactLintInput): Promise<LintFinding[]> {
  const deltaCapabilities = await readDeltaCapabilities(input.folderPath);
  const ownerships = await readCapabilityOwnership(
    input.projectRoot,
    input.config.paths.openspecRoot,
  );
  const scopedFiles = [...new Set(input.tasks.flatMap((task) => [...task.existingPaths]))].sort();
  const declared = new Set([...input.reads, ...deltaCapabilities]);

  return [
    ...frozenTestFindings(input.tasks, input.importGraph, {
      maxDepth: input.config.limits.importGraphDepth,
      maxListed: input.config.limits.maxListedImporters,
    }),
    ...(await verifyWithoutScopeFindings(input.projectRoot, input.tasks, input.importGraph)),
    ...undeclaredReadFindings({
      proposalPath: input.proposalPath,
      scopedFiles,
      importsOf: (file) => input.importGraph.importsOf(file),
      filesInScope: new Set(scopedFiles),
      ownerships,
      declared,
    }),
    ...writeWithoutDeltaFindings(input.tasks, ownerships, deltaCapabilities),
  ];
}
