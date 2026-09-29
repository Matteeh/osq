import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { TEST_GATE_DIR, isGatedTestPath } from '../src/core/run/test-gate.js';
import { OPENSPEC_EXPECTED_VERSION, lintChangeFolder } from '../src/core/spec/linter.js';

const RECORD_FILE = 'openspec-invocations.json';

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

async function writeTaskFile(
  specFolder: string,
  taskNumber: string,
  frontmatter: string,
  acceptance = '- [ ] passes cleanly',
): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', `${taskNumber}.md`);
  await fs.writeFile(taskPath, `---\n${frontmatter}\n---\n## Acceptance\n${acceptance}\n`);
}

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

/** The six sources that must consume the gate's one definition. */
const GATE_SOURCES = [
  'src/watcher/verify.ts',
  'src/watcher/git-guard.ts',
  'src/core/run/task-commit.ts',
  'src/core/spec/linter.ts',
  'src/core/spec/test-impact.ts',
  'src/core/spec/digest.ts',
];

const GATE_IMPORT =
  /import\s*\{[^}]*\b(?:isGatedTestPath|TEST_GATE_DIR)\b[^}]*\}\s*from\s*['"](?:\.\.\/core\/run\/test-gate\.js|\.\.\/run\/test-gate\.js|\.\/test-gate\.js)['"]/;

describe('gated and ungated paths', () => {
  it('gates tests and paths under it, and nothing else', () => {
    assert.equal(TEST_GATE_DIR, 'tests');
    assert.equal(isGatedTestPath('tests'), true);
    assert.equal(isGatedTestPath('tests/a.test.ts'), true);
    assert.equal(isGatedTestPath('tests/sub/b.ts'), true);
    assert.equal(isGatedTestPath('src/a.test.ts'), false);
    assert.equal(isGatedTestPath('testsuite/a.ts'), false);
    assert.equal(isGatedTestPath('src/tests/a.ts'), false);
  });
});

describe('one gate definition', () => {
  it('has every consumer call isGatedTestPath and define none of its own', async () => {
    for (const relative of GATE_SOURCES) {
      const source = await fs.readFile(path.join(process.cwd(), relative), 'utf8');
      assert.equal(source.includes("=== 'tests'"), false, `${relative} compares with 'tests'`);
      assert.equal(
        source.includes("startsWith('tests/')"),
        false,
        `${relative} compares with 'tests/'`,
      );
      assert.equal(source.includes('TEST_DIR_NAME'), false, `${relative} defines TEST_DIR_NAME`);
      assert.equal(
        /\b(?:function\s+(?:isTestPath|isTestFilePath)|const\s+(?:isTestPath|isTestFilePath))\b/.test(
          source,
        ),
        false,
        `${relative} defines its own test-path function`,
      );
      assert.match(source, GATE_IMPORT, `${relative} must import from run/test-gate.js`);
    }
  });
});

describe('named test outside tests', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-test-gate-'));
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    const spec = await createNewSpec(tmpDir, 'Test Feature');
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
    const seededTaskPath = path.join(specFolder, 'tasks', '1.md');
    const seededTask = await fs.readFile(seededTaskPath, 'utf8').catch(() => null);
    if (seededTask !== null) {
      await fs.writeFile(
        seededTaskPath,
        seededTask.replace(/^verify:[^\n]*$/m, `verify: ${PASSING_VERIFY}`),
        'utf8',
      );
    }
    await installFakeOpenSpec(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('raises no tests.modify finding for a test outside tests', async () => {
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'quote.test.ts'), '// existing\n');
    await writeTaskFile(
      specFolder,
      '1',
      `title: Valid title\nverify: ${PASSING_VERIFY}\nscope: [src/quote.test.ts]\nentry: []\nskills: []`,
    );

    const result = await lintChangeFolder(tmpDir, specFolder, DEFAULT_CONFIG);

    assert.equal(
      result.errors.some((e) => e.includes('tests.modify')),
      false,
    );
  });
});
