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

// Build commands are assembled from fragments so this scanner's own source does
// not contain the literal argument shapes it looks for.
const STAGE_UI_SCRIPT = `${['stage', 'ui'].join('-')}.mjs`;

const buildSpawnPatterns: readonly RegExp[] = [
  new RegExp(
    `\\b(?:${PROCESS_EXECUTION_CALLS.join('|')})\\s*\\([^);]*['"]run['"]\\s*,\\s*['"]build['"]`,
    'g',
  ),
  new RegExp(
    `\\b(?:${PROCESS_EXECUTION_CALLS.join('|')})\\s*\\([^);]*['"]vite['"][^);]*['"]build['"]`,
    'g',
  ),
  new RegExp(
    `\\b(?:${PROCESS_EXECUTION_CALLS.join('|')})\\s*\\([^);]*${STAGE_UI_SCRIPT.replace(/\./g, '\\.')}`,
    'g',
  ),
];

async function collectTestSources(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectTestSources(fullPath);
      }
      return /\.(?:ts|tsx|js)$/.test(entry.name) ? [fullPath] : [];
    }),
  );
  return nested.flat();
}

/** Names every test-source line where any pattern matches. */
async function collectSpawnOffenders(patterns: readonly RegExp[]): Promise<string[]> {
  const files = await collectTestSources(testsDir);
  const offenders: string[] = [];

  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split('\n').length;
        offenders.push(`${path.relative(repoRoot, file)}:${line}`);
      }
    }
  }

  return offenders;
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
  filePath.startsWith('templates/') ||
  filePath.startsWith('ui/dist/');

/** The exact runtime dependency set the published CLI is permitted to ship. */
const PERMITTED_RUNTIME_DEPENDENCIES = ['chokidar', 'commander', 'jiti', 'yaml'];

/** Frontend packages that must stay private-workspace build dependencies. */
const PRIVATE_BUILD_DEPENDENCIES = [
  'react',
  'react-dom',
  '@types/react',
  '@types/react-dom',
  'vite',
];

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

    assert.ok(paths.has('ui/dist/index.html'), 'tarball is missing ui/dist/index.html');
    const uiAssets = [...paths].filter((filePath) => filePath.startsWith('ui/dist/assets/'));
    assert.ok(
      uiAssets.some((filePath) => /-[A-Za-z0-9_]{8,}\.(?:js|css)$/.test(filePath)),
      `tarball is missing a fingerprinted UI asset: ${uiAssets.join(', ')}`,
    );
  });

  it('excludes source, tests, configs, workflows, and specs', async () => {
    const files = await npmPackDryRun();
    const paths = files.map((file) => file.path);

    const forbiddenPrefixes = ['src/', 'tests/', '.github/', 'specs/', 'fixture/', 'packages/'];
    for (const prefix of forbiddenPrefixes) {
      const leaked = paths.filter((filePath) => filePath.startsWith(prefix));
      assert.deepEqual(leaked, [], `tarball leaked files under ${prefix}: ${leaked.join(', ')}`);
    }

    const strayUi = paths.filter(
      (filePath) => filePath.startsWith('ui/') && !filePath.startsWith('ui/dist/'),
    );
    assert.deepEqual(
      strayUi,
      [],
      `tarball leaked unstaged UI source or workspace paths: ${strayUi.join(', ')}`,
    );

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
    assert.ok(manifest.files?.includes('ui'), 'files must include the staged ui directory');
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

  it('never runs a build command from any test under tests/', async () => {
    const offenders = await collectSpawnOffenders(buildSpawnPatterns);

    assert.deepEqual(offenders, [], `tests must not run a build command: ${offenders.join(', ')}`);
  });
});

describe('runtime dependency boundary', () => {
  it('keeps frontend tooling in the private workspace, out of installed runtime dependencies', async () => {
    const root = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const ui = JSON.parse(
      await fs.readFile(path.join(repoRoot, 'packages', 'ui', 'package.json'), 'utf8'),
    ) as {
      private?: boolean;
      devDependencies?: Record<string, string>;
    };

    assert.deepEqual(
      Object.keys(root.dependencies ?? {}).sort(),
      [...PERMITTED_RUNTIME_DEPENDENCIES].sort(),
      'published runtime dependency set must stay within its permitted categories',
    );

    assert.equal(ui.private, true, 'the UI workspace must remain private');
    for (const name of PRIVATE_BUILD_DEPENDENCIES) {
      assert.equal(
        root.dependencies?.[name],
        undefined,
        `${name} must not be a runtime dependency`,
      );
      assert.equal(
        root.devDependencies?.[name],
        undefined,
        `${name} must not be a root dependency`,
      );
      assert.ok(ui.devDependencies?.[name], `${name} must be a private workspace devDependency`);
    }
  });
});

describe('node baseline', () => {
  it('aligns package metadata, CI, and guidance on Node 24 LTS', async () => {
    const root = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8')) as {
      engines?: { node?: string };
      devDependencies?: Record<string, string>;
    };
    const ui = JSON.parse(
      await fs.readFile(path.join(repoRoot, 'packages', 'ui', 'package.json'), 'utf8'),
    ) as { engines?: { node?: string } };

    assert.equal(root.engines?.node, '>=24.0.0', 'root package must require Node 24');
    assert.match(
      root.devDependencies?.['@types/node'] ?? '',
      /^\^?24\./,
      'root Node type declarations must track the maintained 24.x line',
    );
    assert.equal(ui.engines?.node, '>=24.0.0', 'the UI workspace must require Node 24');

    for (const workflow of ['ci.yml', 'release.yml']) {
      const text = await fs.readFile(path.join(repoRoot, '.github', 'workflows', workflow), 'utf8');
      assert.match(
        text,
        /node-version:\s*24\b/,
        `${workflow} must select the maintained Node 24 line`,
      );
      assert.doesNotMatch(text, /node-version:\s*22\b/, `${workflow} must not retain Node 22`);
    }

    const readme = await fs.readFile(path.join(repoRoot, 'README.md'), 'utf8');
    assert.match(readme, /Node(?:\.js)? 24 LTS/, 'README must name the Node 24 LTS baseline');
  });
});
