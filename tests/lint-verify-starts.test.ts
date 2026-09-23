import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { OPENSPEC_EXPECTED_VERSION, lintChangeFolder } from '../src/core/spec/linter.js';

const RECORD_FILE = 'openspec-invocations.json';

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

/**
 * Installs the same local fake validator `tests/linter.test.ts` uses, so these
 * cases exercise `lintChangeFolder` end to end without a network, TTY, or a real
 * OpenSpec install.
 */
async function installFakeOpenSpec(projectRoot: string): Promise<string> {
  const binDir = path.join(projectRoot, 'node_modules', '.bin');
  await fs.mkdir(binDir, { recursive: true });

  const recordPath = path.join(projectRoot, RECORD_FILE);
  const stdout = JSON.stringify({ valid: true, issues: [] });

  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const recordPath = ${JSON.stringify(recordPath)};
const args = process.argv.slice(2);
let records = [];
try { records = JSON.parse(fs.readFileSync(recordPath, 'utf8')); } catch {}
records.push({ args, telemetry: process.env.OPENSPEC_TELEMETRY, cwd: process.cwd() });
fs.writeFileSync(recordPath, JSON.stringify(records));
process.stdout.write(${JSON.stringify(stdout)});
process.exit(0);
`;
  await fs.writeFile(path.join(binDir, 'openspec'), script, { mode: 0o755 });

  const manifestDir = path.join(projectRoot, 'node_modules', '@fission-ai', 'openspec');
  await fs.mkdir(manifestDir, { recursive: true });
  await fs.writeFile(
    path.join(manifestDir, 'package.json'),
    JSON.stringify({ name: '@fission-ai/openspec', version: OPENSPEC_EXPECTED_VERSION }),
    'utf8',
  );

  return recordPath;
}

interface TaskSpec {
  readonly verify: string;
  readonly scope: readonly string[];
  readonly verifyStarts?: 'red' | 'green' | 'any';
}

async function writeChangeTask(
  changeFolder: string,
  taskNumber: string,
  spec: TaskSpec,
): Promise<void> {
  const scope = `[${spec.scope.join(', ')}]`;
  const lines = [
    '---',
    'title: Verify starts task',
    `verify: ${spec.verify}`,
    `scope: ${scope}`,
    'entry: []',
    'skills: []',
  ];
  if (spec.verifyStarts !== undefined) {
    lines.push(`verify_starts: ${spec.verifyStarts}`);
  }
  lines.push('---', '## Acceptance', '- [ ] passes');
  await fs.writeFile(
    path.join(changeFolder, 'tasks', `${taskNumber}.md`),
    `${lines.join('\n')}\n`,
    'utf8',
  );
}

async function writeProjectFile(projectRoot: string, relative: string): Promise<void> {
  const full = path.join(projectRoot, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, '// existing test\n', 'utf8');
}

describe('lint verify start warnings', () => {
  let tmpDir: string;
  let changeFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-lint-starts-'));
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');

    const change = await createNewSpec(tmpDir, 'Verify Starts Feature');
    changeFolder = change.folderPath;

    // Use the legacy spec.md change document so proposal-only checks (surface,
    // frontmatter verify) stay out of the way, exactly as `tests/linter.test.ts`
    // seeds its project. Replace the template sentinel with a local verifier.
    const proposalPath = path.join(changeFolder, 'proposal.md');
    const specPath = path.join(changeFolder, 'spec.md');
    const seeded = await fs.readFile(proposalPath, 'utf8');
    await fs.writeFile(
      specPath,
      seeded.replace(/^verify:[^\n]*$/m, `verify: ${PASSING_VERIFY}`),
      'utf8',
    );
    await fs.rm(proposalPath, { force: true });

    await installFakeOpenSpec(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  for (const start of ['any', 'green'] as const) {
    it(`warns when a 066-shaped task declares ${start}`, async () => {
      await writeProjectFile(tmpDir, 'tests/existing.test.ts');
      await writeChangeTask(changeFolder, '1', {
        verify: 'node --import tsx --test tests/existing.test.ts tests/new.test.ts',
        scope: ['tests/new.test.ts'],
        verifyStarts: start,
      });

      const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

      assert.ok(
        result.warnings.some(
          (w) => w.includes(`declares verify_starts: ${start}`) && w.includes('tests/new.test.ts'),
        ),
        result.warnings.join('\n'),
      );
      assert.equal(
        result.warnings.some((w) => w.includes('no task in the change can create')),
        false,
        result.warnings.join('\n'),
      );
    });
  }

  it('emits no contradiction warning when the same task declares red', async () => {
    await writeProjectFile(tmpDir, 'tests/existing.test.ts');
    await writeChangeTask(changeFolder, '1', {
      verify: 'node --import tsx --test tests/existing.test.ts tests/new.test.ts',
      scope: ['tests/new.test.ts'],
      verifyStarts: 'red',
    });

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(
      result.warnings.some((w) => w.includes('declares verify_starts')),
      false,
      result.warnings.join('\n'),
    );
  });

  it('emits neither warning when an earlier task scope covers the path', async () => {
    await writeChangeTask(changeFolder, '1', {
      verify: 'node --test tests/shared.test.ts',
      scope: ['tests/shared.test.ts'],
      verifyStarts: 'red',
    });
    await writeChangeTask(changeFolder, '2', {
      verify: 'node --test tests/shared.test.ts',
      scope: ['tests/other.test.ts'],
      verifyStarts: 'any',
    });

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(
      result.warnings.some(
        (w) =>
          w.includes('declares verify_starts') || w.includes('no task in the change can create'),
      ),
      false,
      result.warnings.join('\n'),
    );
  });

  it('warns when no task scope can create a named path', async () => {
    await writeChangeTask(changeFolder, '1', {
      verify: 'node --test tests/ghost.test.ts',
      scope: [],
      verifyStarts: 'red',
    });

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.ok(
      result.warnings.some(
        (w) => w.includes('no task in the change can create') && w.includes('tests/ghost.test.ts'),
      ),
      result.warnings.join('\n'),
    );
  });

  it('emits no unresolved-target warning for a task naming only its own new test', async () => {
    await writeChangeTask(changeFolder, '1', {
      verify: 'node --import tsx --test tests/solo.test.ts',
      scope: ['tests/solo.test.ts'],
      verifyStarts: 'red',
    });

    const result = await lintChangeFolder(tmpDir, changeFolder, DEFAULT_CONFIG);

    assert.equal(
      result.warnings.some((w) => w.includes('names neither')),
      false,
      result.warnings.join('\n'),
    );
  });
});
