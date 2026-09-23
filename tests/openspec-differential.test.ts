import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { DeltaMergeError } from '../src/core/spec/delta.js';
import { applyOpenSpecDeltas } from '../src/watcher/archiver.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'openspec-diff');
const TEMPLATES_DIR = path.join(REPO_ROOT, 'templates', 'openspec');

const OPENSPEC_BIN =
  process.env.OSQ_OPENSPEC_BIN ?? path.join(REPO_ROOT, 'node_modules', '.bin', 'openspec');

const VERSION = (() => {
  const result = spawnSync(OPENSPEC_BIN, ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`openspec ${OPENSPEC_BIN} --version failed: ${result.stdout}${result.stderr}`);
  }
  return result.stdout.trim();
})();

const LABEL = `openspec ${VERSION}`;

interface CaseConfig {
  readonly expect: 'identical' | 'both-refuse' | 'osq-refuses';
}

function runOpenSpec(args: readonly string[], cwd: string) {
  return spawnSync(OPENSPEC_BIN, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, OPENSPEC_TELEMETRY: '0' },
  });
}

/** Every regular file under `root`, keyed by its project-relative POSIX path. */
async function readTree(root: string): Promise<Map<string, string>> {
  const tree = new Map<string, string>();

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const key = path.relative(root, fullPath).split(path.sep).join('/');
        tree.set(key, await fs.readFile(fullPath, 'utf8'));
      }
    }
  }

  await walk(root);
  return tree;
}

async function assertTreesEqual(left: string, right: string, message: string): Promise<void> {
  const leftTree = await readTree(left);
  const rightTree = await readTree(right);
  assert.deepEqual([...leftTree.keys()], [...rightTree.keys()], message);
  for (const [key, content] of leftTree) {
    assert.equal(rightTree.get(key), content, `${message}: ${key}`);
  }
}

async function listChanges(repo: string): Promise<string[]> {
  const changesDir = path.join(repo, 'openspec', 'changes');
  const entries = await fs.readdir(changesDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Copy the scaffolded schema plus the case's specs and changes into `repo`. */
async function scaffoldRepo(repo: string, caseDir: string): Promise<void> {
  const openspecDir = path.join(repo, 'openspec');
  await fs.mkdir(openspecDir, { recursive: true });
  await fs.copyFile(path.join(TEMPLATES_DIR, 'config.yaml'), path.join(openspecDir, 'config.yaml'));
  await fs.cp(path.join(TEMPLATES_DIR, 'schemas'), path.join(openspecDir, 'schemas'), {
    recursive: true,
  });

  const caseSpecs = path.join(caseDir, 'specs');
  const hasSpecs = await fs
    .stat(caseSpecs)
    .then(() => true)
    .catch(() => false);
  if (hasSpecs) {
    await fs.cp(caseSpecs, path.join(openspecDir, 'specs'), { recursive: true });
  }

  await fs.cp(path.join(caseDir, 'changes'), path.join(openspecDir, 'changes'), {
    recursive: true,
  });
}

async function listDeltaSpecFiles(caseDir: string): Promise<string[]> {
  const changesDir = path.join(caseDir, 'changes');
  const entries = await fs.readdir(changesDir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const change of entries) {
    if (!change.isDirectory()) continue;
    const specsDir = path.join(changesDir, change.name, 'specs');
    const caps = await fs.readdir(specsDir, { withFileTypes: true }).catch(() => []);
    for (const cap of caps) {
      if (cap.isDirectory()) {
        files.push(path.join(specsDir, cap.name, 'spec.md'));
      }
    }
  }
  return files;
}

/** The rename targets a bare RENAMED block names but OpenSpec silently skips. */
async function renameTargets(caseDir: string): Promise<string[]> {
  const targets: string[] = [];
  for (const file of await listDeltaSpecFiles(caseDir)) {
    const content = await fs.readFile(file, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*[-*+]?\s*TO:\s*(.+?)\s*$/i);
      if (!match) continue;
      const value = match[1]
        .replace(/^`+/, '')
        .replace(/`+$/, '')
        .replace(/^###\s*Requirement:\s*/i, '')
        .trim();
      if (value) targets.push(value);
    }
  }
  return targets;
}

async function caseNames(): Promise<string[]> {
  const entries = await fs.readdir(FIXTURES_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Every fixture case with its parsed expectation, resolved once at load. */
const CASES: { name: string; dir: string; config: CaseConfig }[] = await (async () => {
  const names = await caseNames();
  return Promise.all(
    names.map(async (name) => {
      const dir = path.join(FIXTURES_DIR, name);
      const config = JSON.parse(
        await fs.readFile(path.join(dir, 'case.json'), 'utf8'),
      ) as CaseConfig;
      return { name, dir, config };
    }),
  );
})();

/** Both tools are compared against the case's original `openspec/specs`. */
async function assertTreeMatchesBase(
  repo: string,
  caseDir: string,
  message: string,
): Promise<void> {
  const actual = await readTree(path.join(repo, 'openspec', 'specs'));
  const caseSpecs = path.join(caseDir, 'specs');
  const hasSpecs = await fs
    .stat(caseSpecs)
    .then(() => true)
    .catch(() => false);
  const expected = hasSpecs ? await readTree(caseSpecs) : new Map<string, string>();
  assert.deepEqual([...actual.keys()], [...expected.keys()], message);
  for (const [key, content] of expected) {
    assert.equal(actual.get(key), content, `${message}: ${key}`);
  }
}

describe('OpenSpec differential archive parity', () => {
  it(`${LABEL} is reported by the installed validator`, () => {
    assert.match(VERSION, /\d+\.\d+\.\d+/, `${LABEL} did not report a semantic version`);
  });

  for (const { name, dir: caseDir, config } of CASES) {
    it(`${LABEL}: case ${name} (${config.expect})`, async () => {
      const repoA = await fs.mkdtemp(path.join(os.tmpdir(), `osq-diff-a-${name}-`));
      const repoB = await fs.mkdtemp(path.join(os.tmpdir(), `osq-diff-b-${name}-`));

      try {
        await scaffoldRepo(repoA, caseDir);
        await scaffoldRepo(repoB, caseDir);
        const changes = await listChanges(repoA);

        if (config.expect === 'identical') {
          for (const id of changes) {
            const validate = runOpenSpec(
              ['validate', id, '--type', 'change', '--strict', '--json', '--no-interactive'],
              repoA,
            );
            assert.equal(
              validate.status,
              0,
              `${LABEL}: validate ${id} failed:\n${validate.stdout}${validate.stderr}`,
            );
          }
          for (const id of changes) {
            const archive = runOpenSpec(['archive', id, '--yes', '--json'], repoA);
            assert.equal(
              archive.status,
              0,
              `${LABEL}: archive ${id} failed:\n${archive.stdout}${archive.stderr}`,
            );
          }
          for (const id of changes) {
            await applyOpenSpecDeltas(
              repoB,
              path.join(repoB, 'openspec', 'changes', id),
              DEFAULT_CONFIG,
            );
          }
          await assertTreesEqual(
            path.join(repoA, 'openspec', 'specs'),
            path.join(repoB, 'openspec', 'specs'),
            `${LABEL}: ${name} specs differ`,
          );
          return;
        }

        if (config.expect === 'both-refuse') {
          const id = changes[0];
          const archive = runOpenSpec(['archive', id, '--yes', '--json'], repoA);
          assert.notEqual(
            archive.status,
            0,
            `${LABEL}: archive ${id} unexpectedly succeeded:\n${archive.stdout}`,
          );
          const status = JSON.parse(archive.stdout).status ?? [];
          assert.ok(
            status.some((entry: { code?: string }) => entry.code === 'archive_spec_update_failed'),
            `${LABEL}: archive ${id} did not report archive_spec_update_failed:\n${archive.stdout}`,
          );
          await assert.rejects(
            applyOpenSpecDeltas(repoB, path.join(repoB, 'openspec', 'changes', id), DEFAULT_CONFIG),
            (error: unknown) => {
              assert.ok(
                error instanceof DeltaMergeError,
                `${LABEL}: expected DeltaMergeError, got ${String(error)}`,
              );
              return true;
            },
            `${LABEL}: applyOpenSpecDeltas should refuse ${name}`,
          );
          await assertTreeMatchesBase(repoA, caseDir, `${LABEL}: ${name} changed tool A specs`);
          await assertTreeMatchesBase(repoB, caseDir, `${LABEL}: ${name} changed osq specs`);
          return;
        }

        const id = changes[0];
        await assert.rejects(
          applyOpenSpecDeltas(repoB, path.join(repoB, 'openspec', 'changes', id), DEFAULT_CONFIG),
          (error: unknown) => {
            assert.ok(
              error instanceof DeltaMergeError,
              `${LABEL}: expected DeltaMergeError, got ${String(error)}`,
            );
            assert.ok(
              error.message.includes('### Requirement:'),
              `${LABEL}: refusal must name the expected form: ${error.message}`,
            );
            return true;
          },
          `${LABEL}: applyOpenSpecDeltas should refuse ${name}`,
        );

        const archive = runOpenSpec(['archive', id, '--yes', '--json'], repoA);
        assert.equal(
          archive.status,
          0,
          `${LABEL}: archive ${id} unexpectedly failed:\n${archive.stdout}${archive.stderr}`,
        );
        const living = await readTree(path.join(repoA, 'openspec', 'specs'));
        for (const target of await renameTargets(caseDir)) {
          const present = [...living.values()].some((content) =>
            content.includes(`### Requirement: ${target}`),
          );
          assert.equal(
            present,
            false,
            `${LABEL}: ${name} applied a rename OpenSpec should skip: ${target}`,
          );
        }
      } finally {
        await fs.rm(repoA, { recursive: true, force: true });
        await fs.rm(repoB, { recursive: true, force: true });
      }
    });
  }
});
