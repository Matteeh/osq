import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mergeLivingSpec } from '../src/core/spec/apply-deltas.js';
import { parseDelta } from '../src/core/spec/delta.js';
import { readLandedAt } from '../src/core/web/web-data-lifecycle.js';
import { archiveSpecsRecordPath } from '../src/watcher/archive-specs.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHANGES_DIR = path.join(REPO_ROOT, 'openspec', 'changes');
const ARCHIVE_DIR = path.join(CHANGES_DIR, 'archive');
const LIVING_SPECS_DIR = path.join(REPO_ROOT, 'openspec', 'specs');
const SRC_DIR = path.join(REPO_ROOT, 'src');

/** The first archive that carries OpenSpec delta specifications. */
const FIRST_ARCHIVED_DELTA = '016';

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

/**
 * The names of the active changes whose deltas archive has applied for their
 * change-level `verify`, in folder-name order.
 */
async function applyingChangeFolders(changesDir: string = CHANGES_DIR): Promise<string[]> {
  const entries = await fs.readdir(changesDir, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
    .map((entry) => entry.name)
    .sort();

  const applying: string[] = [];
  for (const name of names) {
    const recordPath = archiveSpecsRecordPath(path.join(changesDir, name));
    if (
      await fs
        .stat(recordPath)
        .then(() => true)
        .catch(() => false)
    ) {
      applying.push(name);
    }
  }
  return applying;
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

/**
 * Compares two texts line by line. Returns null when they are equal, otherwise
 * a message naming the first differing line and up to three lines of context
 * around it from each side. Expected lines are prefixed `- ` and actual
 * lines `+ `, so a failure never prints either whole text.
 */
function firstLineDifference(label: string, expected: string, actual: string): string | null {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const total = Math.max(expectedLines.length, actualLines.length);

  for (let index = 0; index < total; index += 1) {
    if (expectedLines[index] === actualLines[index]) {
      continue;
    }

    const line = index + 1;
    const lines = [`${label}: first difference at line ${line}`];
    const start = Math.max(0, index - 3);
    const end = Math.min(total, index + 4);
    for (let context = start; context < end; context += 1) {
      lines.push(`- ${expectedLines[context] ?? ''}`);
      lines.push(`+ ${actualLines[context] ?? ''}`);
    }
    return lines.join('\n');
  }

  return null;
}

/** Every capability folder under `openspec/specs/`, sorted. */
async function livingCapabilities(): Promise<string[]> {
  const entries = await fs.readdir(LIVING_SPECS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Every capability with a living folder or a delta in a replayed change. */
async function replayCapabilities(): Promise<string[]> {
  const names = new Set<string>(await livingCapabilities());
  const folders = [
    ...(await archivedChangeFolders()).map((folder) => path.join(ARCHIVE_DIR, folder)),
    ...(await applyingChangeFolders()).map((folder) => path.join(CHANGES_DIR, folder)),
  ];
  for (const folder of folders) {
    const deltasDir = path.join(folder, 'specs');
    const entries = await fs.readdir(deltasDir, { withFileTypes: true }).catch((): Dirent[] => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const specPath = path.join(deltasDir, entry.name, 'spec.md');
      if (
        await fs
          .stat(specPath)
          .then(() => true)
          .catch(() => false)
      ) {
        names.add(entry.name);
      }
    }
  }
  return [...names].sort();
}

/** Replays the deterministic merge of every archived delta for one capability. */
async function replayLivingSpec(capability: string): Promise<string | null> {
  let base: string | null = null;
  const folders = [
    ...(await archivedChangeFolders()).map((folder) => path.join(ARCHIVE_DIR, folder)),
    ...(await applyingChangeFolders()).map((folder) => path.join(CHANGES_DIR, folder)),
  ];
  for (const folder of folders) {
    const deltaPath = path.join(folder, 'specs', capability, 'spec.md');
    const content = await fs.readFile(deltaPath, 'utf8').catch(() => null);
    if (content === null) {
      continue;
    }
    base = mergeLivingSpec(base, capability, parseDelta(content));
  }

  return base === null ? null : stripLegacyDeltaReferences(base);
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
    const capabilities = await replayCapabilities();
    assert.ok(capabilities.length > 0, 'no capability to replay');
    for (const capability of capabilities) {
      const expected = await replayLivingSpec(capability);
      const livingPath = path.join(LIVING_SPECS_DIR, capability, 'spec.md');
      const actual = await fs.readFile(livingPath, 'utf8').catch(() => null);

      if (expected === null) {
        assert.equal(actual, null, `${capability} replays to no requirement but has a living spec`);
        continue;
      }

      assert.ok(
        actual !== null,
        `${capability} replay produced a spec but the living folder is absent`,
      );
      const livingMismatch = firstLineDifference(
        `${capability} living spec is not the deterministic merge`,
        withoutPurposeBlankLine(expected),
        withoutPurposeBlankLine(actual),
      );
      if (livingMismatch !== null) {
        assert.fail(livingMismatch);
      }

      // Replaying twice must be byte-for-byte stable.
      const replayed = await replayLivingSpec(capability);
      assert.ok(replayed !== null, `${capability} replay is not stable`);
      const replayMismatch = firstLineDifference(
        `${capability} replay is not byte-for-byte stable`,
        expected,
        replayed,
      );
      if (replayMismatch !== null) {
        assert.fail(replayMismatch);
      }
    }
  });

  it('reports one differing line with context from each side', () => {
    const expectedLines = Array.from({ length: 500 }, (_, index) => `line-${index + 1}`);
    const actualLines = [...expectedLines];
    actualLines[249] = 'line-250-changed';
    const expected = expectedLines.join('\n');
    const actual = actualLines.join('\n');

    const message = firstLineDifference('spec mismatch', expected, actual);
    assert.ok(message !== null, 'two differing texts must produce a message');

    const rendered = message.split('\n');
    assert.ok(message.includes('line 250'), `message must name line 250: ${message}`);
    for (let line = 247; line <= 253; line += 1) {
      assert.ok(
        rendered.includes(`- line-${line}`),
        `message must hold expected line ${line}: ${message}`,
      );
      if (line !== 250) {
        assert.ok(
          rendered.includes(`+ line-${line}`),
          `message must hold actual line ${line}: ${message}`,
        );
      }
    }
    assert.ok(
      rendered.includes('+ line-250-changed'),
      `message must hold the changed actual line: ${message}`,
    );
    assert.ok(!rendered.includes('- line-1'), `message must not hold line 1: ${message}`);
    assert.ok(!rendered.includes('+ line-1'), `message must not hold line 1: ${message}`);
    assert.ok(!rendered.includes('- line-500'), `message must not hold line 500: ${message}`);
    assert.ok(!rendered.includes('+ line-500'), `message must not hold line 500: ${message}`);

    assert.equal(firstLineDifference('equal texts', expected, expected), null);
  });

  it('contains zero legacy "Delta from" references and no loose spec markdown files', async () => {
    for (const capability of await livingCapabilities()) {
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

  it('picks up active changes holding the archive record, in folder-name order', async () => {
    const tempChangesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-applying-changes-'));
    try {
      await fs.mkdir(path.join(tempChangesDir, 'archive'), { recursive: true });
      await fs.mkdir(path.join(tempChangesDir, '001-a', '.run'), { recursive: true });
      await fs.writeFile(archiveSpecsRecordPath(path.join(tempChangesDir, '001-a')), '{}', 'utf8');
      await fs.mkdir(path.join(tempChangesDir, '002-b', '.run'), { recursive: true });
      await fs.writeFile(archiveSpecsRecordPath(path.join(tempChangesDir, '002-b')), '{}', 'utf8');
      await fs.mkdir(path.join(tempChangesDir, '003-c'), { recursive: true });

      assert.deepEqual(await applyingChangeFolders(tempChangesDir), ['001-a', '002-b']);
    } finally {
      await fs.rm(tempChangesDir, { recursive: true, force: true });
    }
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
