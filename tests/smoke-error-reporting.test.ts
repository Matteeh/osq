import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let missingDir = '';

// Keep this suite opt-outable in the same way the pack smoke test is.
const skipPackTest =
  process.env.OSQ_SKIP_PACK_TEST === '1' || process.env.OSQ_SKIP_PACK_TEST === 'true';

interface SpawnOutput {
  stdout?: string;
  stderr?: string;
}

describe('smoke test error reporting', { skip: skipPackTest }, () => {
  after(async () => {
    if (missingDir) {
      await fs.rm(missingDir, { recursive: true, force: true });
    }
  });

  it('reports a failed test naming the command and zero cancelledByParent when setup fails', async () => {
    missingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-smoke-missing-'));
    const missingTarball = path.join(missingDir, 'does-not-exist.tgz');

    const child = await runSmokeTest(missingTarball);
    const output = `${child.stdout ?? ''}\n${child.stderr ?? ''}`;

    assert.match(output, /not ok/, 'the failed setup must be reported as a failed test');
    assert.match(
      output,
      /Command failed: npm install/,
      'the failure must name the failing command and its arguments',
    );
    assert.ok(
      output.includes(missingTarball),
      'the failure must include the tarball argument that was passed',
    );
    assert.match(
      output,
      /\(cwd: .*osq-pack-smoke-.*\/consumer\)/,
      'the failure must include the working directory the command ran in',
    );
    assert.match(output, /# cancelled 0/, 'a failed setup must not cancel sibling subtests');
    assert.doesNotMatch(
      output,
      /cancelledByParent/,
      'no subtest may be reported as cancelled by its parent',
    );
  });
});

async function runSmokeTest(missingTarball: string): Promise<SpawnOutput> {
  // NODE_TEST_CONTEXT is set by the parent test runner; leaving it in place makes
  // the child runner refuse to run files ("called recursively within a test file").
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT'),
  );
  env.OSQ_SMOKE_TARBALL = missingTarball;
  env.OSQ_SKIP_PACK_TEST = '0';

  try {
    return await execFileAsync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--test',
        '--test-reporter=tap',
        path.join('tests', 'package-install-smoke.test.ts'),
      ],
      {
        cwd: repoRoot,
        env,
        maxBuffer: 32 * 1024 * 1024,
      },
    );
  } catch (error) {
    return error as SpawnOutput;
  }
}
