import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mergeDelta, parseDelta } from '../src/core/spec/delta.js';
import { readLandedAt } from '../src/core/web/web-data-lifecycle.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVE_DIR = path.join(REPO_ROOT, 'openspec', 'changes', 'archive');
const LIVING_SPECS_DIR = path.join(REPO_ROOT, 'openspec', 'specs');
const SRC_DIR = path.join(REPO_ROOT, 'src');

/** The first archive that carries OpenSpec delta specifications. */
const FIRST_ARCHIVED_DELTA = '016';

/**
 * The five living capabilities. Every one of them is introduced by the 016
 * delta specs and augmented (never replaced) by 017 and 020 through 027.
 */
const CAPABILITIES = [
  'cli-foundation',
  'metrics-and-reporting',
  'spec-lint-and-approve',
  'status-inspection',
  'watcher-and-harness',
] as const;

/**
 * Requirements that MUST survive the re-seed. 017 owns the baseline Code
 * ownership and test gating blocks; 020 through 027 own the rest.
 */
const PRESERVED_REQUIREMENTS: Readonly<Record<string, readonly string[]>> = {
  'cli-foundation': [
    'Code ownership',
    'Test gating configuration',
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

/**
 * The deterministic re-seed strips every legacy prose-appender reference so the
 * living specs never resurrect the retired `## Delta from ...` sections.
 */
function stripLegacyDeltaReferences(content: string): string {
  return content.replace(/Delta from /g, '');
}

/**
 * Archive folders from 016 onward in landing order. Archives that never
 * recorded a change-level `archived` event come first, in folder-name order.
 * The rest follow by that event's timestamp, with ties broken by folder name.
 */
async function archivedChangeFolders(archiveDir: string = ARCHIVE_DIR): Promise<string[]> {
  const entries = await fs.readdir(archiveDir, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory() && entry.name >= FIRST_ARCHIVED_DELTA)
    .map((entry) => entry.name);

  const landed = await Promise.all(
    names.map(async (name) => ({
      name,
      landedAt: await readLandedAt(path.join(archiveDir, name)),
    })),
  );

  return landed
    .sort((a, b) => {
      if (a.landedAt === null || b.landedAt === null) {
        if (a.landedAt === b.landedAt) return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
        return a.landedAt === null ? -1 : 1;
      }
      if (a.landedAt !== b.landedAt) return a.landedAt < b.landedAt ? -1 : 1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    })
    .map((entry) => entry.name);
}

/** Writes one temporary archived change that carries a single capability delta. */
async function writeArchivedChange(
  archiveDir: string,
  folder: string,
  capability: string,
  landedAt: string,
): Promise<void> {
  const changeDir = path.join(archiveDir, folder);
  await fs.mkdir(path.join(changeDir, 'specs', capability), { recursive: true });
  await fs.writeFile(
    path.join(changeDir, 'specs', capability, 'spec.md'),
    `# Delta for ${capability}\n`,
  );
  await fs.mkdir(path.join(changeDir, '.run', 'events'), { recursive: true });
  await fs.writeFile(
    path.join(changeDir, '.run', 'events', 'change.jsonl'),
    `${JSON.stringify({ type: 'archived', timestamp: landedAt })}\n`,
  );
}

/**
 * osq created the living specs before it learned to follow `## Purpose` with
 * the body on the next line, so those files carry one blank line there. The
 * replay now writes OpenSpec's shape; the sole difference is that blank line.
 */
function withoutPurposeBlankLine(content: string): string {
  return content.replace(/(## Purpose\n)\n/, '$1');
}

/** Replays the deterministic merge of every archived delta for one capability. */
async function replayLivingSpec(capability: string): Promise<string> {
  let base: string | null = null;
  for (const folder of await archivedChangeFolders()) {
    const deltaPath = path.join(ARCHIVE_DIR, folder, 'specs', capability, 'spec.md');
    const content = await fs.readFile(deltaPath, 'utf8').catch(() => null);
    if (content === null) {
      continue;
    }
    base = mergeDelta(base, capability, parseDelta(content));
  }

  if (base === null) {
    throw new Error(`No archived delta specifications found for capability ${capability}`);
  }
  return stripLegacyDeltaReferences(base);
}

function requirementNames(content: string): string[] {
  return [...content.matchAll(/^### Requirement:[ \t]*(.+)$/gm)].map((match) => match[1].trim());
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Living spec delta equivalence', () => {
  it('re-seeds every living spec as the cumulative deterministic merge of 016..027', async () => {
    for (const capability of CAPABILITIES) {
      const expected = await replayLivingSpec(capability);
      const actual = await fs.readFile(path.join(LIVING_SPECS_DIR, capability, 'spec.md'), 'utf8');

      assert.equal(
        withoutPurposeBlankLine(actual),
        withoutPurposeBlankLine(expected),
        `${capability} living spec is not the deterministic merge`,
      );

      // Replaying twice must be byte-for-byte stable.
      assert.equal(await replayLivingSpec(capability), expected);
    }
  });

  it('preserves requirements introduced by 017 and 020 through 027', async () => {
    for (const capability of CAPABILITIES) {
      const content = await fs.readFile(path.join(LIVING_SPECS_DIR, capability, 'spec.md'), 'utf8');
      const names = requirementNames(content);

      for (const requirement of PRESERVED_REQUIREMENTS[capability]) {
        assert.ok(
          names.includes(requirement),
          `${capability} is missing preserved requirement "${requirement}"`,
        );
      }
    }
  });

  it('contains zero legacy "Delta from" references and no loose spec markdown files', async () => {
    for (const capability of CAPABILITIES) {
      const content = await fs.readFile(path.join(LIVING_SPECS_DIR, capability, 'spec.md'), 'utf8');
      assert.ok(!content.includes('Delta from'), `${capability} still references "Delta from"`);
    }

    const entries = await fs.readdir(LIVING_SPECS_DIR, { withFileTypes: true });
    const looseMarkdown = entries
      .filter((entry) => entry.name.endsWith('.md'))
      .map((entry) => entry.name);
    assert.deepEqual(looseMarkdown, [], 'legacy openspec/specs/*.md files must be removed');
  });

  it('git grep "Delta from" openspec/specs returns zero matches', () => {
    const result = spawnSync('git', ['grep', '-n', 'Delta from', 'openspec/specs/'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    assert.equal(
      result.status,
      1,
      `git grep unexpectedly matched:\n${result.stdout}${result.stderr}`,
    );
    assert.equal(result.stdout.trim(), '');
  });

  it('deletes the legacy prose appender applyDelta and calls applyOpenSpecDeltas directly', async () => {
    const archiverPath = path.join(SRC_DIR, 'watcher', 'archiver.ts');
    const archiverSource = await fs.readFile(archiverPath, 'utf8');

    assert.ok(
      archiverSource.includes('await applyOpenSpecDeltas(projectRoot, specFolderPath, config);'),
      'archiveSpecFolder must call applyOpenSpecDeltas directly',
    );

    for (const file of await listFiles(SRC_DIR)) {
      if (!file.endsWith('.ts') || file.endsWith('.d.ts')) {
        continue;
      }
      const source = await fs.readFile(file, 'utf8');
      assert.ok(
        !source.includes('applyDelta'),
        `${path.relative(REPO_ROOT, file)} still references applyDelta`,
      );
    }

    const archiver = await import('../src/watcher/archiver.js');
    assert.equal(typeof archiver.applyOpenSpecDeltas, 'function');
    assert.ok(!('applyDelta' in archiver), 'applyDelta must not be exported');
  });

  it('orders archives by landing time and puts eventless folders first', async () => {
    const tempArchiveDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-archive-order-'));
    try {
      const capability = 'cli-foundation';
      await writeArchivedChange(
        tempArchiveDir,
        '060-later-landed',
        capability,
        '2026-09-23T09:00:00.000Z',
      );
      await writeArchivedChange(
        tempArchiveDir,
        '061-earlier-landed',
        capability,
        '2026-09-23T08:00:00.000Z',
      );
      await fs.mkdir(path.join(tempArchiveDir, '059-no-event', 'specs', capability), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(tempArchiveDir, '059-no-event', 'specs', capability, 'spec.md'),
        `# Delta for ${capability}\n`,
      );

      assert.deepEqual(await archivedChangeFolders(tempArchiveDir), [
        '059-no-event',
        '061-earlier-landed',
        '060-later-landed',
      ]);
    } finally {
      await fs.rm(tempArchiveDir, { recursive: true, force: true });
    }
  });
});
