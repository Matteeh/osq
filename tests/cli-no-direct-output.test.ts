import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { approveCommand } from '../src/cli/approve.js';
import { capabilityRenameCommand, capabilitySplitCommand } from '../src/cli/capability.js';
import type { CommandInputs } from '../src/cli/command-inputs.js';
import { digestCommand } from '../src/cli/digest.js';
import { doctorCommand } from '../src/cli/doctor.js';
import { graphCommand } from '../src/cli/graph.js';
import { inboxDispatchCommand } from '../src/cli/inbox-dispatch.js';
import { inboxCommand } from '../src/cli/inbox.js';
import { initCommand } from '../src/cli/init.js';
import { landCommand } from '../src/cli/land.js';
import { lintCommand } from '../src/cli/lint.js';
import { messageCommand } from '../src/cli/message.js';
import { migrateCommand } from '../src/cli/migrate.js';
import { newCommand } from '../src/cli/new.js';
import { planCommand } from '../src/cli/plan.js';
import { queryCommand } from '../src/cli/query.js';
import { queueCommand } from '../src/cli/queue.js';
import { rejectCommand } from '../src/cli/reject.js';
import { reportCommand } from '../src/cli/report.js';
import { retryCommand } from '../src/cli/retry.js';
import { browserCommand, serveCommand } from '../src/cli/serve.js';
import { setupCommand } from '../src/cli/setup.js';
import { showCommand } from '../src/cli/show.js';
import { specCommand } from '../src/cli/spec.js';
import { statusCommand } from '../src/cli/status.js';
import { syncCommand } from '../src/cli/sync.js';
import { watchCommand } from '../src/cli/watch.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLI_DIR = path.join(ROOT, 'src', 'cli');
/** The one file allowed to write to the process streams directly. */
const EXEMPT = new Set([path.join(CLI_DIR, 'command-inputs.ts')]);

/**
 * The command table: one entry per exported function named `*Command` that is
 * not a `register...Command`. Every command's entry receives the command
 * inputs in its options position, so the CLI typecheck fails when a command
 * does not accept them. The entries are never run.
 */
const COMMANDS: Record<string, (inputs: CommandInputs) => unknown> = {
  approveCommand: (inputs) => approveCommand([], inputs),
  browserCommand: () => browserCommand('linux', 'http://localhost'),
  capabilityRenameCommand: (inputs) =>
    capabilityRenameCommand('old', 'new', { ...inputs, change: 'id' }),
  capabilitySplitCommand: (inputs) =>
    capabilitySplitCommand('old', 'map.yml', { ...inputs, change: 'id' }),
  digestCommand: (inputs) => digestCommand({ ...inputs, ids: [] }),
  doctorCommand: (inputs) => doctorCommand(inputs),
  graphCommand: (inputs) => graphCommand(inputs),
  inboxCommand: (inputs) => inboxCommand(inputs),
  inboxDispatchCommand: (inputs) => inboxDispatchCommand(inputs),
  initCommand: (inputs) => initCommand(inputs),
  landCommand: (inputs) => landCommand('id', inputs),
  lintCommand: (inputs) => lintCommand([], inputs),
  messageCommand: (inputs) => messageCommand('id', inputs),
  migrateCommand: (inputs) => migrateCommand('openspec', inputs),
  newCommand: (inputs) => newCommand('name', inputs),
  planCommand: (inputs) => planCommand(undefined, inputs),
  queryCommand: (inputs) => queryCommand(inputs),
  queueCommand: (inputs) => queueCommand(inputs),
  rejectCommand: (inputs) => rejectCommand('id', { ...inputs, reason: 'reason' }),
  reportCommand: (inputs) => reportCommand(inputs),
  retryCommand: (inputs) => retryCommand('id', 'target', inputs),
  serveCommand: (inputs) => serveCommand(inputs),
  setupCommand: (inputs) => setupCommand(inputs),
  showCommand: (inputs) => showCommand('id', inputs),
  specCommand: (inputs) => specCommand(undefined, undefined, inputs),
  statusCommand: (inputs) => statusCommand(inputs),
  syncCommand: (inputs) => syncCommand('id', inputs),
  watchCommand: (inputs) => watchCommand(inputs),
};

/** One direct-write pattern and the label a violation reports. */
const DIRECT_WRITES: ReadonlyArray<{ readonly rule: string; readonly pattern: RegExp }> = [
  { rule: 'console.', pattern: /\bconsole\./ },
  { rule: 'process.stdout.write', pattern: /\bprocess\.stdout\.write/ },
  { rule: 'process.stderr.write', pattern: /\bprocess\.stderr\.write/ },
];

/** An exported function whose name ends in `Command`, whether async or not. */
const COMMAND_EXPORT = /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*Command)\b/g;

/**
 * Blank every `//` and block comment out of `source`, preserving newlines so
 * reported line numbers still point at the original file.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
}

/** One direct write `source` breaks, with the rule that matched and its line. */
interface DirectWrite {
  readonly rule: string;
  readonly line: number;
}

/** Every direct write in `source`, one entry per matched rule and line. */
function findDirectWrites(source: string): DirectWrite[] {
  const found: DirectWrite[] = [];
  stripComments(source)
    .split('\n')
    .forEach((line, index) => {
      for (const { rule, pattern } of DIRECT_WRITES) {
        if (pattern.test(line)) found.push({ rule, line: index + 1 });
      }
    });
  return found;
}

/** Every exported `*Command` function in `source` except `register...Command`. */
function exportedCommandNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of stripComments(source).matchAll(COMMAND_EXPORT)) {
    const name = match[1];
    if (!name.startsWith('register')) names.add(name);
  }
  return [...names];
}

/** The exported command names a table of `known` names lacks, in source order. */
function missingCommands(exported: readonly string[], known: readonly string[]): string[] {
  const table = new Set(known);
  return exported.filter((name) => !table.has(name));
}

/** Recursively collect every `.ts` file under `dir`. */
async function listTypeScriptFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTypeScriptFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Every exported `*Command` function under `src/cli/`. */
async function exportedCommands(): Promise<string[]> {
  const names = new Set<string>();
  for (const file of await listTypeScriptFiles(CLI_DIR)) {
    for (const name of exportedCommandNames(await fs.readFile(file, 'utf8'))) {
      names.add(name);
    }
  }
  return [...names];
}

describe('commands print through their inputs', () => {
  it('finds no direct process or console write under src/cli except command-inputs.ts', async () => {
    const offenders: string[] = [];
    for (const file of await listTypeScriptFiles(CLI_DIR)) {
      if (EXEMPT.has(file)) continue;
      const violations = findDirectWrites(await fs.readFile(file, 'utf8'));
      if (violations.length > 0) {
        const rules = violations.map((violation) => `${violation.rule} (line ${violation.line})`);
        offenders.push(`${path.relative(ROOT, file)}: ${rules.join(', ')}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `Commands must print through their writers:\n${offenders.join('\n')}`,
    );
  });

  it('catches a sample of each direct write', () => {
    assert.deepEqual(findDirectWrites('console.log("x");\n'), [{ rule: 'console.', line: 1 }]);
    assert.deepEqual(findDirectWrites('process.stdout.write("x");\n'), [
      { rule: 'process.stdout.write', line: 1 },
    ]);
    assert.deepEqual(findDirectWrites('process.stderr.write("x");\n'), [
      { rule: 'process.stderr.write', line: 1 },
    ]);
  });

  it('ignores direct writes inside comments', () => {
    assert.deepEqual(findDirectWrites('// console.log("x");\n'), []);
    assert.deepEqual(findDirectWrites('/* process.stdout.write("x"); */\n'), []);
  });

  it('has a typed entry for every exported command function under src/cli', async () => {
    const missing = missingCommands(await exportedCommands(), Object.keys(COMMANDS));
    assert.deepEqual(
      missing,
      [],
      `Command functions must accept CommandInputs and appear in the table:\n${missing.join('\n')}`,
    );
  });

  it('reports an exported command function the table lacks', () => {
    const source = 'export async function ghostCommand(): Promise<void> {}\n';
    assert.deepEqual(exportedCommandNames(source), ['ghostCommand']);
    assert.deepEqual(missingCommands(exportedCommandNames(source), ['approveCommand']), [
      'ghostCommand',
    ]);
  });

  it('ignores a register function', () => {
    assert.deepEqual(exportedCommandNames('export function registerGhostCommand(): void {}\n'), []);
  });
});
