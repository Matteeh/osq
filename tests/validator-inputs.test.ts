import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { GitVcs } from '../src/core/vcs/git-vcs.js';
import { NoVcs } from '../src/core/vcs/no-vcs.js';
import { buildClaudeArgs } from '../src/harness/claude/claude-exec-args.js';
import { buildPiArgs } from '../src/harness/pi/pi-args.js';
import { buildExecutorPrompt } from '../src/harness/prompt.js';
import type { SpawnTaskOptions } from '../src/harness/types.js';
import { parseValidatorFindings } from '../src/watcher/validator-findings.js';
import {
  type ValidatorInputs,
  formatScenariosFile,
  judgedScenarios,
  readValidatorInputs,
} from '../src/watcher/validator-inputs.js';
import { buildValidatorPrompt } from '../src/watcher/validator-prompt.js';

const execFileAsync = promisify(execFile);
const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** The test's own git calls ignore redirecting variables, like osq's reads. */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'])
    Reflect.deleteProperty(env, key);
  return env;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
  return stdout.trim();
}

const S1 = '#### Scenario: S1\n- **WHEN** a\n- **THEN** b\n';
const OLD = '#### Scenario: Old\n- **WHEN** x\n- **THEN** y\n';
const NEW = '#### Scenario: New\n- **WHEN** z\n- **THEN** w\n';
const ADDED = `## ADDED Requirements\n\n### Requirement: Alpha\nAlpha.\n\n${S1}`;
const MODIFIED = `## MODIFIED Requirements\n\n### Requirement: Alpha\nAlpha.\n\n${S1}`;
const LIVING = `# x Specification\n\n## Purpose\ntest\n\n## Requirements\n\n### Requirement: Alpha\nAlpha.\n\n${S1}`;

/** A committed repository plus an uncommitted change folder pointing at it. */
async function makeRepo(prefix: string, delta: string, living: string | null) {
  const root = await makeTempDir(prefix);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await fs.writeFile(path.join(root, 'seed.txt'), 'seed\n', 'utf8');
  if (living !== null)
    await fs.mkdir(path.join(root, 'openspec', 'specs', 'x'), { recursive: true });
  if (living !== null)
    await fs.writeFile(path.join(root, 'openspec', 'specs', 'x', 'spec.md'), living, 'utf8');
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'init'], root);
  const base = await git(['rev-parse', 'HEAD'], root);

  const change = path.join(root, 'openspec', 'changes', '001-x');
  await fs.mkdir(path.join(change, 'specs', 'x'), { recursive: true });
  await fs.mkdir(path.join(change, '.run', 'results'), { recursive: true });
  await fs.writeFile(path.join(change, '.run', 'base'), `${base}\n`, 'utf8');
  await fs.writeFile(path.join(change, 'specs', 'x', 'spec.md'), delta, 'utf8');
  await fs.writeFile(path.join(change, '.run', 'results', '1.md'), 'one\n', 'utf8');
  await fs.writeFile(path.join(change, '.run', 'results', '2.md'), 'two\n', 'utf8');
  return { root, base, change };
}

describe('validator inputs', () => {
  it('judges only a scenario the living spec at the base does not already hold', () => {
    const delta = `## MODIFIED Requirements\n\n### Requirement: Alpha\nAlpha.\n\n${OLD}\n${NEW}`;
    const living = `# x Specification\n\n## Purpose\ntest\n\n## Requirements\n\n### Requirement: Alpha\nAlpha.\n\n${OLD}`;
    const scenarios = judgedScenarios(new Map([['x', delta]]), new Map([['x', living]]));
    assert.deepEqual(
      scenarios.map((entry) => entry.scenario),
      ['New'],
    );
    assert.equal(scenarios[0].capability, 'x');
    assert.equal(scenarios[0].requirement, 'Alpha');
  });

  it('leaves OpenSpec specs out of the patch and keeps existing test paths', async () => {
    const { root, base, change } = await makeRepo('osq-vin-patch-', ADDED, null);
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.mkdir(path.join(root, 'tests'), { recursive: true });
    await fs.mkdir(path.join(root, 'openspec', 'specs', 'x'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
    await fs.writeFile(path.join(root, 'tests', 'a.test.ts'), 'test("a", () => {});\n', 'utf8');
    await fs.writeFile(path.join(root, 'openspec', 'specs', 'x', 'spec.md'), LIVING, 'utf8');

    const inputs = await readValidatorInputs(
      root,
      change,
      new GitVcs(root, DEFAULT_CONFIG),
      DEFAULT_CONFIG,
    );
    assert.ok(!('notRun' in inputs));
    assert.equal(inputs.base, base);
    assert.ok(!inputs.patch.includes('diff --git a/openspec/'));
    assert.ok(inputs.patch.includes('src/a.ts'));
    assert.ok(inputs.patch.includes('tests/a.test.ts'));
    assert.deepEqual(inputs.testPaths, ['tests/a.test.ts']);
    assert.deepEqual(inputs.deltaPaths, ['openspec/changes/001-x/specs/x/spec.md']);
    assert.deepEqual(inputs.resultPaths, [
      'openspec/changes/001-x/.run/results/1.md',
      'openspec/changes/001-x/.run/results/2.md',
    ]);
  });

  it('returns no_base without a base, and for a NoVcs port', async () => {
    const { root, change } = await makeRepo('osq-vin-nobase-', ADDED, null);
    await fs.rm(path.join(change, '.run', 'base'));
    const vcs = new GitVcs(root, DEFAULT_CONFIG);
    assert.deepEqual(await readValidatorInputs(root, change, vcs, DEFAULT_CONFIG), {
      notRun: 'no_base',
    });
    assert.deepEqual(
      await readValidatorInputs(root, change, new NoVcs('git off'), DEFAULT_CONFIG),
      {
        notRun: 'no_base',
      },
    );
  });

  it('returns no_scenarios when nothing is judged', async () => {
    const { root, change } = await makeRepo('osq-vin-nosc-', MODIFIED, LIVING);
    const inputs = await readValidatorInputs(
      root,
      change,
      new GitVcs(root, DEFAULT_CONFIG),
      DEFAULT_CONFIG,
    );
    assert.deepEqual(inputs, { notRun: 'no_scenarios' });
  });

  it('formats a scenarios file with one heading per requirement', () => {
    const file = formatScenariosFile([
      { capability: 'x', requirement: 'Alpha', scenario: 'S1', text: '#### Scenario: S1\n- a' },
      { capability: 'x', requirement: 'Beta', scenario: 'S2', text: '#### Scenario: S2\n- b' },
    ]);
    assert.ok(file.startsWith('# Scenarios to judge\n'));
    assert.ok(file.indexOf('## x: Alpha') < file.indexOf('## x: Beta'));
  });
});

describe('validator prompt', () => {
  const inputs: ValidatorInputs = {
    base: 'abc123',
    deltaPaths: ['openspec/changes/001-x/specs/x/spec.md'],
    scenarios: [{ capability: 'x', requirement: 'Alpha', scenario: 'S1', text: S1 }],
    patch: 'diff --git a/src/a.ts b/src/a.ts\n',
    testPaths: ['tests/a.test.ts'],
    resultPaths: ['openspec/changes/001-x/.run/results/1.md'],
  };
  const paths = {
    changeFolder: 'openspec/changes/001-x',
    scenariosFile: 'openspec/changes/001-x/.run/validator/scenarios.md',
    patchFile: 'openspec/changes/001-x/.run/validator/diff.patch',
    findingsFile: 'openspec/changes/001-x/.run/validator/findings.json',
  };

  it('puts the claims last and ends with the critical line', () => {
    const prompt = buildValidatorPrompt(inputs, paths);
    const claims = 'Executor claims (check them; do not start from them):';
    const at = (needle: string): number => prompt.indexOf(needle);
    assert.ok(at(inputs.deltaPaths[0]) < at(paths.scenariosFile));
    assert.ok(at(paths.scenariosFile) < at(paths.patchFile));
    assert.ok(at(paths.patchFile) < at(inputs.testPaths[0]));
    assert.ok(at(inputs.testPaths[0]) < at(claims));
    assert.ok(at(claims) < at(inputs.resultPaths[0]));
    assert.equal(
      prompt.split('\n').at(-1),
      `CRITICAL: Before exiting, write ${paths.findingsFile}. Change no other file. Never run git.`,
    );
    for (const name of ['no_code', 'no_test', 'passes_without_change', '{"findings": []}']) {
      assert.ok(prompt.includes(name));
    }
  });
});

describe('validator findings', () => {
  const base = { kind: 'scenario', requirement: 'R', scenario: 'S', detail: 'd' };

  it('returns one trimmed finding', () => {
    const text = JSON.stringify({
      findings: [{ ...base, capability: ' x ', problem: 'no_code', detail: ' none ' }],
    });
    assert.deepEqual(parseValidatorFindings(text), [
      { ...base, capability: 'x', problem: 'no_code', detail: 'none' },
    ]);
  });

  it('returns null for an unknown problem, empty field, or bad JSON', () => {
    const bad = (finding: object): string => JSON.stringify({ findings: [finding] });
    assert.equal(parseValidatorFindings('not json'), null);
    assert.equal(parseValidatorFindings(bad({ ...base, capability: 'x', problem: 'style' })), null);
    assert.equal(
      parseValidatorFindings(bad({ ...base, capability: ' ', problem: 'no_code' })),
      null,
    );
    assert.equal(parseValidatorFindings(JSON.stringify({})), null);
  });

  it('reads {"findings": []} as no findings', () => {
    assert.deepEqual(parseValidatorFindings('{"findings": []}'), []);
  });
});

describe('prompt override', () => {
  const task = (prompt: string): SpawnTaskOptions =>
    ({
      projectRoot: '/r',
      specFolderPath: '/r/c',
      taskNumber: '1',
      taskTitle: 't',
      verifyCommand: 'true',
      scope: [],
      entry: [],
      skills: [],
      tier: 'smart',
      prompt,
    }) as SpawnTaskOptions;

  it('returns the prompt unchanged and delivers it through claude and pi', () => {
    const options = task('judge this');
    assert.equal(buildExecutorPrompt(options), 'judge this');
    assert.equal(buildClaudeArgs(options, DEFAULT_CONFIG).at(-1), 'judge this');
    assert.equal(buildPiArgs(options, DEFAULT_CONFIG).at(-1), 'judge this');
  });
});
