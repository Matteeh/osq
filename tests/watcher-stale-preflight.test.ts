import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const BUILD_MODULE_URL = new URL('../src/watcher/build.ts', import.meta.url).href;

const STALE_SRC_TIME = new Date('2024-01-02T00:00:00Z');
const STALE_DIST_TIME = new Date('2024-01-01T00:00:00Z');
const FRESH_DIST_TIME = new Date('2024-01-03T00:00:00Z');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface LayoutOptions {
  withSrc?: boolean;
  withDist?: boolean;
  distNewer?: boolean;
}

/**
 * Stale build detection runs as a preflight in the watcher process, so the
 * observable contract is the process outcome: exit code and stderr. Every case
 * is exercised in a child process against a mocked package layout, which keeps
 * the real checkout's own `src/`/`dist/` mtimes out of the assertion.
 */
describe('Watcher stale build preflight', () => {
  let tmpDir: string;
  let scriptPath: string;
  let packageRoot: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-stale-preflight-'));
    scriptPath = path.join(tmpDir, 'check-stale.mjs');
    packageRoot = path.join(tmpDir, 'package');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function makeLayout(options: LayoutOptions): Promise<void> {
    await fs.mkdir(packageRoot, { recursive: true });

    if (options.withDist) {
      const distDir = path.join(packageRoot, 'dist');
      await fs.mkdir(distDir, { recursive: true });
      const distFile = path.join(distDir, 'index.js');
      await fs.writeFile(distFile, 'compiled', 'utf8');
      const distTime = options.distNewer ? FRESH_DIST_TIME : STALE_DIST_TIME;
      await fs.utimes(distFile, distTime, distTime);
    }

    if (options.withSrc) {
      const srcDir = path.join(packageRoot, 'src');
      await fs.mkdir(srcDir, { recursive: true });
      const srcFile = path.join(srcDir, 'index.ts');
      await fs.writeFile(srcFile, 'source', 'utf8');
      await fs.utimes(srcFile, STALE_SRC_TIME, STALE_SRC_TIME);
    }
  }

  async function writeScript(allowStale: boolean): Promise<void> {
    const script = [
      `import { checkStaleBuild } from ${JSON.stringify(BUILD_MODULE_URL)};`,
      `await checkStaleBuild({ packageRoot: ${JSON.stringify(packageRoot)}, allowStale: ${allowStale} });`,
      '',
    ].join('\n');
    await fs.writeFile(scriptPath, script, 'utf8');
  }

  async function runPreflight(): Promise<RunResult> {
    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        ['--import', 'tsx', scriptPath],
        { cwd: process.cwd() },
      );
      return { code: 0, stdout, stderr };
    } catch (err: unknown) {
      const execErr = err as { code?: number; stdout?: string; stderr?: string };
      return {
        code: typeof execErr.code === 'number' ? execErr.code : 1,
        stdout: execErr.stdout ?? '',
        stderr: execErr.stderr ?? '',
      };
    }
  }

  it('exits with code 1 and exactly one stderr line when src/ is newer than dist/', async () => {
    await makeLayout({ withSrc: true, withDist: true });
    await writeScript(false);

    const result = await runPreflight();

    assert.equal(result.code, 1, 'stale checkout must exit with code 1');
    assert.equal(result.stdout.trim(), '', 'stale preflight must not write to stdout');
    const lines = result.stderr.trim().split('\n');
    assert.equal(lines.length, 1, 'stale preflight must print exactly one line');
    assert.match(lines[0], /osq build is stale/);
    assert.match(lines[0], /src\/ is newer than dist\//);
    assert.match(lines[0], /--allow-stale/);
  });

  it('exits with code 1 when a checkout has src/ but no dist/', async () => {
    await makeLayout({ withSrc: true, withDist: false });
    await writeScript(false);

    const result = await runPreflight();

    assert.equal(result.code, 1, 'a checkout with no compiled output must exit with code 1');
    const lines = result.stderr.trim().split('\n');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /osq build is stale/);
  });

  it('continues when allowStale is true even with a stale layout', async () => {
    await makeLayout({ withSrc: true, withDist: true });
    await writeScript(true);

    const result = await runPreflight();

    assert.equal(result.code, 0, '--allow-stale must bypass the stale preflight');
    assert.equal(result.stderr.trim(), '');
  });

  it('continues for an installed package with no src/ directory', async () => {
    await makeLayout({ withSrc: false, withDist: true });
    await writeScript(false);

    const result = await runPreflight();

    assert.equal(result.code, 0, 'an installed package has no checkout to be stale');
    assert.equal(result.stderr.trim(), '');
  });

  it('continues when dist/ is newer than src/', async () => {
    await makeLayout({ withSrc: true, withDist: true, distNewer: true });
    await writeScript(false);

    const result = await runPreflight();

    assert.equal(result.code, 0, 'a freshly built dist must pass the preflight');
    assert.equal(result.stderr.trim(), '');
  });
});
