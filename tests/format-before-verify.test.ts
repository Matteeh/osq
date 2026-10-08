import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { approveSpec } from '../src/core/spec/approve.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { hashFileForMeasures } from '../src/watcher/measures.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

const TASKS_MD = `# Tasks

- [ ] 1. When formatting applies, the watcher formats before verify
`;

const A_BEFORE = 'export const a = 1;\n';
const C_BEFORE = 'export const c = 3;\n';
const FORMATTED = 'export const a = 1;\n// formatted\n';

function proposalFor(verify: string): string {
  return `---
title: Format before verify
depends_on: []
verify: ${verify}
features:
  reads: []
---
## Goal

Exercise the format-before-verify step.

## Surface

None.
`;
}

/** Config with retries and the pre-spawn verify off, optionally setting the format command. */
function formatConfig(formatCommand?: string): OsqConfig {
  return defineConfig({
    gates: {
      preSpawnVerify: 'off',
      autoRetries: 0,
      ...(formatCommand === undefined ? {} : { formatCommand }),
    },
  });
}

/** Adapter that mutates the project while "running", then writes a result file. */
class FormatAdapter implements HarnessAdapter {
  readonly name = 'format-test';

  constructor(
    private readonly mutate: (projectRoot: string) => Promise<void>,
    private readonly resultBody = '# Agent result\n',
  ) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await this.mutate(options.projectRoot);
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, `${options.taskNumber}.md`), this.resultBody, 'utf8');
    return { exitCode: 0 };
  }
}

/** Logger that records every `warn` line so a test can assert exactly one fired. */
class RecordingLogger implements Logger {
  readonly warns: string[] = [];
  info(): void {}
  verbose(): void {}
  warn(msg: string): void {
    this.warns.push(msg);
  }
  error(): void {}
  status(): void {}
  clearStatus(): void {}
}

async function readEvents(specFolder: string, taskNumber: string): Promise<ParsedEvent[]> {
  const eventFilePath = path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`);
  let raw = '';
  try {
    raw = await fs.readFile(eventFilePath, 'utf8');
  } catch {
    return [];
  }
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

describe('Format before verify', () => {
  let tmpDir: string;
  let specFolder: string;

  async function writeScript(name: string, lines: string[]): Promise<void> {
    await fs.writeFile(path.join(tmpDir, name), `${lines.join('\n')}\n`, 'utf8');
  }

  async function writeChangeFolder(): Promise<void> {
    await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
    await fs.writeFile(
      path.join(specFolder, 'proposal.md'),
      proposalFor('node verify.cjs'),
      'utf8',
    );
    await fs.writeFile(path.join(specFolder, 'tasks.md'), TASKS_MD, 'utf8');
  }

  async function writeTask(scope: string[], verify = 'node verify.cjs'): Promise<void> {
    const lines = [
      '---',
      'title: When formatting applies, the watcher formats before verify',
      `verify: ${verify}`,
      `scope: [${scope.join(', ')}]`,
      'entry: []',
      'skills: []',
      '---',
      '## Acceptance',
      '- [ ] formatting runs before verify',
    ];
    await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), `${lines.join('\n')}\n`, 'utf8');
  }

  async function readFormatArgs(): Promise<string[]> {
    const raw = await fs.readFile(path.join(tmpDir, 'fmt-args.json'), 'utf8');
    return JSON.parse(raw.trim()) as string[];
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-format-before-verify-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    specFolder = path.join(tmpDir, 'openspec', 'changes', '001-format');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('formats changed scoped files and the verify sees the formatted content', async () => {
    await writeScript('fmt.cjs', [
      "const fs = require('node:fs');",
      "fs.appendFileSync('fmt-args.json', JSON.stringify(process.argv.slice(2)) + '\\n');",
      'for (const file of process.argv.slice(2)) {',
      "  fs.appendFileSync(file, '// formatted\\n');",
      '}',
    ]);
    await writeScript('verify.cjs', [
      "const fs = require('node:fs');",
      "for (const file of ['src/a.ts', 'src/b.ts']) {",
      "  if (!fs.readFileSync(file, 'utf8').includes('// formatted')) process.exit(1);",
      '}',
    ]);
    await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), A_BEFORE, 'utf8');
    await fs.writeFile(path.join(tmpDir, 'src', 'c.ts'), C_BEFORE, 'utf8');
    await writeChangeFolder();
    await writeTask(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    const config = formatConfig('node fmt.cjs {files}');
    await approveSpec(tmpDir, '001', config);

    const adapter = new FormatAdapter(async (root) => {
      await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 2;\n', 'utf8');
      await fs.writeFile(path.join(root, 'src', 'b.ts'), 'export const b = 1;\n', 'utf8');
    });

    const result = await runTask(tmpDir, specFolder, '1', config, adapter);
    assert.equal(result.success, true);

    assert.deepEqual(await readFormatArgs(), ['src/a.ts', 'src/b.ts']);
    assert.equal(await fs.readFile(path.join(tmpDir, 'src', 'c.ts'), 'utf8'), C_BEFORE);

    const events = await readEvents(specFolder, '1');
    const formatEvents = events.filter((event) => event.type === 'format_ran');
    assert.equal(formatEvents.length, 1);
    assert.deepEqual(formatEvents[0].data?.files, ['src/a.ts', 'src/b.ts']);
    assert.equal(formatEvents[0].data?.exitCode, 0);
    assert.equal(formatEvents[0].data?.command, "node fmt.cjs 'src/a.ts' 'src/b.ts'");
    assert.equal(
      events.some((event) => event.type === 'verify_ran'),
      true,
    );
  });

  it('never passes a deleted scoped file or a file outside the scope', async () => {
    await writeScript('fmt.cjs', [
      "const fs = require('node:fs');",
      "fs.appendFileSync('fmt-args.json', JSON.stringify(process.argv.slice(2)) + '\\n');",
      'for (const file of process.argv.slice(2)) {',
      "  fs.appendFileSync(file, '// formatted\\n');",
      '}',
    ]);
    await writeScript('verify.cjs', [
      "const fs = require('node:fs');",
      "if (!fs.readFileSync('src/a.ts', 'utf8').includes('// formatted')) process.exit(1);",
    ]);
    await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), A_BEFORE, 'utf8');
    await fs.writeFile(path.join(tmpDir, 'src', 'old.ts'), 'export const old = 0;\n', 'utf8');
    await writeChangeFolder();
    await writeTask(['src/old.ts', 'src/a.ts']);
    const config = formatConfig('node fmt.cjs {files}');
    await approveSpec(tmpDir, '001', config);

    const adapter = new FormatAdapter(async (root) => {
      await fs.rm(path.join(root, 'src', 'old.ts'));
      await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 9;\n', 'utf8');
      await fs.mkdir(path.join(root, 'tests'), { recursive: true });
      await fs.writeFile(path.join(root, 'tests', 'new.test.ts'), '// new\n', 'utf8');
    });

    const result = await runTask(tmpDir, specFolder, '1', config, adapter);
    assert.equal(result.success, true);
    assert.deepEqual(await readFormatArgs(), ['src/a.ts']);

    const events = await readEvents(specFolder, '1');
    const formatEvents = events.filter((event) => event.type === 'format_ran');
    assert.equal(formatEvents.length, 1);
    assert.deepEqual(formatEvents[0].data?.files, ['src/a.ts']);
  });

  it('records the formatted content in the done marker scope hashes', async () => {
    await writeScript('fmt-write.cjs', [
      "const fs = require('node:fs');",
      `for (const file of process.argv.slice(2)) fs.writeFileSync(file, ${JSON.stringify(FORMATTED)});`,
    ]);
    await writeScript('verify.cjs', [
      "const fs = require('node:fs');",
      `if (fs.readFileSync('src/a.ts', 'utf8') !== ${JSON.stringify(FORMATTED)}) process.exit(1);`,
    ]);
    await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), A_BEFORE, 'utf8');
    await writeChangeFolder();
    await writeTask(['src/a.ts']);
    const config = formatConfig('node fmt-write.cjs {files}');
    await approveSpec(tmpDir, '001', config);

    const adapter = new FormatAdapter(async (root) => {
      await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 7;\n', 'utf8');
    });

    const result = await runTask(tmpDir, specFolder, '1', config, adapter);
    assert.equal(result.success, true);

    const done = await fs.readFile(path.join(specFolder, '.run', 'done', '1'), 'utf8');
    const match = /^scope_files: (.+)$/m.exec(done);
    assert.ok(match, done);
    const scopeFiles = JSON.parse(match[1]) as Record<string, string | null>;
    const formattedHash = `sha256:${crypto.createHash('sha256').update(FORMATTED, 'utf8').digest('hex')}`;
    assert.equal(scopeFiles['src/a.ts'], formattedHash);
    assert.equal(
      scopeFiles['src/a.ts'],
      await hashFileForMeasures(path.join(tmpDir, 'src', 'a.ts')),
    );
  });

  it('lets a failing format command be logged and the verify still decide', async () => {
    await writeScript('fmt-fail.cjs', [
      "const fs = require('node:fs');",
      "fs.appendFileSync('fmt-args.json', JSON.stringify(process.argv.slice(2)) + '\\n');",
      'process.exit(1);',
    ]);
    await writeScript('verify.cjs', ['process.exit(0);']);
    await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), A_BEFORE, 'utf8');
    await writeChangeFolder();
    await writeTask(['src/a.ts']);
    const config = formatConfig('node fmt-fail.cjs {files}');
    await approveSpec(tmpDir, '001', config);

    const logger = new RecordingLogger();
    const adapter = new FormatAdapter(async (root) => {
      await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 4;\n', 'utf8');
    });

    const result = await runTask(tmpDir, specFolder, '1', config, adapter, logger);
    assert.equal(result.success, true);
    assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), true);

    const events = await readEvents(specFolder, '1');
    const formatEvents = events.filter((event) => event.type === 'format_ran');
    assert.equal(formatEvents.length, 1);
    assert.equal(formatEvents[0].data?.exitCode, 1);

    assert.equal(logger.warns.length, 1);
    assert.match(logger.warns[0], /1/);
  });

  it('runs nothing when no format command is set', async () => {
    await writeScript('verify.cjs', ['process.exit(0);']);
    await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), A_BEFORE, 'utf8');
    await writeChangeFolder();
    await writeTask(['src/a.ts']);
    const config = formatConfig();
    await approveSpec(tmpDir, '001', config);

    const adapter = new FormatAdapter(async (root) => {
      await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 5;\n', 'utf8');
    });

    const result = await runTask(tmpDir, specFolder, '1', config, adapter);
    assert.equal(result.success, true);

    const events = await readEvents(specFolder, '1');
    assert.equal(
      events.some((event) => event.type === 'format_ran'),
      false,
    );
    assert.equal(await exists(path.join(tmpDir, 'fmt-args.json')), false);
  });

  it('runs nothing when the agent changed no scoped file', async () => {
    await writeScript('fmt.cjs', [
      "const fs = require('node:fs');",
      "fs.appendFileSync('fmt-args.json', JSON.stringify(process.argv.slice(2)) + '\\n');",
    ]);
    await writeScript('verify.cjs', ['process.exit(0);']);
    await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), A_BEFORE, 'utf8');
    await writeChangeFolder();
    await writeTask(['src/a.ts']);
    const config = formatConfig('node fmt.cjs {files}');
    await approveSpec(tmpDir, '001', config);

    const adapter = new FormatAdapter(async () => {});

    const result = await runTask(tmpDir, specFolder, '1', config, adapter);
    assert.equal(result.success, true);

    const events = await readEvents(specFolder, '1');
    assert.equal(
      events.some((event) => event.type === 'format_ran'),
      false,
    );
    assert.equal(await exists(path.join(tmpDir, 'fmt-args.json')), false);
  });

  it('runs no format command for a blocked task', async () => {
    await writeScript('fmt.cjs', [
      "const fs = require('node:fs');",
      "fs.appendFileSync('fmt-args.json', JSON.stringify(process.argv.slice(2)) + '\\n');",
    ]);
    await writeScript('verify.cjs', ['process.exit(0);']);
    await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), A_BEFORE, 'utf8');
    await writeChangeFolder();
    await writeTask(['src/a.ts']);
    const config = formatConfig('node fmt.cjs {files}');
    await approveSpec(tmpDir, '001', config);

    const adapter = new FormatAdapter(async (root) => {
      await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 6;\n', 'utf8');
    }, '## Blocked\n\nNeeds src/b.ts in scope\n');

    const result = await runTask(tmpDir, specFolder, '1', config, adapter);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'blocked');

    const events = await readEvents(specFolder, '1');
    assert.equal(
      events.some((event) => event.type === 'format_ran'),
      false,
    );
    assert.equal(await exists(path.join(tmpDir, 'fmt-args.json')), false);
  });
});
