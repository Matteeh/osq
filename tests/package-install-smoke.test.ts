import assert from 'node:assert/strict';
import { type ChildProcess, execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Set OSQ_SKIP_PACK_TEST=1 (or true) to keep fast local test cycles quick.
const skipPackTest =
  process.env.OSQ_SKIP_PACK_TEST === '1' || process.env.OSQ_SKIP_PACK_TEST === 'true';

// Test-only escape hatch used by smoke-error-reporting.test.ts to force the
// consumer install to target a tarball that does not exist.
const tarballOverride = process.env.OSQ_SMOKE_TARBALL ?? '';

/**
 * The guarantee this test makes is: the package under test comes from the freshly
 * packed local tarball, its dependencies come from wherever pnpm normally gets them.
 */
const smokeEnv: NodeJS.ProcessEnv = {
  ...process.env,
  npm_config_audit: 'false',
  npm_config_fund: 'false',
  NO_COLOR: '1',
};

interface PackReport {
  filename: string;
}

async function run(command: string, args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd,
      env: smokeEnv,
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const failure = error as { stderr?: string; message?: string };
    throw new Error(
      `Command failed: ${command} ${args.join(' ')} (cwd: ${cwd})\n${
        failure.stderr || failure.message || String(error)
      }`,
    );
  }
}

async function exists(filePath: string): Promise<boolean> {
  return fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
}

/** Wait for `osq serve` to print its one loopback URL, under a hard timeout. */
function waitForServeUrl(child: ChildProcess, timeoutMs = 20000): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      finish(new Error(`serve did not report a URL within ${timeoutMs}ms; stdout: ${buffer}`));
    }, timeoutMs);
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const match = buffer.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) finish(null, match[0]);
    };
    const onExit = (code: number | null) => {
      finish(new Error(`serve exited with code ${code} before reporting a URL; stdout: ${buffer}`));
    };
    const finish = (error: Error | null, url?: string) => {
      clearTimeout(timer);
      child.stdout?.off('data', onData);
      child.off('exit', onExit);
      if (error) reject(error);
      else resolve(url ?? '');
    };
    child.stdout?.on('data', onData);
    child.once('exit', onExit);
  });
}

/** Send SIGTERM and resolve the exit code, rejecting if it does not exit promptly. */
function stopServe(child: ChildProcess, timeoutMs = 10000): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`serve did not exit within ${timeoutMs}ms after SIGTERM`)),
      timeoutMs,
    );
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    child.kill('SIGTERM');
  });
}

describe('packed tarball consumer smoke test', { skip: skipPackTest }, () => {
  let workDir = '';
  let consumerDir = '';
  let tarballPath = '';
  let setupComplete = false;

  after(async () => {
    if (workDir) {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  });

  it('packs and installs the local tarball into an isolated temporary project', async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-pack-smoke-'));
    consumerDir = path.join(workDir, 'consumer');
    await fs.mkdir(consumerDir, { recursive: true });

    if (tarballOverride) {
      tarballPath = tarballOverride;
    } else {
      // `pnpm verify` builds before running tests; pack that verified output.
      for (const relative of ['dist/cli/bin.js', 'ui/dist/index.html']) {
        assert.ok(
          await exists(path.join(repoRoot, relative)),
          `${relative} is missing; run pnpm build before verifying`,
        );
      }
      const packStdout = await run(
        'npm',
        ['pack', '--json', '--pack-destination', workDir],
        repoRoot,
      );
      const reports = JSON.parse(packStdout) as PackReport[];
      assert.equal(reports.length, 1, 'expected exactly one packed tarball');
      tarballPath = path.join(workDir, reports[0]?.filename ?? '');
      assert.ok(await exists(tarballPath), `tarball was not produced at ${tarballPath}`);
    }

    // A clean, isolated consumer project with a minimal package.json.
    await run('npm', ['init', '-y'], consumerDir);
    // Install the local tarball, using the package manager cache when populated
    // and the network only to fill gaps.
    await run('npm', ['install', tarballPath, '--prefer-offline'], consumerDir);

    setupComplete = true;

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
    assert.ok(setupComplete, 'Smoke test setup did not complete');
    await run('npx', ['osq', 'init'], consumerDir);

    const expectedDirs = [
      'openspec',
      path.join('openspec', 'schemas'),
      path.join('openspec', 'schemas', 'osq'),
      path.join('openspec', 'schemas', 'osq', 'templates'),
      path.join('openspec', 'specs'),
      path.join('openspec', 'changes'),
      path.join('openspec', 'changes', 'archive'),
    ];
    for (const dir of expectedDirs) {
      assert.ok(await exists(path.join(consumerDir, dir)), `missing scaffolded directory ${dir}`);
    }

    const expectedFiles = [
      'osq.config.ts',
      '.env.example',
      'AGENTS.md',
      path.join('openspec', 'config.yaml'),
      path.join('openspec', 'schemas', 'osq', 'schema.yaml'),
      path.join('openspec', 'schemas', 'osq', 'README.md'),
      path.join('openspec', 'schemas', 'osq', 'templates', 'proposal.md'),
      path.join('openspec', 'schemas', 'osq', 'templates', 'spec.md'),
      path.join('openspec', 'schemas', 'osq', 'templates', 'tasks.md'),
    ];
    for (const file of expectedFiles) {
      assert.ok(await exists(path.join(consumerDir, file)), `missing scaffolded file ${file}`);
    }

    const agents = await fs.readFile(path.join(consumerDir, 'AGENTS.md'), 'utf8');
    assert.match(agents, /<!-- OSQ:START -->/);
    assert.match(agents, /<!-- OSQ:END -->/);
  });

  it('npx osq new smoke creates a valid change specification', async () => {
    assert.ok(setupComplete, 'Smoke test setup did not complete');
    await run('npx', ['osq', 'new', 'smoke'], consumerDir);

    const specDir = path.join(consumerDir, 'openspec', 'changes', '001-smoke');
    assert.ok(await exists(specDir), 'expected numbered spec folder openspec/changes/001-smoke');

    for (const file of ['proposal.md', 'tasks.md', path.join('tasks', '1.md')]) {
      assert.ok(await exists(path.join(specDir, file)), `missing scaffolded file ${file}`);
    }

    const specMd = await fs.readFile(path.join(specDir, 'proposal.md'), 'utf8');
    assert.match(specMd, /^title: smoke$/m, 'proposal.md must carry the requested title');
  });

  it('serves the packaged dashboard on an ephemeral loopback port and shuts down cleanly', async () => {
    assert.ok(setupComplete, 'Smoke test setup did not complete');

    const installedPackage = path.join(consumerDir, 'node_modules', '@matteeh', 'osq');
    const installedManifest = JSON.parse(
      await fs.readFile(path.join(installedPackage, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    for (const name of ['react', 'react-dom', '@types/react', '@types/react-dom', 'vite']) {
      assert.equal(
        installedManifest.dependencies?.[name],
        undefined,
        `${name} must not appear in the installed runtime dependencies`,
      );
    }
    assert.ok(
      await exists(path.join(installedPackage, 'ui', 'dist', 'index.html')),
      'installed package must ship ui/dist/index.html',
    );

    const executable = path.join(installedPackage, 'dist', 'cli', 'bin.js');
    const child = spawn(process.execPath, [executable, 'serve', '--port', '0'], {
      cwd: consumerDir,
      env: smokeEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
      const url = await waitForServeUrl(child);
      const parsed = new URL(url);
      assert.equal(parsed.hostname, '127.0.0.1', 'serve must bind loopback only');
      assert.notEqual(parsed.port, '', 'serve must report its bound port');

      const index = await fetch(url);
      assert.equal(index.status, 200, 'packaged index must respond 200');
      assert.match(
        index.headers.get('content-type') ?? '',
        /text\/html/,
        'packaged index must be served as HTML',
      );
      const html = await index.text();
      const assetPath = html.match(/src="((?:\.\/|\/)?assets\/[^"]+)"/)?.[1];
      assert.ok(assetPath, 'packaged index must reference a fingerprinted asset');

      const asset = await fetch(new URL(assetPath, url));
      assert.equal(asset.status, 200, 'packaged asset must respond 200');
      assert.match(
        asset.headers.get('content-type') ?? '',
        /javascript/,
        'packaged asset must be served with a script content type',
      );
      assert.ok((await asset.text()).length > 0, 'packaged asset must not be empty');

      const exitCode = await stopServe(child);
      assert.equal(exitCode, 0, 'serve must exit cleanly after SIGTERM');
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  });
});
