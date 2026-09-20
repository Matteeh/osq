import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { planCommand } from '../src/cli/plan.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { getChangesDir, getSpecsDir } from '../src/core/layout.js';
import { parseFrontmatter } from '../src/core/parser.js';
import { getHarnessAdapter } from '../src/harness/index.js';
import { MockAdapter } from '../src/harness/mock.js';
import { installFakeValidator } from './helpers.js';

describe('osq plan command', () => {
  let tmpDir: string;
  let briefFixture: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);

    briefFixture = path.join(tmpDir, 'test-brief.md');
    await fs.writeFile(
      briefFixture,
      '# My Test Feature\n\nDetailed requirements for testing.\n',
      'utf8',
    );

    // Write osq.config.ts using mock harness and planner config
    const configContent = `export default {
  harness: "mock",
  planner: {
    harness: "mock",
    model: "mock-planner-model",
    agent: "mock-planner"
  }
};\n`;
    await fs.writeFile(path.join(tmpDir, 'osq.config.ts'), configContent, 'utf8');

    // Create a living capability spec under openspec/specs/
    const specsDir = getSpecsDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir);
    await fs.mkdir(path.join(specsDir, 'cli-foundation'), { recursive: true });
    await fs.writeFile(
      path.join(specsDir, 'cli-foundation', 'spec.md'),
      '# CLI Foundation Living Spec\n',
      'utf8',
    );
  });

  afterEach(async () => {
    const mock = getHarnessAdapter('mock') as MockAdapter;
    mock.resetBehavior();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates change folder, brief.md with frontmatter, and spawns mock interactive session', async () => {
    const mock = getHarnessAdapter('mock') as MockAdapter;
    mock.resetBehavior();

    await planCommand('smoke', { brief: briefFixture, cwd: tmpDir });

    const changesDir = getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir);
    const entries = await fs.readdir(changesDir);
    const changeFolder = entries.find((e) => e.includes('smoke'));
    assert.ok(changeFolder, 'Change folder for smoke should exist');

    const folderPath = path.join(changesDir, changeFolder);
    const briefPath = path.join(folderPath, 'brief.md');
    const briefContent = await fs.readFile(briefPath, 'utf8');

    // Verify brief.md frontmatter
    const { data: briefData, body: briefBody } = parseFrontmatter(briefContent);
    assert.equal(briefData.planner, 'mock-planner-model');
    const today = new Date().toISOString().split('T')[0];
    assert.equal(briefData.date, today);
    assert.ok(briefBody.includes('My Test Feature'));

    // Verify mock interactive spawn recorded exactly once
    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 1);
    const spawnCall = MockAdapter.recordedInteractiveSpawns[0];
    assert.equal(spawnCall.model, 'mock-planner-model');
    assert.equal(spawnCall.agent, 'mock-planner');
    assert.equal(spawnCall.cwd, tmpDir);

    // Verify opening prompt has 4 sections in order
    const prompt = spawnCall.prompt;
    const plannerIdx = prompt.indexOf('# Planning a change for osq');
    const changeIdx = prompt.indexOf('# Change: 001 - smoke');
    const specsIdx = prompt.indexOf('## Capability Specs');
    const briefIdx = prompt.indexOf('## Brief');

    assert.notEqual(plannerIdx, -1, 'Prompt should contain PLANNER.md content');
    assert.notEqual(changeIdx, -1, 'Prompt should contain change id and title');
    assert.notEqual(specsIdx, -1, 'Prompt should contain capability specs paths');
    assert.notEqual(briefIdx, -1, 'Prompt should contain brief content');

    assert.ok(plannerIdx < changeIdx, 'PLANNER.md must appear before change id/title');
    assert.ok(changeIdx < specsIdx, 'Change id/title must appear before capability specs');
    assert.ok(specsIdx < briefIdx, 'Capability specs must appear before brief');

    assert.ok(prompt.includes('openspec/specs/cli-foundation/spec.md'));
  });

  it('-print flag writes opening prompt to stdout without spawning session', async () => {
    const mock = getHarnessAdapter('mock') as MockAdapter;
    mock.resetBehavior();

    let stdoutOutput = '';
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Buffer) => {
      stdoutOutput += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    try {
      await planCommand('print-probe', { brief: briefFixture, print: true, cwd: tmpDir });
    } finally {
      process.stdout.write = originalStdoutWrite;
    }

    // Interactive session was not spawned
    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 0);

    // Output contains all 4 sections
    assert.ok(stdoutOutput.includes('# Planning a change for osq'));
    assert.ok(stdoutOutput.includes('print-probe'));
    assert.ok(stdoutOutput.includes('## Capability Specs'));
    assert.ok(stdoutOutput.includes('## Brief'));
    assert.ok(!stdoutOutput.includes('Created spec'), 'print mode should write only prompt');
  });

  it('resumes planning on existing change without re-creating folder', async () => {
    const mock = getHarnessAdapter('mock') as MockAdapter;
    mock.resetBehavior();

    // First plan run creates folder and brief
    await planCommand('resume-probe', { brief: briefFixture, cwd: tmpDir });
    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 1);

    mock.resetBehavior();

    // Second plan run on change ID 001 resumes existing folder
    await planCommand('001', { cwd: tmpDir });
    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 1);
    assert.ok(MockAdapter.recordedInteractiveSpawns[0].prompt.includes('resume-probe'));
  });
});
