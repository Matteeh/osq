import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { languageMap, readLanguageMap } from '../src/kernel/languages/language-map.js';
import { uncoveredBy } from '../src/kernel/languages/presets.js';

const execFileAsync = promisify(execFile);

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** The test's own git calls ignore redirecting variables, like osq's reads. */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
    Reflect.deleteProperty(env, key);
  }
  return env;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
  return stdout.trim();
}

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }
}

/** A committed git repository holding `files`, with optional `.gitignore`. */
async function makeRepo(files: Record<string, string>, gitignore?: string): Promise<string> {
  const dir = await makeTempDir('osq-languages-map-');
  await writeFiles(dir, files);
  if (gitignore !== undefined) {
    await fs.writeFile(path.join(dir, '.gitignore'), gitignore, 'utf8');
  }
  await git(['init', '-q', '-b', 'main'], dir);
  await git(['config', 'user.name', 'osq'], dir);
  await git(['config', 'user.email', 'osq@example.invalid'], dir);
  await git(['add', '-A'], dir);
  await git(['commit', '-qm', 'seed'], dir);
  return dir;
}

/** A plain temporary folder outside any repository. */
async function makePlainDir(files: Record<string, string>): Promise<string> {
  const dir = await makeTempDir('osq-languages-nogit-');
  await writeFiles(dir, files);
  return dir;
}

describe('uncoveredBy', () => {
  it('returns the gates and extras a language lacks', () => {
    assert.deepEqual(uncoveredBy('Rust'), {
      gates: ['test-modification gate', 'denied-dependency gate'],
      extras: [
        'verify-command lint',
        'test output reading',
        'import graph',
        'traceability',
        'function ranges',
        'repository measures',
      ],
    });
    assert.deepEqual(uncoveredBy('TypeScript/JavaScript'), { gates: [], extras: [] });
  });
});

describe('languageMap', () => {
  it('answers each path from its nearest manifest', () => {
    const map = languageMap(['package.json', 'crates/core/Cargo.toml', 'crates/core/notes.md']);
    assert.deepEqual(map.languages, ['TypeScript/JavaScript', 'Rust']);
    const rows: readonly (readonly [string, string | null])[] = [
      ['src/index.ts', 'TypeScript/JavaScript'],
      ['pnpm-lock.yaml', 'TypeScript/JavaScript'],
      ['crates/core/src/lib.rs', 'Rust'],
      ['crates/core/Cargo.lock', 'Rust'],
      ['crates/core/notes.md', null],
      ['crates/core/build.ts', null],
      ['tools/x.rs', null],
    ];
    for (const [filePath, expected] of rows) {
      assert.equal(map.languageOf(filePath), expected, filePath);
    }
  });

  it('has no language without a manifest', () => {
    const map = languageMap(['src/main.rs', 'notes.txt']);
    assert.deepEqual(map.languages, []);
    assert.equal(map.languageOf('src/main.rs'), null);
  });
});

interface Row {
  readonly git: boolean;
  readonly files: Record<string, string>;
  readonly gitignore?: string;
  readonly languages: readonly string[];
}

const ROWS: readonly Row[] = [
  {
    git: true,
    files: { 'package.json': '{}\n' },
    languages: ['TypeScript/JavaScript'],
  },
  {
    git: true,
    files: { 'package.json': '{}\n', 'crates/core/Cargo.toml': '[package]\n' },
    languages: ['TypeScript/JavaScript', 'Rust'],
  },
  {
    git: true,
    files: { 'go.mod': 'module x\n', 'tools/pyproject.toml': '[project]\n' },
    languages: ['Python', 'Go'],
  },
  {
    git: true,
    gitignore: 'vendor/\n',
    files: { 'package.json': '{}\n', 'vendor/Cargo.toml': '[package]\n' },
    languages: ['TypeScript/JavaScript'],
  },
  {
    git: false,
    files: { 'Cargo.toml': '[package]\n' },
    languages: ['Rust'],
  },
  {
    git: false,
    files: {},
    languages: [],
  },
];

describe('readLanguageMap', () => {
  it('reads languages from the manifests a project holds', async () => {
    for (const row of ROWS) {
      const dir = row.git
        ? await makeRepo(row.files, row.gitignore)
        : await makePlainDir(row.files);
      const map = await readLanguageMap(dir, DEFAULT_CONFIG);
      assert.deepEqual(map.languages, row.languages, JSON.stringify(row.files));
    }
  });
});
