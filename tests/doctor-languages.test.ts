import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { type DoctorReport, runDoctorChecks } from '../src/core/foundation/doctor.js';
import { OPENSPEC_EXPECTED_VERSION } from '../src/core/spec/openspec-version.js';

const execFileAsync = promisify(execFile);
const tmpDirs: string[] = [];

after(async () => {
  await Promise.all(tmpDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** The test's own git calls ignore redirecting variables, like osq's reads. */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
    Reflect.deleteProperty(env, key);
  }
  return env;
}

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
}

async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** A temporary git project tracking the given files, committed on `main`. */
async function gitProject(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-doctor-languages-'));
  tmpDirs.push(root);
  await writeAt(root, '.gitignore', 'node_modules/\n');
  for (const [relative, content] of Object.entries(files)) {
    await writeAt(root, relative, content);
  }
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'seed'], root);
  return root;
}

function runDoctor(root: string): Promise<DoctorReport> {
  const config: OsqConfig = defineConfig({ harness: 'mock' });
  return runDoctorChecks(root, {
    loadConfig: async () => config,
    probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
  });
}

const RUST_MESSAGE =
  'TypeScript/JavaScript, Rust. Rust lacks gates: denied-dependency gate; ' +
  'extras: test output reading, ' +
  'import graph, traceability, function ranges, repository measures';

describe('languages doctor check', () => {
  it('warns on Rust beside TypeScript with the gates and extras Rust lacks', async () => {
    const root = await gitProject({
      'package.json': '{"name":"demo"}\n',
      'crates/core/Cargo.toml': '[package]\nname = "core"\n',
    });
    const report = await runDoctor(root);

    const languages = report.checks.find((check) => check.name === 'languages');
    assert.deepEqual(languages, {
      name: 'languages',
      ok: true,
      warning: true,
      message: RUST_MESSAGE,
    });
    // The check never changes doctor's exit code: `ok` is what it is without it.
    const withoutLanguages = report.checks
      .filter((check) => check.name !== 'languages')
      .every((check) => check.ok);
    assert.equal(report.ok, withoutLanguages);
  });

  it('adds no languages check when the only manifest is package.json', async () => {
    const root = await gitProject({ 'package.json': '{"name":"demo"}\n' });
    const report = await runDoctor(root);

    assert.equal(
      report.checks.find((check) => check.name === 'languages'),
      undefined,
    );
  });

  it('adds no languages check when the project has no manifest', async () => {
    const root = await gitProject({ 'src/main.txt': 'hello\n' });
    const report = await runDoctor(root);

    assert.equal(
      report.checks.find((check) => check.name === 'languages'),
      undefined,
    );
  });
});
