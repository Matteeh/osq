import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';
import { planCommand } from '../src/cli/plan.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { getChangesDir, getSpecsDir } from '../src/core/layout.js';
import { parseFrontmatter } from '../src/core/parser.js';
import { getHarnessAdapter } from '../src/harness/index.js';
import { MockAdapter } from '../src/harness/mock.js';
import type { InteractiveSessionOptions } from '../src/harness/types.js';
import { installFakeValidator } from './helpers.js';

async function pathExists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

/**
 * Mock adapter that snapshots the change folder on disk at the moment the
 * interactive session opens, proving the folder and `brief.md` were written
 * before the harness was spawned.
 */
class InspectingAdapter extends MockAdapter {
  folderExistedAtSpawn = false;
  briefExistedAtSpawn = false;
  private readonly changesDir: string;
  private readonly slug: string;

  constructor(changesDir: string, slug: string) {
    super();
    this.changesDir = changesDir;
    this.slug = slug;
  }

  override async spawnInteractive(options: InteractiveSessionOptions): Promise<number> {
    const entries = await fs.readdir(this.changesDir).catch(() => [] as string[]);
    const folder = entries.find((entry) => entry.includes(this.slug));
    this.folderExistedAtSpawn = folder !== undefined;
    if (folder) {
      this.briefExistedAtSpawn = await pathExists(path.join(this.changesDir, folder, 'brief.md'));
    }
    return await super.spawnInteractive(options);
  }
}

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

  it('creates change folder and brief.md before spawning the interactive session', async () => {
    const changesDir = getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir);
    const adapter = new InspectingAdapter(changesDir, 'smoke');

    await planCommand('smoke', { brief: briefFixture, cwd: tmpDir, adapter });

    // Acceptance: folder and brief.md exist before the session opens.
    assert.equal(adapter.folderExistedAtSpawn, true, 'change folder must exist before spawn');
    assert.equal(adapter.briefExistedAtSpawn, true, 'brief.md must exist before spawn');

    const entries = await fs.readdir(changesDir);
    const changeFolder = entries.find((entry) => entry.includes('smoke'));
    assert.ok(changeFolder, 'change folder for smoke should exist');

    const folderPath = path.join(changesDir, changeFolder);
    const briefContent = await fs.readFile(path.join(folderPath, 'brief.md'), 'utf8');

    // Acceptance: brief.md frontmatter records planner model and date.
    const { data: briefData, body: briefBody } = parseFrontmatter(briefContent);
    assert.equal(briefData.planner, 'mock-planner-model');
    const today = new Date().toISOString().split('T')[0];
    assert.equal(briefData.date, today);
    assert.ok(briefBody.includes('My Test Feature'));

    // Mock interactive spawn recorded exactly once with resolved planner values.
    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 1);
    const spawnCall = MockAdapter.recordedInteractiveSpawns[0];
    assert.equal(spawnCall.model, 'mock-planner-model');
    assert.equal(spawnCall.agent, 'mock-planner');
    assert.equal(spawnCall.cwd, tmpDir);

    // Acceptance: opening prompt contains the four sections in strict order.
    const prompt = spawnCall.prompt;
    const plannerContent = await fs.readFile(path.join(tmpDir, 'PLANNER.md'), 'utf8');
    assert.ok(
      prompt.startsWith(plannerContent.trim()),
      'prompt must begin with the full PLANNER.md content',
    );
    assert.ok(prompt.includes('Write files with the file tool, never through a shell echo.'));

    const changeIdx = prompt.indexOf('# Change: 001 - smoke');
    const specsIdx = prompt.indexOf('## Capability Specs');
    const briefIdx = prompt.indexOf('## Brief');

    assert.notEqual(changeIdx, -1, 'prompt should contain change id and title');
    assert.notEqual(specsIdx, -1, 'prompt should contain capability specs paths');
    assert.notEqual(briefIdx, -1, 'prompt should contain brief content');

    assert.ok(changeIdx < specsIdx, 'change id/title must appear before capability specs');
    assert.ok(specsIdx < briefIdx, 'capability specs must appear before brief');

    assert.ok(prompt.includes('openspec/specs/cli-foundation/spec.md'));
    assert.ok(prompt.includes('Detailed requirements for testing.'));
  });

  it('-print writes the opening prompt to stdout only and does not spawn a session', async () => {
    let stdoutOutput = '';
    let stderrOutput = '';
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: string | Buffer) => {
      stdoutOutput += chunk.toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Buffer) => {
      stderrOutput += chunk.toString();
      return true;
    }) as typeof process.stderr.write;

    try {
      await planCommand('print-probe', { brief: briefFixture, print: true, cwd: tmpDir });
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }

    // No interactive session was launched.
    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 0);

    // Output contains all four sections, beginning with PLANNER.md.
    const plannerContent = await fs.readFile(path.join(tmpDir, 'PLANNER.md'), 'utf8');
    assert.ok(stdoutOutput.startsWith(plannerContent.trim()), 'prompt printed to stdout');
    assert.ok(stdoutOutput.includes('# Change: 001 - print-probe'));
    assert.ok(stdoutOutput.includes('## Capability Specs'));
    assert.ok(stdoutOutput.includes('## Brief'));
    assert.ok(!stdoutOutput.includes('Created spec'), 'print mode must not log creation to stdout');
    assert.ok(
      !stderrOutput.includes('Created spec'),
      'print mode must write creation logs nowhere',
    );

    // -print still creates the change folder and brief.md.
    const changesDir = getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir);
    const entries = await fs.readdir(changesDir);
    const folder = entries.find((entry) => entry.includes('print-probe'));
    assert.ok(folder, 'print mode should create the change folder');
    assert.ok(await pathExists(path.join(changesDir, folder, 'brief.md')));
  });

  it('resumes an existing change with brief.md without creating a new change folder', async () => {
    const changesDir = getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir);
    const adapter = new InspectingAdapter(changesDir, 'resume-probe');

    // First plan run creates folder and brief.
    await planCommand('resume-probe', { brief: briefFixture, cwd: tmpDir, adapter });
    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 1);

    const briefPath = path.join(changesDir, '001-resume-probe', 'brief.md');
    const briefBefore = await fs.readFile(briefPath, 'utf8');

    const mock = getHarnessAdapter('mock') as MockAdapter;
    mock.resetBehavior();

    // Second plan run on change ID 001 resumes the existing folder.
    await planCommand('001', { cwd: tmpDir });

    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 1);
    assert.ok(MockAdapter.recordedInteractiveSpawns[0].prompt.includes('resume-probe'));

    const entries = (await fs.readdir(changesDir)).filter((entry) => entry !== 'archive');
    assert.deepEqual(entries, ['001-resume-probe'], 'resume must not create a new change folder');

    const briefAfter = await fs.readFile(briefPath, 'utf8');
    assert.equal(briefAfter, briefBefore, 'resume must not rewrite the existing brief.md');
  });

  it('accepts the -print alias through the CLI without launching a harness', async () => {
    const originalCwd = process.cwd();
    let stdoutOutput = '';
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Buffer) => {
      stdoutOutput += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    try {
      process.chdir(tmpDir);
      const program = createProgram();
      await program.parseAsync(['plan', 'cli-print', '--brief', briefFixture, '-print'], {
        from: 'user',
      });
    } finally {
      process.chdir(originalCwd);
      process.stdout.write = originalStdoutWrite;
    }

    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 0);
    assert.ok(stdoutOutput.includes('# Change: 001 - cli-print'));
    assert.ok(stdoutOutput.includes('## Capability Specs'));
    assert.ok(stdoutOutput.includes('## Brief'));
  });
});

describe('osq plan command registration', () => {
  it('registers plan <name> with --brief and --print options', () => {
    const program = createProgram();
    const planCmd = program.commands.find((command) => command.name() === 'plan');

    assert.ok(planCmd, 'plan command should be registered');
    assert.equal(planCmd.registeredArguments[0].name(), 'name');
    assert.ok(planCmd.options.find((option) => option.long === '--brief'));
    assert.ok(planCmd.options.find((option) => option.long === '--print'));
  });
});
