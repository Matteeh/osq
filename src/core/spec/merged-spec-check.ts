/**
 * Merged living spec validation.
 *
 * A delta only becomes a living spec after archive. Lint writes the exact text
 * `mergeDelta` produces for every delta that merges into a temporary folder and
 * validates that folder, so problems that today appear only after archive are
 * reported before approval. Issues the living spec already carries are left out
 * so a pre-existing warning is never charged to the change.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { type CapabilitySpec, parseCapabilitySpec } from './delta.js';
import { type LintFinding, makeFinding, openSpecSeverity } from './lint-findings.js';
import {
  OPENSPEC_ERROR_PREFIX,
  type OpenSpecIssueRecord,
  execFileCapture,
  parseOpenSpecItems,
} from './openspec-issues.js';

export interface MergedSpecInput {
  readonly capability: string;
  readonly mergedContent: string;
  /** Repository-relative delta file the finding names. */
  readonly deltaFile: string;
}

const MERGED_SPEC_ARGS = ['validate', '--specs', '--strict', '--json', '--no-interactive'];
const REQUIREMENT_INDEX_REGEX = /^requirements\[(\d+)\]$/;

interface IssueTarget {
  readonly requirement: string | null;
  readonly section: string | null;
}

/** Resolve an issue path against the merged text: requirement or section. */
function resolveTarget(spec: CapabilitySpec, issuePath: string | null): IssueTarget {
  if (issuePath === 'overview') {
    return { requirement: null, section: 'Purpose' };
  }
  const match = issuePath === null ? null : REQUIREMENT_INDEX_REGEX.exec(issuePath);
  if (!match) {
    return { requirement: null, section: null };
  }
  return {
    requirement: spec.requirements[Number.parseInt(match[1], 10)]?.name ?? null,
    section: null,
  };
}

/** The living spec file a capability repository finding names. */
function livingSpecFile(openspecRoot: string, capability: string): string {
  return `${openspecRoot}/specs/${capability}/spec.md`;
}

/** True when the living spec already carries this message on this target. */
function alreadyKnown(
  issue: OpenSpecIssueRecord,
  target: IssueTarget,
  livingFindings: readonly LintFinding[],
): boolean {
  const message = `${OPENSPEC_ERROR_PREFIX} ${issue.message}`;
  return livingFindings.some(
    (finding) =>
      finding.message === message &&
      ((target.requirement !== null && finding.requirement === target.requirement) ||
        (target.section !== null && finding.section === target.section)),
  );
}

/** Write every merged spec into one temporary tree, ready for validation. */
async function writeMergedTree(tempDir: string, inputs: readonly MergedSpecInput[]): Promise<void> {
  for (const input of inputs) {
    const dir = path.join(tempDir, 'openspec', 'specs', input.capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), input.mergedContent, 'utf8');
  }
}

/**
 * Validate the merged capability specs once in a temporary folder and return the
 * resulting findings. Issues the living spec already has, on the same
 * requirement or section, are omitted. Returns `[]` when no merged spec exists.
 */
export async function validateMergedSpecs(
  config: OsqConfig,
  bin: string,
  openspecRoot: string,
  inputs: readonly MergedSpecInput[],
  livingFindings: readonly LintFinding[],
): Promise<LintFinding[]> {
  if (inputs.length === 0) {
    return [];
  }
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-merged-spec-'));
  try {
    await writeMergedTree(tempDir, inputs);
    const outcome = await execFileCapture(bin, MERGED_SPEC_ARGS, {
      cwd: tempDir,
      env: { ...process.env, OPENSPEC_TELEMETRY: '0' },
      timeout: config.timeouts.verifyTimeoutSeconds * 1000,
    });
    const items = parseOpenSpecItems(outcome.stdout);
    if (items === null) {
      return [];
    }

    const byCapability = new Map(inputs.map((input) => [input.capability, input]));
    const findings: LintFinding[] = [];
    for (const item of items) {
      const input = byCapability.get(item.id);
      if (!input) {
        continue;
      }
      const spec = parseCapabilitySpec(input.mergedContent);
      const living = livingFindings.filter(
        (finding) => finding.file === livingSpecFile(openspecRoot, item.id),
      );
      for (const issue of item.issues) {
        const target = resolveTarget(spec, issue.path);
        if (alreadyKnown(issue, target, living)) {
          continue;
        }
        findings.push(
          makeFinding(
            openSpecSeverity(issue.level),
            { file: input.deltaFile, requirement: target.requirement, section: target.section },
            `${OPENSPEC_ERROR_PREFIX} ${item.id} after archive: ${issue.message}`,
          ),
        );
      }
    }
    return findings;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
