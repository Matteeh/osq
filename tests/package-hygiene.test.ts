import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = path.dirname(fileURLToPath(import.meta.url));

const PROCESS_EXECUTION_CALLS = [
  'execFileAsync',
  'execFileSync',
  'execFile',
  'execSync',
  'spawnSync',
  'spawn',
  'exec',
  'run',
] as const;

const pnpmSpawnPattern = new RegExp(
  `\\b(?:${PROCESS_EXECUTION_CALLS.join('|')})\\s*\\(\\s*['"]pnpm['"]`,
  'g',
);

async function collectTestSources(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectTestSources(fullPath);
      }
      return /\.(?:ts|js)$/.test(entry.name) ? [fullPath] : [];
    }),
  );
  return nested.flat();
}

interface PackFile {
  path: string;
}

interface PackResult {
  files: PackFile[];
}

async function npmPackDryRun(): Promise<PackFile[]> {
  const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json'], {
    cwd: repoRoot,
    maxBuffer: 32 * 1024 * 1024,
  });
  const parsed = JSON.parse(stdout) as PackResult[];
  assert.equal(parsed.length, 1, 'expected exactly one packed tarball report');
  return parsed[0]?.files ?? [];
}

const isAllowedPath = (filePath: string): boolean =>
  filePath === 'README.md' ||
  filePath === 'LICENSE' ||
  filePath === 'package.json' ||
  filePath.startsWith('dist/') ||
  filePath.startsWith('templates/');

describe('package hygiene', () => {
  it('packs only distribution assets', async () => {
    const files = await npmPackDryRun();

    const unexpected = files
      .map((file) => file.path)
      .filter((filePath) => !isAllowedPath(filePath));
    assert.deepEqual(unexpected, [], `tarball contains unexpected files: ${unexpected.join(', ')}`);

    const paths = new Set(files.map((file) => file.path));
    assert.ok(paths.has('README.md'), 'tarball is missing README.md');
    assert.ok(paths.has('LICENSE'), 'tarball is missing LICENSE');
    assert.ok(paths.has('package.json'), 'tarball is missing package.json');
    assert.ok(
      [...paths].some((filePath) => filePath.startsWith('dist/')),
      'tarball is missing dist/ output',
    );
    assert.ok(
      [...paths].some((filePath) => filePath.startsWith('templates/')),
      'tarball is missing templates/',
    );
  });

  it('excludes source, tests, configs, workflows, and specs', async () => {
    const files = await npmPackDryRun();
    const paths = files.map((file) => file.path);

    const forbiddenPrefixes = ['src/', 'tests/', '.github/', 'specs/', 'fixture/'];
    for (const prefix of forbiddenPrefixes) {
      const leaked = paths.filter((filePath) => filePath.startsWith(prefix));
      assert.deepEqual(leaked, [], `tarball leaked files under ${prefix}: ${leaked.join(', ')}`);
    }

    const rootSources = paths.filter(
      (filePath) => filePath.endsWith('.ts') && !filePath.endsWith('.d.ts'),
    );
    assert.deepEqual(
      rootSources,
      [],
      `tarball leaked TypeScript sources: ${rootSources.join(', ')}`,
    );

    const forbiddenRootFiles = [
      'biome.json',
      'osq.config.ts',
      'tsconfig.json',
      'tsconfig.build.json',
      'pnpm-lock.yaml',
      'package-lock.json',
      'pnpm-workspace.yaml',
    ];
    for (const name of forbiddenRootFiles) {
      assert.equal(paths.includes(name), false, `tarball leaked root file ${name}`);
    }
  });

  it('declares required package metadata', async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8')) as {
      sideEffects?: boolean;
      keywords?: string[];
      packageManager?: string;
      files?: string[];
      scripts?: Record<string, string>;
    };

    assert.equal(manifest.sideEffects, false);
    assert.ok(
      Array.isArray(manifest.keywords) && manifest.keywords.length > 0,
      'keywords must be defined',
    );
    assert.match(
      manifest.packageManager ?? '',
      /^pnpm@\d+\./,
      'packageManager must pin a pnpm version',
    );
    assert.ok(manifest.files?.includes('dist'), 'files must include dist');
    assert.ok(manifest.files?.includes('templates'), 'files must include templates');
    assert.match(
      manifest.scripts?.prepublishOnly ?? '',
      /^npm run build$/,
      'prepublishOnly must build with npm run build',
    );
  });
});

describe('package manager independence', () => {
  it('never spawns pnpm from any test under tests/', async () => {
    const files = await collectTestSources(testsDir);
    const offenders: string[] = [];

    for (const file of files) {
      const source = await fs.readFile(file, 'utf8');
      for (const match of source.matchAll(pnpmSpawnPattern)) {
        const line = source.slice(0, match.index).split('\n').length;
        offenders.push(`${path.relative(repoRoot, file)}:${line}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `tests must not pass 'pnpm' as a spawn command: ${offenders.join(', ')}`,
    );
  });
});
