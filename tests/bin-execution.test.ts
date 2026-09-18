import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { resolvePackageVersion } from '../src/cli/index.js';

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binPath = path.join(repoRoot, 'dist', 'cli', 'bin.js');
const typesPath = path.join(repoRoot, 'dist', 'index.d.ts');
const manifestPath = path.join(repoRoot, 'package.json');

const SHEBANG = '#!/usr/bin/env node';

async function readManifestVersion(): Promise<string> {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as { version?: string };
  assert.ok(manifest.version, 'package.json must declare a version');
  return manifest.version;
}

async function runBin(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(process.execPath, [binPath, ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: '1' },
  });
  return stdout;
}

describe('built bin execution', () => {
  before(async () => {
    await execFileAsync('pnpm', ['build'], { cwd: repoRoot });
  });

  it('preserves the executable shebang after compilation', async () => {
    const contents = await fs.readFile(binPath, 'utf8');
    assert.ok(
      contents.startsWith(`${SHEBANG}\n`),
      `dist/cli/bin.js must start with ${SHEBANG}, got: ${contents.slice(0, 40)}`,
    );
  });

  it('generates valid programmatic type declarations', async () => {
    const stats = await fs.stat(typesPath);
    assert.ok(stats.isFile(), 'dist/index.d.ts must be a file');

    const contents = await fs.readFile(typesPath, 'utf8');
    assert.ok(contents.trim().length > 0, 'dist/index.d.ts must not be empty');
    assert.match(contents, /\bexport\b/, 'dist/index.d.ts must declare programmatic exports');
    assert.match(
      contents,
      /defineConfig|OsqConfig/,
      'dist/index.d.ts must expose configuration helpers and types',
    );
  });

  it('resolves the package version from package.json at runtime', async () => {
    const version = await readManifestVersion();
    assert.equal(resolvePackageVersion(), version);

    const program = (await import('../src/cli/index.js')).createProgram();
    assert.equal(program.version(), version);
  });

  it('prints the package.json version when invoked directly from an isolated directory', async () => {
    const version = await readManifestVersion();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-bin-version-'));

    try {
      const stdout = await runBin(['--version'], tmpDir);
      assert.equal(stdout.trim(), version);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('prints help with command listings from an isolated directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-bin-help-'));

    try {
      const stdout = await runBin(['--help'], tmpDir);
      assert.match(stdout, /Usage: osq/);
      assert.match(stdout, /--version/);
      for (const command of [
        'init',
        'new',
        'approve',
        'watch',
        'setup',
        'status',
        'show',
        'report',
      ]) {
        assert.match(stdout, new RegExp(`\\b${command}\\b`), `help must list ${command}`);
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
