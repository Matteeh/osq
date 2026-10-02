import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseDelta } from '../src/core/spec/delta.js';
import { archiveSpecsRecordPath } from '../src/watcher/archive-specs.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHANGES_DIR = path.join(REPO_ROOT, 'openspec', 'changes');
const LIVING_SPECS_DIR = path.join(REPO_ROOT, 'openspec', 'specs');

/**
 * Requirements that MUST survive the re-seed. 017 owns the baseline Code
 * ownership and test gating blocks; 020 through 027 own the rest.
 */
const PRESERVED_REQUIREMENTS: Readonly<Record<string, readonly string[]>> = {
  'cli-foundation': [
    'Code ownership',
    'Watch stale build and dev mode CLI options',
    'Repository health diagnostics',
    'Planner instruction scaffolding',
    'Canonical OpenSpec path layout',
    'Complete layout consumer cut-over',
    'Managed block coexistence',
    'Canonical migration layout authority',
  ],
  'metrics-and-reporting': [
    'Code ownership',
    'Undeclared test change failure metrics',
    'Manifest and measures schema',
  ],
  'spec-lint-and-approve': [
    'Code ownership',
    'Capability code ownership parsing',
    'Test modification declaration validation',
    'Architecture Decision Record 004: Pinned OpenSpec Validator',
    'OpenSpec schema execution authority instructions',
    'Proposal change-level verify command declaration',
  ],
  'status-inspection': ['Code ownership', 'Undeclared test change status inspection'],
  'watcher-and-harness': [
    'Code ownership',
    'Capability rule prompt injection',
    'Test modification gating',
    'Build identity metadata',
    'Stale build preflight detection',
    'Reactive dev mode execution',
    'Runner lifecycle modularization',
    'Architectural import graph boundaries',
    'Typed event hygiene and single emission path',
    'Golden event stream validation',
    'Consolidated marker writing and pure state derivation',
    'Source module line budget enforcement',
    'Backward-compatible state derivation and watcher layout cut-over',
    'Run manifest at approval',
    'Raw measures events on task lifecycle',
    'Emitted verify_ran event exit code and duration',
    'Done marker scope hash frontmatter',
    'Pre-spawn scope comparison and regression detection',
    'Regressed marker, event, and status lifecycle',
    'Archive-time verification re-run',
  ],
};

/** Requirement names in a living spec, in document order. */
function requirementNames(content: string): string[] {
  return [...content.matchAll(/^### Requirement:[ \t]*(.+)$/gm)].map((match) => match[1].trim());
}

/** The directory entries under `dir` that are directories, as full paths. */
async function subdirectories(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

/**
 * Every change folder whose deltas count: each folder under `<changesDir>/archive`,
 * and every active folder holding the record at `archiveSpecsRecordPath`.
 */
async function deltaChangeFolders(changesDir: string): Promise<string[]> {
  const folders = await subdirectories(path.join(changesDir, 'archive'));
  for (const folder of await subdirectories(changesDir)) {
    if (path.basename(folder) === 'archive') {
      continue;
    }
    const record = archiveSpecsRecordPath(folder);
    if (
      await fs
        .stat(record)
        .then(() => true)
        .catch(() => false)
    ) {
      folders.push(folder);
    }
  }
  return folders;
}

/**
 * Per capability, the requirement names that counted deltas removed or renamed
 * away, read with `parseDelta`'s `removed` and `renamed` (`from`) lists.
 */
async function goneNames(changesDir: string): Promise<Map<string, Set<string>>> {
  const gone = new Map<string, Set<string>>();
  for (const folder of await deltaChangeFolders(changesDir)) {
    for (const capabilityDir of await subdirectories(path.join(folder, 'specs'))) {
      const capability = path.basename(capabilityDir);
      const content = await fs
        .readFile(path.join(capabilityDir, 'spec.md'), 'utf8')
        .catch(() => null);
      if (content === null) {
        continue;
      }
      const names = gone.get(capability) ?? new Set<string>();
      const delta = parseDelta(content);
      for (const requirement of delta.removed) {
        names.add(requirement.name);
      }
      for (const rename of delta.renamed) {
        names.add(rename.from);
      }
      gone.set(capability, names);
    }
  }
  return gone;
}

/**
 * The pinned names missing from their living spec, unless a counted delta in
 * that capability removed or renamed them away. Empty means the check passes.
 */
async function missingPins(changesDir: string, livingSpecsDir: string): Promise<string[]> {
  const gone = await goneNames(changesDir);
  const missing: string[] = [];
  for (const [capability, requirements] of Object.entries(PRESERVED_REQUIREMENTS)) {
    const content = await fs
      .readFile(path.join(livingSpecsDir, capability, 'spec.md'), 'utf8')
      .catch(() => '');
    const names = requirementNames(content);
    for (const requirement of requirements) {
      if (names.includes(requirement)) {
        continue;
      }
      if (gone.get(capability)?.has(requirement)) {
        continue;
      }
      missing.push(`${capability} is missing preserved requirement "${requirement}"`);
    }
  }
  return missing;
}

/** Write a change folder's delta for one capability. */
async function writeDelta(folder: string, capability: string, body: string): Promise<void> {
  await fs.mkdir(path.join(folder, 'specs', capability), { recursive: true });
  await fs.writeFile(
    path.join(folder, 'specs', capability, 'spec.md'),
    `# Delta: ${capability}\n\n${body}\n`,
    'utf8',
  );
}

/**
 * Write every capability's living spec with all pinned requirements except the
 * named ones, so only the intended omission can fail.
 */
async function writeLivingSpecs(
  dir: string,
  omit: readonly (readonly [string, string])[] = [],
): Promise<void> {
  for (const [capability, requirements] of Object.entries(PRESERVED_REQUIREMENTS)) {
    const dropped = new Set(
      omit.filter(([name]) => name === capability).map(([, requirement]) => requirement),
    );
    const blocks = requirements
      .filter((requirement) => !dropped.has(requirement))
      .map((requirement) => `### Requirement: ${requirement}\n\nBody.\n`);
    await fs.mkdir(path.join(dir, capability), { recursive: true });
    await fs.writeFile(
      path.join(dir, capability, 'spec.md'),
      `# ${capability} Specification\n\n## Purpose\nA test spec.\n\n## Requirements\n\n${blocks.join('\n')}`,
      'utf8',
    );
  }
}

/** A fresh temporary root holding empty `changes` and `specs` folders. */
async function temporaryRoot(): Promise<{ root: string; changes: string; specs: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-pins-'));
  const changes = path.join(root, 'changes');
  const specs = path.join(root, 'specs');
  await fs.mkdir(path.join(changes, 'archive'), { recursive: true });
  await fs.mkdir(specs, { recursive: true });
  return { root, changes, specs };
}

describe('Living spec requirement pins', () => {
  it('passes against this repository', async () => {
    assert.deepEqual(await missingPins(CHANGES_DIR, LIVING_SPECS_DIR), []);
  });

  it('passes when an archived delta removed the pinned requirement', async () => {
    const { root, changes, specs } = await temporaryRoot();
    try {
      await writeLivingSpecs(specs, [['cli-foundation', 'Repository health diagnostics']]);
      await writeDelta(
        path.join(changes, 'archive', '001-removed'),
        'cli-foundation',
        '## REMOVED Requirements\n\n- `### Requirement: Repository health diagnostics`\n',
      );

      assert.deepEqual(await missingPins(changes, specs), []);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('passes when an active change with the archive record renamed the pinned requirement', async () => {
    const { root, changes, specs } = await temporaryRoot();
    try {
      await writeLivingSpecs(specs, [['cli-foundation', 'Repository health diagnostics']]);
      const active = path.join(changes, '001-rename');
      await writeDelta(
        active,
        'cli-foundation',
        '## RENAMED Requirements\n\n- FROM: `### Requirement: Repository health diagnostics`\n- TO: `### Requirement: Renamed diagnostics`\n',
      );
      await fs.mkdir(path.join(active, '.run'), { recursive: true });
      await fs.writeFile(archiveSpecsRecordPath(active), '{}', 'utf8');

      assert.deepEqual(await missingPins(changes, specs), []);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('fails when the difference is another capability removing the same name', async () => {
    const { root, changes, specs } = await temporaryRoot();
    try {
      await writeLivingSpecs(specs, [['cli-foundation', 'Code ownership']]);
      await writeDelta(
        path.join(changes, 'archive', '001-other'),
        'watcher-and-harness',
        '## REMOVED Requirements\n\n- `### Requirement: Code ownership`\n',
      );

      assert.deepEqual(await missingPins(changes, specs), [
        'cli-foundation is missing preserved requirement "Code ownership"',
      ]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('fails when a pinned requirement is lost with no delta removing or renaming it', async () => {
    const { root, changes, specs } = await temporaryRoot();
    try {
      await writeLivingSpecs(specs, [['cli-foundation', 'Repository health diagnostics']]);

      assert.deepEqual(await missingPins(changes, specs), [
        'cli-foundation is missing preserved requirement "Repository health diagnostics"',
      ]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('ignores an active change without the archive record', async () => {
    const { root, changes, specs } = await temporaryRoot();
    try {
      await writeLivingSpecs(specs, [['cli-foundation', 'Repository health diagnostics']]);
      await writeDelta(
        path.join(changes, '001-no-record'),
        'cli-foundation',
        '## REMOVED Requirements\n\n- `### Requirement: Repository health diagnostics`\n',
      );

      assert.deepEqual(await missingPins(changes, specs), [
        'cli-foundation is missing preserved requirement "Repository health diagnostics"',
      ]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
