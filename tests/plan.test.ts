import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createProgram } from '../src/cli/index.js';
import { buildOpeningPrompt, planCommand } from '../src/cli/plan.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { getChangesDir, getSpecsDir } from '../src/core/status/layout.js';
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

const SIZES_FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'report-sizes',
);

const RECORD_HEADING = "## This repository's record";

/** Copy the checked-in measured archive into a fresh project as canonical history. */
async function copyMeasuredArchive(root: string): Promise<void> {
  await fs.cp(
    path.join(SIZES_FIXTURE, 'openspec', 'changes', 'archive'),
    path.join(root, 'openspec', 'changes', 'archive'),
    { recursive: true },
  );
}

/** Everything after the fifth section heading, trimmed, with no surrounding blank lines. */
function recordSection(prompt: string): string {
  const index = prompt.indexOf(RECORD_HEADING);
  assert.notEqual(index, -1, 'prompt must contain the repository record heading');
  return prompt.slice(index + RECORD_HEADING.length).trim();
}

async function captureStdout(run: () => Promise<void>): Promise<string> {
  let output = '';
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Buffer) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    await run();
  } finally {
    process.stdout.write = original;
  }
  return output;
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

    await planCommand('smoke', { brief: briefFixture, session: true, cwd: tmpDir, adapter });

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
    assert.equal(
      await pathExists(path.join(changesDir, folder, 'plan-prompt.md')),
      false,
      'print mode must not leave a prompt file behind',
    );
  });

  it('resumes an existing change with brief.md without creating a new change folder', async () => {
    const changesDir = getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir);
    const adapter = new InspectingAdapter(changesDir, 'resume-probe');

    // First plan run creates folder and brief.
    await planCommand('resume-probe', { brief: briefFixture, session: true, cwd: tmpDir, adapter });
    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 1);

    const briefPath = path.join(changesDir, '001-resume-probe', 'brief.md');
    const briefBefore = await fs.readFile(briefPath, 'utf8');

    const mock = getHarnessAdapter('mock') as MockAdapter;
    mock.resetBehavior();

    // Second plan run on change ID 001 resumes the existing folder.
    await planCommand('001', { session: true, cwd: tmpDir });

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

  it('builds five ordered sections with the sufficient repository record after the brief', async () => {
    await copyMeasuredArchive(tmpDir);

    const prompt = await buildOpeningPrompt({
      projectRoot: tmpDir,
      folderPath: path.join(tmpDir, 'openspec', 'changes', '001-record-probe'),
      specId: '001',
      specTitle: 'Record Probe',
      briefContent: '# Record Probe\n\nBrief body.\n',
      openspecRoot: DEFAULT_CONFIG.paths.openspecRoot,
    });

    const plannerContent = await fs.readFile(path.join(tmpDir, 'PLANNER.md'), 'utf8');
    assert.ok(prompt.startsWith(`${plannerContent.trim()}\n\n`), 'complete PLANNER.md first');

    const positions = [
      prompt.indexOf('# Change: 001 - Record Probe'),
      prompt.indexOf('## Capability Specs'),
      prompt.indexOf('## Brief'),
      prompt.indexOf(RECORD_HEADING),
    ];
    positions.forEach((position, index) => {
      assert.notEqual(position, -1, `section ${index + 1} must be present`);
    });
    assert.deepEqual(
      positions,
      [...positions].sort((a, b) => a - b),
      'sections stay ordered',
    );

    const section = recordSection(prompt);
    assert.ok(section.includes('First-attempt passes: 5/8'), section);
    assert.ok(
      section.includes(
        'Largest first-attempt pass: 102-size-medium/2 "Tied largest A" (scope files: 8, acceptance lines: 7)',
      ),
      section,
    );
    assert.ok(section.includes('Median task duration: 35s'), section);
    assert.ok(section.includes('- 103-size-large, Large dead task, crashed'), section);
    assert.ok(section.includes('- 102-size-medium, Medium retry task, verify_red'), section);
    assert.ok(
      section.split('\n').filter((line) => line.startsWith('- ')).length <= 10,
      'at most ten dead outcome lines',
    );
  });

  it('emits only the too-small record sentence below five measured tasks', async () => {
    const prompt = await buildOpeningPrompt({
      projectRoot: tmpDir,
      folderPath: path.join(tmpDir, 'openspec', 'changes', '001-thin-probe'),
      specId: '001',
      specTitle: 'Thin Probe',
      briefContent: '# Thin Probe\n',
      openspecRoot: DEFAULT_CONFIG.paths.openspecRoot,
    });

    const section = recordSection(prompt);
    assert.equal(section, "This repository's measured record is too small (fewer than 5 tasks).");
    for (const forbidden of [
      'First-attempt passes',
      'Dead outcomes',
      'Largest first-attempt pass',
      'Median task duration',
      'result',
      'diff',
    ]) {
      assert.ok(!section.includes(forbidden), `too-small section must omit ${forbidden}`);
    }
  });

  it('uses one five-section prompt for interactive, resumed, and print planning', async () => {
    await copyMeasuredArchive(tmpDir);
    const changesDir = getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir);
    const adapter = new InspectingAdapter(changesDir, 'record-probe');

    await planCommand('record-probe', { brief: briefFixture, session: true, cwd: tmpDir, adapter });
    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 1);
    const interactivePrompt = MockAdapter.recordedInteractiveSpawns[0].prompt;
    assert.ok(recordSection(interactivePrompt).includes('First-attempt passes: 5/8'));

    const folderName = (await fs.readdir(changesDir)).find((entry) =>
      entry.endsWith('-record-probe'),
    );
    assert.ok(folderName, 'created change folder should exist');
    const specId = folderName.match(/^(\d+)/)?.[1];
    assert.ok(specId, 'created change folder should carry a numeric id');

    const mock = getHarnessAdapter('mock') as MockAdapter;
    mock.resetBehavior();
    await planCommand(specId, { session: true, cwd: tmpDir, adapter });
    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 1);
    const resumedPrompt = MockAdapter.recordedInteractiveSpawns[0].prompt;
    assert.ok(recordSection(resumedPrompt).includes('Median task duration: 35s'));

    const planLogPath = path.join(changesDir, folderName, '.run', 'plan.jsonl');
    const telemetryBefore = await fs.readFile(planLogPath, 'utf8');

    const stdout = await captureStdout(() => planCommand(specId, { print: true, cwd: tmpDir }));

    assert.equal(stdout, `${resumedPrompt}\n`, 'print mode emits the exact interactive bytes');
    assert.equal(await fs.readFile(planLogPath, 'utf8'), telemetryBefore, 'no telemetry appended');
  });

  it('emits the five-section prompt through the -print CLI alias', async () => {
    await copyMeasuredArchive(tmpDir);
    const originalCwd = process.cwd();
    const stdout = await captureStdout(async () => {
      process.chdir(tmpDir);
      try {
        const program = createProgram();
        await program.parseAsync(['plan', 'alias-record', '--brief', briefFixture, '-print'], {
          from: 'user',
        });
      } finally {
        process.chdir(originalCwd);
      }
    });

    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 0);
    assert.ok(recordSection(stdout).includes('First-attempt passes: 5/8'));
  });

  it('puts the repository record in a queue-selected planning prompt', async () => {
    await copyMeasuredArchive(tmpDir);
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      `export default {
  harness: "mock",
  planner: { harness: "mock", model: "mock-planner-model", agent: "mock-planner" },
  queue: { maxPlanningSessions: 10, maxPlanningCost: 100 }
};\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(tmpDir, 'openspec', 'queue.md'),
      '## [alpha] Queue Alpha\nDepends on: nothing\n\nBrief body for alpha.\n',
      'utf8',
    );

    await planCommand(undefined, {
      next: true,
      session: true,
      cwd: tmpDir,
      adapter: new MockAdapter(),
    });

    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 1);
    const prompt = MockAdapter.recordedInteractiveSpawns[0].prompt;
    assert.ok(prompt.includes('Queue Alpha'), 'queue item title seeded');
    assert.ok(recordSection(prompt).includes('First-attempt passes: 5/8'));

    const changesDir = getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir);
    const entries = (await fs.readdir(changesDir)).filter(
      (entry) => entry !== 'archive' && entry !== 'rejected',
    );
    assert.equal(entries.length, 1, 'one queue change created');
    assert.ok(
      await pathExists(path.join(changesDir, entries[0], '.run', 'plan.jsonl')),
      'queue planning records telemetry',
    );
  });
});

describe('osq plan command registration', () => {
  it('registers plan <name> with --brief, --print, and --session options', () => {
    const program = createProgram();
    const planCmd = program.commands.find((command) => command.name() === 'plan');

    assert.ok(planCmd, 'plan command should be registered');
    assert.equal(planCmd.registeredArguments[0].name(), 'name');
    assert.ok(planCmd.options.find((option) => option.long === '--brief'));
    assert.ok(planCmd.options.find((option) => option.long === '--print'));
    assert.ok(planCmd.options.find((option) => option.long === '--session'));
  });
});
