import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import {
  OpencodeAdapter,
  buildOpencodeArgs,
  preflightOpencode,
} from '../src/harness/opencode/opencode.js';
import type { SpawnTaskOptions } from '../src/harness/types.js';

const FIXTURE_DIR = path.resolve('tests/fixtures/events/opencode-v2');
const RUN_STREAM = path.join(FIXTURE_DIR, 'run-stream.jsonl');
const SESSION_EXPORT = path.join(FIXTURE_DIR, 'session-export.json');
const SESSION_COST = 0.0016601459999999997;

interface RecordedEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, taskNumber: string): Promise<RecordedEvent[]> {
  const file = path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`);
  const raw = await fs.readFile(file, 'utf8');
  return raw
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as RecordedEvent);
}

/**
 * A fake opencode that answers `run` with the observed v2 stream and
 * `session export` with the observed session export. With `exportExit`, the
 * export invocation fails instead.
 */
async function writeFakeOpencode(dir: string, exportExit?: number): Promise<string> {
  const bin = path.join(dir, 'fake-opencode.mjs');
  const exportBranch =
    exportExit === undefined
      ? `process.stdout.write(fs.readFileSync(${JSON.stringify(SESSION_EXPORT)}, 'utf8'));\n  process.exit(0);`
      : `process.exit(${exportExit});`;
  const script = `#!/usr/bin/env node
import fs from 'node:fs';
const argv = process.argv.slice(2);
if (argv[0] === 'run') {
  process.stdout.write(fs.readFileSync(${JSON.stringify(RUN_STREAM)}, 'utf8'));
  process.exit(0);
}
if (argv[0] === 'session' && argv[1] === 'export') {
  ${exportBranch}
}
process.exit(0);
`;
  await fs.writeFile(bin, script, { mode: 0o755 });
  return bin;
}

describe('OpenCode v2 adapter', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-opencode-v2-'));
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Opencode V2 Feature');
    specFolder = spec.folderPath;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function taskOptions(config: OsqConfig): SpawnTaskOptions {
    return {
      projectRoot: tmpDir,
      specFolderPath: specFolder,
      taskNumber: '1',
      taskTitle: 'When opencode v2 runs',
      verifyCommand: 'node -e "process.exit(0)"',
      scope: ['src/a.ts'],
      entry: ['src/a.ts'],
      skills: [],
      tier: 'coding',
      config,
    };
  }

  it('Task argv uses --standalone and folds the variant into the model', async () => {
    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      opencode: { model: 'deepseek/deepseek-flash', variant: 'thinking' },
    };

    const args = await buildOpencodeArgs(taskOptions(config));

    assert.ok(args.includes('--standalone'));
    assert.equal(args.includes('--dir'), false);
    assert.equal(args.includes('--variant'), false);
    const modelIndex = args.indexOf('--model');
    assert.notEqual(modelIndex, -1);
    assert.equal(args[modelIndex + 1], 'deepseek/deepseek-flash#thinking');
  });

  it('Final step usage appends the session remainder as a second tokens event', async () => {
    const bin = await writeFakeOpencode(tmpDir);
    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      opencode: { bin, model: 'deepseek/deepseek-flash' },
    };

    const result = await new OpencodeAdapter().spawn(taskOptions(config));
    assert.equal(result.exitCode, 0);

    const events = await readEvents(specFolder, '1');
    const tools = events.filter((event) => event.type === 'tool');
    const texts = events.filter((event) => event.type === 'text');
    const tokens = events.filter((event) => event.type === 'tokens');

    assert.equal(tools.length, 1);
    assert.equal(tools[0]?.data?.tool, 'read');
    assert.equal(tools[0]?.data?.summary, 'hello.txt');
    assert.equal(texts.length, 1);
    assert.equal(texts[0]?.data?.text, 'banana');
    assert.equal(tokens.length, 2);

    const promptTokens = tokens.reduce(
      (sum, event) => sum + Number(event.data?.promptTokens ?? 0),
      0,
    );
    assert.equal(promptTokens, 9463);
    const cost = tokens.reduce((sum, event) => sum + Number(event.data?.cost ?? 0), 0);
    assert.ok(Math.abs(cost - SESSION_COST) < 1e-12);
  });

  it('A failed session export appends nothing beyond the streamed tokens event', async () => {
    const bin = await writeFakeOpencode(tmpDir, 1);
    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      opencode: { bin, model: 'deepseek/deepseek-flash' },
    };

    const result = await new OpencodeAdapter().spawn(taskOptions(config));
    assert.equal(result.exitCode, 0);

    const events = await readEvents(specFolder, '1');
    const tokens = events.filter((event) => event.type === 'tokens');
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0]?.data?.promptTokens, 8761);
  });

  it('Preflight rejects opencode 1 with the diagnostics failure message and exits 1', async () => {
    const bin = path.join(tmpDir, 'fake-opencode-v1.mjs');
    await fs.writeFile(
      bin,
      `#!${process.execPath}
console.log('1.14.3');
process.exit(0);
`,
      { mode: 0o755 },
    );
    const config: OsqConfig = { ...DEFAULT_CONFIG, opencode: { bin } };

    const originalExit = process.exit;
    const originalError = console.error;
    const originalExitCode = process.exitCode;
    let exitCode: number | undefined;
    const errorLines: string[] = [];
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`PROCESS_EXIT_${exitCode}`);
    }) as unknown as typeof process.exit;
    console.error = (...args: unknown[]) => {
      errorLines.push(args.map(String).join(' '));
    };

    try {
      await assert.rejects(() => preflightOpencode(tmpDir, config), /PROCESS_EXIT_1/);
    } finally {
      process.exit = originalExit;
      console.error = originalError;
      process.exitCode = originalExitCode;
    }

    assert.equal(exitCode, 1);
    assert.ok(
      errorLines.some((line) =>
        line.includes('1.14.3 is not supported; the opencode adapter needs opencode 2'),
      ),
      `expected the unsupported-version message, got: ${JSON.stringify(errorLines)}`,
    );
  });
});
