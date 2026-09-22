import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';
import { buildOpeningPrompt, planCommand } from '../src/cli/plan.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { getChangesDir, getSpecsDir } from '../src/core/status/layout.js';
import { getHarnessAdapter } from '../src/harness/index.js';
import { MockAdapter } from '../src/harness/mock.js';
import { installFakeValidator } from './helpers.js';

const RECORD_HEADING = "## This repository's record";

async function pathExists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
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

async function findChangeFolder(root: string, slug: string): Promise<string> {
  const changesDir = getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, root);
  const entries = await fs.readdir(changesDir);
  const folder = entries.find((entry) => entry.includes(slug));
  assert.ok(folder, `change folder for ${slug} should exist`);
  return path.join(changesDir, folder);
}

async function activeFolderNames(root: string): Promise<string[]> {
  const changesDir = getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, root);
  const entries = await fs.readdir(changesDir);
  return entries.filter((entry) => entry !== 'archive' && entry !== 'rejected').sort();
}

describe('osq plan prompt handoff', () => {
  let tmpDir: string;
  let briefFixture: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-handoff-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);

    briefFixture = path.join(tmpDir, 'handoff-brief.md');
    await fs.writeFile(
      briefFixture,
      '# Handoff Feature\n\nDetailed handoff requirements.\n',
      'utf8',
    );

    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      `export default {
  harness: "mock",
  planner: { harness: "mock", model: "mock-planner-model", agent: "mock-planner" }
};\n`,
      'utf8',
    );

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

  it('writes a null brief, prompt file, and one-line handoff without a session', async () => {
    const stdout = await captureStdout(() =>
      planCommand('handoff-default', { brief: briefFixture, cwd: tmpDir }),
    );

    assert.equal(
      MockAdapter.recordedInteractiveSpawns.length,
      0,
      'no harness adapter may be constructed or launched',
    );

    const folder = await findChangeFolder(tmpDir, 'handoff-default');
    const brief = parseFrontmatter(await fs.readFile(path.join(folder, 'brief.md'), 'utf8'));
    assert.equal(brief.data.planner, null);
    assert.equal(brief.data.date, new Date().toISOString().split('T')[0]);
    assert.ok(brief.body.includes('Handoff Feature'));

    const prompt = await fs.readFile(path.join(folder, 'plan-prompt.md'), 'utf8');
    const plannerContent = await fs.readFile(path.join(tmpDir, 'PLANNER.md'), 'utf8');
    assert.ok(prompt.startsWith(plannerContent.trim()), 'complete PLANNER.md first');
    assert.ok(prompt.includes('# Change: 001 - handoff-default'));
    assert.ok(prompt.includes('## Capability Specs'));
    assert.ok(prompt.includes('- openspec/specs/cli-foundation/spec.md'));
    assert.ok(prompt.includes('## Brief'));
    assert.ok(prompt.includes('Detailed handoff requirements.'));
    assert.ok(prompt.includes(RECORD_HEADING));
    assert.equal(prompt.split(RECORD_HEADING).length - 1, 1, 'exactly one record heading');

    await assert.rejects(fs.stat(path.join(folder, '.run', 'plan.jsonl')), 'no planning log');
    assert.equal(stdout.trim().split('\n').length, 1, 'exactly one handoff line');
    assert.ok(stdout.includes(folder), 'handoff names the folder path');
    assert.ok(stdout.includes('ask your planning tool to plan change 001-handoff-default'));
  });

  it('stores the exact buildOpeningPrompt bytes in the prompt file', async () => {
    await planCommand('exact-bytes', { brief: briefFixture, cwd: tmpDir });
    const folder = await findChangeFolder(tmpDir, 'exact-bytes');
    const specId = path.basename(folder).match(/^(\d+)/)?.[1];
    assert.ok(specId, 'change folder carries a numeric id');
    const briefContent = await fs.readFile(path.join(folder, 'brief.md'), 'utf8');
    const specTitle = String(
      parseFrontmatter(await fs.readFile(path.join(folder, 'proposal.md'), 'utf8')).data.title,
    );

    const expected = await buildOpeningPrompt({
      projectRoot: tmpDir,
      folderPath: folder,
      specId,
      specTitle,
      briefContent,
      openspecRoot: DEFAULT_CONFIG.paths.openspecRoot,
    });
    assert.equal(await fs.readFile(path.join(folder, 'plan-prompt.md'), 'utf8'), expected);
  });

  it('print mode creates the change and brief but no prompt file, process, or record', async () => {
    const stdout = await captureStdout(() =>
      planCommand('print-only', { brief: briefFixture, print: true, cwd: tmpDir }),
    );

    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 0);
    const folder = await findChangeFolder(tmpDir, 'print-only');
    assert.ok(await pathExists(path.join(folder, 'brief.md')));
    assert.equal(await pathExists(path.join(folder, 'plan-prompt.md')), false);
    await assert.rejects(fs.stat(path.join(folder, '.run', 'plan.jsonl')));

    const plannerContent = await fs.readFile(path.join(tmpDir, 'PLANNER.md'), 'utf8');
    assert.ok(stdout.startsWith(plannerContent.trim()));
    assert.ok(stdout.includes('# Change: 001 - print-only'));
    assert.ok(stdout.includes('## Brief'));
    assert.ok(stdout.includes(RECORD_HEADING));
  });

  it('print mode emits the same bytes as the prompt file for a resumed change', async () => {
    await planCommand('shared-bytes', { brief: briefFixture, cwd: tmpDir });
    const folder = await findChangeFolder(tmpDir, 'shared-bytes');
    const filePrompt = await fs.readFile(path.join(folder, 'plan-prompt.md'), 'utf8');
    const specId = path.basename(folder).match(/^(\d+)/)?.[1];
    assert.ok(specId);

    const stdout = await captureStdout(() => planCommand(specId, { print: true, cwd: tmpDir }));
    assert.equal(stdout, `${filePrompt}\n`, 'print mode emits the exact file bytes');
    assert.equal(await pathExists(path.join(folder, 'plan-prompt.md')), true);
    await assert.rejects(fs.stat(path.join(folder, '.run', 'plan.jsonl')));
  });

  it('resumed default reuses the folder, keeps the brief, and refreshes the prompt file', async () => {
    await captureStdout(() => planCommand('resume-handoff', { brief: briefFixture, cwd: tmpDir }));
    const folder = await findChangeFolder(tmpDir, 'resume-handoff');
    const folderName = path.basename(folder);
    const briefBefore = await fs.readFile(path.join(folder, 'brief.md'), 'utf8');
    const promptBefore = await fs.readFile(path.join(folder, 'plan-prompt.md'), 'utf8');

    const specsDir = getSpecsDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir);
    await fs.mkdir(path.join(specsDir, 'new-capability'), { recursive: true });
    await fs.writeFile(
      path.join(specsDir, 'new-capability', 'spec.md'),
      '# New Capability\n',
      'utf8',
    );

    const specId = folderName.match(/^(\d+)/)?.[1];
    assert.ok(specId);
    const stdout = await captureStdout(() => planCommand(specId, { cwd: tmpDir }));

    assert.equal(await fs.readFile(path.join(folder, 'brief.md'), 'utf8'), briefBefore);
    const promptAfter = await fs.readFile(path.join(folder, 'plan-prompt.md'), 'utf8');
    assert.notEqual(promptAfter, promptBefore, 'prompt refreshed from current repository context');
    assert.ok(promptAfter.includes('- openspec/specs/new-capability/spec.md'));
    assert.deepEqual(await activeFolderNames(tmpDir), [folderName], 'no second folder created');
    assert.equal(stdout.trim().split('\n').length, 1);
    assert.ok(stdout.includes(`ask your planning tool to plan change ${folderName}`));
  });

  it('default and print handoff succeed while an unusable planner is configured', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      `export default { harness: 'agy', planner: { harness: 'codex', model: 'missing-model' } };\n`,
      'utf8',
    );
    const saved = process.env.CODEX_PATH;
    process.env.CODEX_PATH = path.join(tmpDir, 'missing-codex');
    try {
      const stdout = await captureStdout(() =>
        planCommand('planner-unavailable', { brief: briefFixture, cwd: tmpDir }),
      );
      const folder = await findChangeFolder(tmpDir, 'planner-unavailable');
      const brief = parseFrontmatter(await fs.readFile(path.join(folder, 'brief.md'), 'utf8'));
      assert.equal(brief.data.planner, null);
      assert.equal(await pathExists(path.join(folder, 'plan-prompt.md')), true);
      await assert.rejects(fs.stat(path.join(folder, '.run', 'plan.jsonl')));
      assert.ok(stdout.includes('ask your planning tool to plan change'));

      const printOut = await captureStdout(() =>
        planCommand('planner-unavailable-print', { brief: briefFixture, print: true, cwd: tmpDir }),
      );
      assert.ok(printOut.includes('# Change: 002 - planner-unavailable-print'));
    } finally {
      if (saved === undefined) Reflect.deleteProperty(process.env, 'CODEX_PATH');
      else process.env.CODEX_PATH = saved;
    }
  });

  it('registers --session and rejects session combined with print before mutation', async () => {
    const program = createProgram();
    const planCmd = program.commands.find((command) => command.name() === 'plan');
    assert.ok(planCmd?.options.find((option) => option.long === '--session'));

    await assert.rejects(
      () =>
        planCommand('incompatible', {
          brief: briefFixture,
          session: true,
          print: true,
          cwd: tmpDir,
        }),
      /--session.*--print/,
    );
    assert.deepEqual(await activeFolderNames(tmpDir), []);
  });
});
