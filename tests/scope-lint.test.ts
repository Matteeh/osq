import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { lintCommand } from '../src/cli/lint.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import {
  type LintLogger,
  OPENSPEC_EXPECTED_VERSION,
  lintChangeFolder,
} from '../src/core/linter.js';
import { createNewSpec } from '../src/core/new.js';

const RECORD_FILE = 'openspec-invocations.json';

interface RecordingLogger extends LintLogger {
  readonly entries: Array<{ level: 'info' | 'verbose' | 'warn' | 'error'; message: string }>;
  error(message: string): void;
}

function createRecordingLogger(): RecordingLogger {
  const entries: RecordingLogger['entries'] = [];
  return {
    entries,
    info: (message) => entries.push({ level: 'info', message }),
    verbose: (message) => entries.push({ level: 'verbose', message }),
    warn: (message) => entries.push({ level: 'warn', message }),
    error: (message) => entries.push({ level: 'error', message }),
  };
}

/**
 * Installs the same local fake validator used by `tests/linter.test.ts` so
 * these cases exercise `lintChangeFolder` end to end without a network, TTY, or
 * real OpenSpec install.
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

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

async function writeProjectFile(projectRoot: string, relative: string): Promise<void> {
  const full = path.join(projectRoot, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, '// fixture\n', 'utf8');
}

async function writeTask(
  specFolder: string,
  taskNumber: string,
  scope: readonly string[],
  testsModify?: boolean,
): Promise<void> {
  const scopeYaml = `[${scope.join(', ')}]`;
  const testsLine = testsModify === undefined ? '' : `\ntests:\n  modify: ${testsModify}`;
  const frontmatter = `title: Task ${taskNumber}\nverify: ${PASSING_VERIFY}\nscope: ${scopeYaml}\nentry: []\nskills: []${testsLine}`;
  await fs.writeFile(
    path.join(specFolder, 'tasks', `${taskNumber}.md`),
    `---\n${frontmatter}\n---\n## Acceptance\n- [ ] passes cleanly\n`,
    'utf8',
  );
}

describe('Resolved scope lint integration', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scope-lint-test-'));
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    const spec = await createNewSpec(tmpDir, 'Scope Overlap');
    specFolder = spec.folderPath;

    const proposalPath = path.join(specFolder, 'proposal.md');
    const specMdPath = path.join(specFolder, 'spec.md');
    if (
      await fs
        .stat(proposalPath)
        .then(() => true)
        .catch(() => false)
    ) {
      const content = await fs.readFile(proposalPath, 'utf8');
      await fs.writeFile(specMdPath, content, 'utf8');
      await fs.rm(proposalPath, { force: true });
    }
    const seeded = await fs.readFile(specMdPath, 'utf8');
    const cleaned = seeded
      .replace(/^[ \t]*writes:[^\n]*\n/m, '')
      .replace(/^verify:[^\n]*$/m, `verify: ${PASSING_VERIFY}`);
    if (cleaned !== seeded) {
      await fs.writeFile(specMdPath, cleaned, 'utf8');
    }

    // Take full control of the task set so each case declares only the scopes
    // it is proving.
    await fs.rm(path.join(specFolder, 'tasks'), { recursive: true, force: true });
    await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });

    await installFakeOpenSpec(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('warns once when two tasks resolve the same exact file', async () => {
    await writeProjectFile(tmpDir, 'src/shared.ts');
    await writeTask(specFolder, '1', ['src/shared.ts']);
    await writeTask(specFolder, '2', ['src/shared.ts']);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.deepEqual(result.warnings, ['Tasks 1 and 2 share resolved scope file src/shared.ts']);
  });

  it('warns only for the glob-matched file two tasks share', async () => {
    await writeProjectFile(tmpDir, 'src/one.ts');
    await writeProjectFile(tmpDir, 'src/two.ts');
    await writeTask(specFolder, '1', ['src/*.ts']);
    await writeTask(specFolder, '2', ['src/one.ts']);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.deepEqual(result.warnings, ['Tasks 1 and 2 share resolved scope file src/one.ts']);
  });

  it('emits one warning per stable task pair for a file shared by three tasks', async () => {
    await writeProjectFile(tmpDir, 'src/shared.ts');
    // Written out of order so directory enumeration order cannot leak in.
    await writeTask(specFolder, '3', ['src/shared.ts']);
    await writeTask(specFolder, '1', ['src/shared.ts']);
    await writeTask(specFolder, '2', ['src/shared.ts']);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.deepEqual(result.warnings, [
      'Tasks 1 and 2 share resolved scope file src/shared.ts',
      'Tasks 1 and 3 share resolved scope file src/shared.ts',
      'Tasks 2 and 3 share resolved scope file src/shared.ts',
    ]);
  });

  it('orders warnings by path within a task pair', async () => {
    await writeProjectFile(tmpDir, 'src/a.ts');
    await writeProjectFile(tmpDir, 'src/b.ts');
    await writeTask(specFolder, '1', ['src/b.ts', 'src/a.ts']);
    await writeTask(specFolder, '2', ['src/a.ts', 'src/b.ts']);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.deepEqual(result.warnings, [
      'Tasks 1 and 2 share resolved scope file src/a.ts',
      'Tasks 1 and 2 share resolved scope file src/b.ts',
    ]);
  });

  it('does not self-warn for duplicate declarations inside one task', async () => {
    await writeProjectFile(tmpDir, 'src/shared.ts');
    await writeTask(specFolder, '1', ['src/shared.ts', 'src/shared.ts']);
    await writeTask(specFolder, '2', ['src/shared.ts']);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.deepEqual(result.warnings, ['Tasks 1 and 2 share resolved scope file src/shared.ts']);
  });

  it('never warns for missing exact paths or unmatched globs', async () => {
    await writeTask(specFolder, '1', ['src/missing.ts']);
    await writeTask(specFolder, '2', ['src/none-*.ts']);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.deepEqual(result.warnings, []);
  });

  it('keeps overlap warnings non-failing with independent errors present', async () => {
    await writeProjectFile(tmpDir, 'src/shared.ts');
    await writeTask(specFolder, '1', ['src/shared.ts']);
    await writeTask(specFolder, '2', ['src/shared.ts']);
    // Independent error: deprecated proposal field.
    const specMdPath = path.join(specFolder, 'spec.md');
    const content = await fs.readFile(specMdPath, 'utf8');
    await fs.writeFile(
      specMdPath,
      content.replace(/^features:\n/m, 'features:\n  writes: [one]\n'),
      'utf8',
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('features.writes is no longer supported')));
    assert.deepEqual(result.warnings, ['Tasks 1 and 2 share resolved scope file src/shared.ts']);
  });

  it('keeps maxScopeFiles counting declared patterns despite resolved overlap', async () => {
    await writeProjectFile(tmpDir, 'src/shared.ts');
    const patterns = Array.from({ length: DEFAULT_CONFIG.limits.maxScopeFiles + 1 }, () => 'src/*');
    await writeTask(specFolder, '1', patterns);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some(
        (e) => e.includes('patterns') && e.includes(String(DEFAULT_CONFIG.limits.maxScopeFiles)),
      ),
      result.errors.join('\n'),
    );
  });

  it('requires tests.modify for an existing exact test path', async () => {
    await writeProjectFile(tmpDir, 'tests/existing.test.ts');
    await writeTask(specFolder, '1', ['tests/existing.test.ts']);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes('tests.modify') && e.includes('existing.test.ts')),
      result.errors.join('\n'),
    );
  });

  it('requires tests.modify for a glob matching an existing test file', async () => {
    await writeProjectFile(tmpDir, 'tests/nested/deep.test.ts');
    await writeTask(specFolder, '1', ['tests/**']);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes('tests.modify')),
      result.errors.join('\n'),
    );
  });

  it('permits a missing exact new test path and an unmatched test glob', async () => {
    await writeTask(specFolder, '1', ['tests/brand-new.test.ts']);
    await writeTask(specFolder, '2', ['tests/**/*.missing.ts']);

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.deepEqual(result.errors, []);
  });

  it('exits zero through the lint entrypoint when only overlap warnings exist', async () => {
    await writeProjectFile(tmpDir, 'src/shared.ts');
    await writeTask(specFolder, '1', ['src/shared.ts']);
    await writeTask(specFolder, '2', ['src/shared.ts']);

    const logger = createRecordingLogger();
    const exitCodes: number[] = [];
    const result = await lintCommand(['001'], {
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      logger,
      exit: (code) => exitCodes.push(code),
    });

    const errors = result.entries.flatMap((entry) => entry.result.errors);
    assert.equal(result.valid, true, errors.join('\n'));
    assert.deepEqual(exitCodes, []);
    assert.ok(
      logger.entries.some(
        (entry) =>
          entry.level === 'warn' &&
          entry.message.includes('Tasks 1 and 2') &&
          entry.message.includes('src/shared.ts'),
      ),
      JSON.stringify(logger.entries),
    );
  });
});
