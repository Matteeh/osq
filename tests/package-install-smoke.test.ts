import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Set OSQ_SKIP_PACK_TEST=1 (or true) to keep fast local test cycles quick.
const skipPackTest =
  process.env.OSQ_SKIP_PACK_TEST === '1' || process.env.OSQ_SKIP_PACK_TEST === 'true';

/**
 * Every command runs with the network disabled. The dependency tree is served
 * from the local pnpm store (`--offline`), so the smoke test never talks to a
 * registry and never depends on the `osq` name resolving remotely.
 */
const offlineEnv: NodeJS.ProcessEnv = {
  ...process.env,
  npm_config_offline: 'true',
  npm_config_registry: 'http://127.0.0.1:1/',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
  NO_COLOR: '1',
};

interface PackReport {
  filename: string;
}

async function run(command: string, args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(command, args, {
    cwd,
    env: offlineEnv,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

async function exists(filePath: string): Promise<boolean> {
  return fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
}

describe('packed tarball consumer smoke test', { skip: skipPackTest }, () => {
  let workDir = '';
  let consumerDir = '';
  let tarballPath = '';

  before(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-pack-smoke-'));
    consumerDir = path.join(workDir, 'consumer');
    await fs.mkdir(consumerDir, { recursive: true });

    // Build fresh output, then pack the local tarball into the temp workspace.
    await run('pnpm', ['build'], repoRoot);
    const packStdout = await run(
      'npm',
      ['pack', '--json', '--pack-destination', workDir],
      repoRoot,
    );
    const reports = JSON.parse(packStdout) as PackReport[];
    assert.equal(reports.length, 1, 'expected exactly one packed tarball');
    tarballPath = path.join(workDir, reports[0]?.filename ?? '');
    assert.ok(await exists(tarballPath), `tarball was not produced at ${tarballPath}`);

    // A clean, isolated consumer project with a minimal package.json.
    await run('npm', ['init', '-y'], consumerDir);
    // Install the local tarball entirely offline from the local pnpm store.
    await run('pnpm', ['add', tarballPath, '--offline'], consumerDir);
  });

  after(async () => {
    if (workDir) {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  });

  it('installs the packed tarball into an isolated temporary project offline', async () => {
    assert.ok(
      path.resolve(tarballPath).startsWith(path.resolve(os.tmpdir())),
      'tarball must be created under os.tmpdir()',
    );
    assert.ok(tarballPath.endsWith('.tgz'), 'packed artifact must be a .tgz tarball');

    const installedManifest = JSON.parse(
      await fs.readFile(
        path.join(consumerDir, 'node_modules', '@matteeh', 'osq', 'package.json'),
        'utf8',
      ),
    ) as { name?: string };
    assert.equal(
      installedManifest.name,
      '@matteeh/osq',
      '@matteeh/osq must be installed in the consumer project',
    );
    assert.ok(
      await exists(path.join(consumerDir, 'node_modules', '.bin', 'osq')),
      'osq executable must be linked into the consumer project',
    );
    assert.equal(
      await exists(
        path.join(consumerDir, 'node_modules', '@matteeh', 'osq', 'dist', 'cli', 'bin.js'),
      ),
      true,
      'installed package must contain compiled CLI output',
    );
  });

  it('npx osq init scaffolds configuration, template directories, and AGENTS.md', async () => {
    await run('npx', ['osq', 'init'], consumerDir);

    const expectedDirs = [
      'specs',
      'specs/_template',
      'specs/_template/tasks',
      'specs/archive',
      'features',
      'decisions',
    ];
    for (const dir of expectedDirs) {
      assert.ok(await exists(path.join(consumerDir, dir)), `missing scaffolded directory ${dir}`);
    }

    const expectedFiles = [
      'osq.config.ts',
      '.env.example',
      'AGENTS.md',
      'specs/_template/spec.md',
      'specs/_template/tasks.md',
      'specs/_template/tasks/1.md',
    ];
    for (const file of expectedFiles) {
      assert.ok(await exists(path.join(consumerDir, file)), `missing scaffolded file ${file}`);
    }

    const agents = await fs.readFile(path.join(consumerDir, 'AGENTS.md'), 'utf8');
    assert.match(agents, /<!-- OSQ:START -->/);
    assert.match(agents, /<!-- OSQ:END -->/);
  });

  it('npx osq new smoke creates a valid change specification', async () => {
    await run('npx', ['osq', 'new', 'smoke'], consumerDir);

    const specDir = path.join(consumerDir, 'specs', '001-smoke');
    assert.ok(await exists(specDir), 'expected numbered spec folder specs/001-smoke');

    for (const file of ['spec.md', 'tasks.md', path.join('tasks', '1.md')]) {
      assert.ok(await exists(path.join(specDir, file)), `missing scaffolded file ${file}`);
    }

    const specMd = await fs.readFile(path.join(specDir, 'spec.md'), 'utf8');
    assert.match(specMd, /^title: smoke$/m, 'spec.md must carry the requested title');
  });
});
