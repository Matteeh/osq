import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import {
  type CapabilityOwnership,
  ownerCapabilities,
  readCapabilityOwnership,
} from '../src/core/spec/capability-impact.js';
import { readLivingCapabilityNames } from '../src/core/spec/digest-capability.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Capabilities whose move has landed. ADR 016 decision 7 moves osq one slice
 * at a time: each move change adds its capability here, which turns that
 * slice's findings from warnings into failures while every other finding stays
 * a diagnostic. The list starts empty.
 */
const MOVED_CAPABILITIES: readonly string[] = [];

type FindingKind = 'unowned' | 'shared' | 'misplaced';

interface Finding {
  readonly file: string;
  readonly kind: FindingKind;
  readonly owners: readonly string[];
}

/**
 * The slice folder a source file sits in: the top-level folder under `src/`,
 * or for a file under `src/kernel/`, the folder under that. `undefined` marks a
 * file directly under `src/`, judged only on its owners; `null` marks a file
 * directly under `src/kernel/`, which sits in no slice.
 */
function sliceFolder(file: string): string | null | undefined {
  const parts = file.split('/');
  if (parts.length < 3) return undefined;
  if (parts[1] === 'kernel') return parts.length > 3 ? parts[2] : null;
  return parts[1];
}

/** Classify one repository-relative source file against the ownerships. */
function classify(ownerships: readonly CapabilityOwnership[], file: string): Finding | null {
  const owners = ownerCapabilities(ownerships, file);
  if (owners.length === 0) return { file, kind: 'unowned', owners };
  if (owners.length > 1) return { file, kind: 'shared', owners };
  const folder = sliceFolder(file);
  if (folder === undefined) return null;
  if (folder !== null && folder === owners[0]) return null;
  return { file, kind: 'misplaced', owners };
}

/** Classify every file, sorted by path, leaving out the files that match. */
function classifyAll(
  ownerships: readonly CapabilityOwnership[],
  files: readonly string[],
): Finding[] {
  const findings: Finding[] = [];
  for (const file of [...files].sort()) {
    const finding = classify(ownerships, file);
    if (finding !== null) findings.push(finding);
  }
  return findings;
}

/** Every file under `directory`, as repository-relative POSIX paths. */
async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(full)));
    } else if (entry.isFile()) {
      files.push(path.relative(repoRoot, full).split(path.sep).join('/'));
    }
  }
  return files;
}

/** Print one `ADR 016: ` diagnostic line per finding that is not misplaced. */
function reportWarnings(
  t: { diagnostic: (message: string) => void },
  findings: readonly Finding[],
): void {
  for (const finding of findings) {
    if (finding.kind === 'misplaced') continue;
    const owners = finding.owners.length > 0 ? ` (${finding.owners.join(', ')})` : '';
    t.diagnostic(`ADR 016: ${finding.kind} ${finding.file}${owners}`);
  }
  const counts = new Map<string, number>();
  for (const finding of findings) {
    if (finding.kind !== 'misplaced') continue;
    for (const owner of finding.owners) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  for (const [capability, count] of [...counts].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  )) {
    t.diagnostic(`ADR 016: ${capability} has ${count} misplaced file${count === 1 ? '' : 's'}`);
  }
}

describe('ADR 016: capability slices', () => {
  it('classifies a fixed set of files', () => {
    const ownerships: CapabilityOwnership[] = [
      { capability: 'report', globs: ['src/report/**', 'src/cli/report.ts'] },
      { capability: 'web', globs: ['src/web/**'] },
      {
        capability: 'config',
        globs: ['src/index.ts', 'src/kernel/config/**', 'src/kernel/loose.ts'],
      },
      { capability: 'shadow', globs: ['src/web/both.ts'] },
    ];
    const files = [
      'src/report/a.ts',
      'src/cli/report.ts',
      'src/core/x.ts',
      'src/web/both.ts',
      'src/index.ts',
      'src/kernel/config/load.ts',
      'src/kernel/loose.ts',
    ];

    assert.deepEqual(classifyAll(ownerships, files), [
      { file: 'src/cli/report.ts', kind: 'misplaced', owners: ['report'] },
      { file: 'src/core/x.ts', kind: 'unowned', owners: [] },
      { file: 'src/kernel/loose.ts', kind: 'misplaced', owners: ['config'] },
      { file: 'src/web/both.ts', kind: 'shared', owners: ['shadow', 'web'] },
    ]);
  });

  it('lists only living capabilities as moved', async () => {
    const living = await readLivingCapabilityNames(repoRoot, DEFAULT_CONFIG.paths.openspecRoot);
    for (const name of MOVED_CAPABILITIES) {
      assert.ok(living.includes(name), `${name} is in the moved list but has no living spec`);
    }
  });

  it("classifies osq's own source tree", async (t) => {
    const ownerships = await readCapabilityOwnership(repoRoot, DEFAULT_CONFIG.paths.openspecRoot);
    const living = await readLivingCapabilityNames(repoRoot, DEFAULT_CONFIG.paths.openspecRoot);
    const findings = classifyAll(ownerships, await sourceFiles(path.join(repoRoot, 'src')));

    const moved = new Set(MOVED_CAPABILITIES);
    const everyCapabilityMoved = living.length > 0 && living.every((name) => moved.has(name));
    const failing = everyCapabilityMoved
      ? findings
      : findings.filter((finding) => finding.owners.some((owner) => moved.has(owner)));

    reportWarnings(t, findings);

    if (failing.length > 0) {
      assert.fail(
        `ADR 016: findings for moved capabilities:\n${failing
          .map((finding) => `  ${finding.kind} ${finding.file} [${finding.owners.join(', ')}]`)
          .join('\n')}`,
      );
    }
  });
});
