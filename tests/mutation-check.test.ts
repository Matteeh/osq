import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { MutationConfig } from '../src/core/foundation/config-traceability.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { getArchiveDir } from '../src/core/status/layout.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const QUOTE_FILE = 'src/pricing/quote.ts';
const TEST_FILE = 'tests/pricing-quote.test.ts';
const BULK_TEST = 'tests/pricing-bulk.test.ts';
const SCENARIO = 'Volume discount tiers';
const RAN_LOG = 'mutation-ran.log';

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    await fs.rm(roots.pop() ?? '', { recursive: true, force: true });
  }
  Reflect.deleteProperty(process.env, 'OSQ_FAKE_MODE');
});

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

const QUOTE_SOURCE = [
  '/** The unit price for a quantity tier. */',
  'function tierPrice(quantity: number): number {',
  '  return quantity >= 100 ? 900 : 1000;',
  '}',
  '',
  '/**',
  ' * Price one quote.',
  ' *',
  ` * @scenario pricing: ${SCENARIO}`,
  ' */',
  'export function quote(quantity: number): number {',
  '  return quantity * tierPrice(quantity);',
  '}',
  '',
].join('\n');

const QUOTE_EDITED = QUOTE_SOURCE.replace(
  'return quantity * tierPrice(quantity);',
  'return quantity * tierPrice(quantity) + 0;',
);

const TWO_SOURCE = [
  `/** @scenario pricing: ${SCENARIO} */`,
  'export function quote(quantity: number): number {',
  '  return quantity * 2;',
  '}',
  '',
  `/** @scenario pricing: ${SCENARIO} */`,
  'export function quoteTwo(quantity: number): number {',
  '  return quantity * 3;',
  '}',
  '',
].join('\n');

/** A scenario test file importing `quote` (and optionally `quoteTwo`). */
function testSource(covers: readonly string[] = ['quote']): string {
  return [
    "import { scenario } from '@matteeh/osq/testing';",
    `import { ${covers.join(', ')} } from '../src/pricing/quote.js';`,
    ...covers.map((name) => `scenario('pricing', '${SCENARIO}', { covers: ${name} }, () => {});`),
    '',
  ].join('\n');
}

/** A fake mutation command: records that it ran, then sleeps, fails, or reports. */
const FAKE_MUTATE = [
  "const fs = require('node:fs');",
  "fs.appendFileSync('mutation-ran.log', 'ran\\n');",
  "const mode = process.env.OSQ_FAKE_MODE || 'ok';",
  "if (mode === 'fail') { process.exit(2); }",
  "if (mode === 'sleep') { setInterval(() => {}, 1000); }",
  "else if (mode !== 'no-report') {",
  "  const ranges = JSON.parse(process.env.OSQ_MUTATE || '[]');",
  "  const first = ranges[0] || 'src/x.ts:1-1';",
  '  const at = first.lastIndexOf(":");',
  '  const file = first.slice(0, at);',
  '  const start = Number(first.slice(at + 1).split("-")[0]);',
  '  const mutants = [',
  "    { status: 'Killed', mutatorName: 'ConditionalExpression', replacement: 'false', location: { start: { line: start, column: 1 } } },",
  "    { status: 'Killed', mutatorName: 'ConditionalExpression', replacement: 'true', location: { start: { line: start + 1, column: 1 } } },",
  "    { status: 'Survived', mutatorName: 'ConditionalExpression', replacement: 'false', location: { start: { line: start + 2, column: 3 } } },",
  '  ];',
  '  fs.writeFileSync(process.env.OSQ_MUTATION_REPORT, JSON.stringify({ files: { [file]: { mutants } } }));',
  '}',
  '',
].join('\n');

const TASKS_MD = `# Tasks

- [ ] 1. When a task passes the mutation check records each pick
`;

function taskMarkdown(scope: readonly string[]): string {
  return [
    '---',
    'title: When a task passes the mutation check records each pick',
    'verify: node verify.cjs',
    `scope: ${JSON.stringify(scope)}`,
    'tests:',
    '  modify: true',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] the mutation check records each pick',
    '',
  ].join('\n');
}

interface SetupOptions {
  readonly source: Record<string, string>;
  readonly edits?: Record<string, string>;
  readonly scope: readonly string[];
  readonly mutation?: MutationConfig;
}

interface Project {
  root: string;
  config: OsqConfig;
  adapter: MutatingAdapter;
}

/** Adapter that writes the result file plus every `edits` entry on spawn. */
class MutatingAdapter implements HarnessAdapter {
  readonly name = 'mutating';
  spawnCalls = 0;

  constructor(private readonly edits: Readonly<Record<string, string>>) {}

  async setup(_projectRoot: string, _config: OsqConfig): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.spawnCalls += 1;
    for (const [relative, content] of Object.entries(this.edits)) {
      const target = path.join(options.projectRoot, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, 'utf8');
    }
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(
      path.join(resultsDir, `${options.taskNumber}.md`),
      '# Agent result\n',
      'utf8',
    );
    return { exitCode: 0 };
  }
}

async function writeAll(root: string, files: Record<string, string>): Promise<void> {
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf8');
  }
}

function configWith(options: SetupOptions): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
    traceability: {
      capabilities: ['pricing'],
      mode: 'warn',
      ...(options.mutation === undefined ? {} : { mutation: options.mutation }),
    },
  };
}

/** Scaffold a project, author and approve task 1, and return its adapter. */
async function setupProject(options: SetupOptions): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-mutation-check-'));
  roots.push(root);
  await installFakeValidator(root);
  await scaffoldProject(root);
  await writeAll(root, {
    'verify.cjs': 'process.exit(0);\n',
    'fake-mutate.cjs': FAKE_MUTATE,
    ...options.source,
  });

  const config = configWith(options);
  const spec = await createNewSpec(root, 'Mutation Check');
  await fs.writeFile(path.join(spec.folderPath, 'tasks.md'), TASKS_MD, 'utf8');
  await fs.writeFile(
    path.join(spec.folderPath, 'tasks', '1.md'),
    taskMarkdown(options.scope),
    'utf8',
  );
  const proposalPath = path.join(spec.folderPath, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(
    proposalPath,
    proposal.replace(/^verify:.*$/m, 'verify: node verify.cjs'),
    'utf8',
  );
  await approveSpec(root, '001', config);
  return { root, config, adapter: new MutatingAdapter(options.edits ?? {}) };
}

/** Run one watcher pass with the fake command's mode set for the pass. */
async function runWatcher(project: Project, mode?: string): Promise<void> {
  if (mode !== undefined) process.env.OSQ_FAKE_MODE = mode;
  try {
    await runWatcherOnce(project.root, project.config, project.adapter, undefined);
  } finally {
    Reflect.deleteProperty(process.env, 'OSQ_FAKE_MODE');
  }
}

function parseEvents(raw: string): ParsedEvent[] {
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ParsedEvent);
}

async function archivedEvents(project: Project): Promise<ParsedEvent[]> {
  const archiveDir = getArchiveDir(project.config.paths.openspecRoot, project.root);
  const entries = (await fs.readdir(archiveDir)).sort();
  const raw = await fs
    .readFile(path.join(archiveDir, entries[0] as string, '.run', 'events', '1.jsonl'), 'utf8')
    .catch(() => '');
  return parseEvents(raw);
}

function mutationEvents(events: readonly ParsedEvent[]): ParsedEvent[] {
  return events.filter((event) => event.type === 'mutation_ran');
}

async function ranLogExists(project: Project): Promise<boolean> {
  return fs
    .stat(path.join(project.root, RAN_LOG))
    .then(() => true)
    .catch(() => false);
}

const MUTATION: MutationConfig = { command: 'node fake-mutate.cjs', budgetSeconds: 30 };

describe('mutation check after a passing task', () => {
  it('runs once for a changed covered function with its ranges and tests', async () => {
    const project = await setupProject({
      source: { [QUOTE_FILE]: QUOTE_SOURCE, [TEST_FILE]: testSource() },
      edits: { [QUOTE_FILE]: QUOTE_EDITED },
      scope: [QUOTE_FILE, TEST_FILE],
      mutation: MUTATION,
    });

    await runWatcher(project, 'ok');

    const events = mutationEvents(await archivedEvents(project));
    assert.equal(events.length, 1);
    const data = events[0]?.data ?? {};
    assert.equal(data.outcome, 'measured');
    assert.equal(data.file, QUOTE_FILE);
    assert.equal(data.function, 'quote');
    assert.deepEqual(data.ranges, [`${QUOTE_FILE}:2-4`, `${QUOTE_FILE}:11-13`]);
    assert.deepEqual(data.scenarios, [`pricing: ${SCENARIO}`]);
    assert.deepEqual(data.tests, [TEST_FILE]);
    assert.equal(data.killed, 2);
    assert.equal(data.survived, 1);
    assert.equal(data.invalid, 0);
    assert.deepEqual(data.survivors, [
      {
        file: QUOTE_FILE,
        line: 4,
        column: 3,
        mutator: 'ConditionalExpression',
        replacement: 'false',
      },
    ]);
    assert.equal(await ranLogExists(project), true);
  });

  it('mutates the unchanged function a newly added scenario test covers', async () => {
    const project = await setupProject({
      source: { [QUOTE_FILE]: QUOTE_SOURCE, [TEST_FILE]: testSource() },
      edits: { [BULK_TEST]: testSource() },
      scope: [BULK_TEST],
      mutation: MUTATION,
    });

    await runWatcher(project, 'ok');

    const events = mutationEvents(await archivedEvents(project));
    assert.equal(events.length, 1);
    assert.equal(events[0]?.data?.file, QUOTE_FILE);
    assert.equal(events[0]?.data?.function, 'quote');
    assert.equal(events[0]?.data?.outcome, 'measured');
    assert.deepEqual(events[0]?.data?.tests, [BULK_TEST, TEST_FILE]);
  });

  it('records a pick whose ranges are unknown without running the command', async () => {
    const project = await setupProject({
      source: { [QUOTE_FILE]: QUOTE_SOURCE, [TEST_FILE]: testSource() },
      edits: { [QUOTE_FILE]: QUOTE_SOURCE.replace(/\n}\n$/, '\n') },
      scope: [QUOTE_FILE, TEST_FILE],
      mutation: MUTATION,
    });

    await runWatcher(project, 'ok');

    const events = mutationEvents(await archivedEvents(project));
    assert.equal(events.length, 1);
    assert.equal(events[0]?.data?.outcome, 'not_measured');
    assert.equal(events[0]?.data?.reason, 'range_unknown');
    assert.deepEqual(events[0]?.data?.ranges, []);
    assert.equal(await ranLogExists(project), false);
  });

  it('records an unreadable report as report_invalid', async () => {
    const project = await setupProject({
      source: { [QUOTE_FILE]: QUOTE_SOURCE, [TEST_FILE]: testSource() },
      edits: { [QUOTE_FILE]: QUOTE_EDITED },
      scope: [QUOTE_FILE, TEST_FILE],
      mutation: MUTATION,
    });

    await runWatcher(project, 'no-report');

    const events = mutationEvents(await archivedEvents(project));
    assert.equal(events.length, 1);
    assert.equal(events[0]?.data?.outcome, 'not_measured');
    assert.equal(events[0]?.data?.reason, 'report_invalid');
    assert.equal(await ranLogExists(project), true);
  });

  it('records a broken command and still archives the change', async () => {
    const project = await setupProject({
      source: { [QUOTE_FILE]: QUOTE_SOURCE, [TEST_FILE]: testSource() },
      edits: { [QUOTE_FILE]: QUOTE_EDITED },
      scope: [QUOTE_FILE, TEST_FILE],
      mutation: MUTATION,
    });

    await runWatcher(project, 'fail');

    const events = mutationEvents(await archivedEvents(project));
    assert.equal(events.length, 1);
    assert.equal(events[0]?.data?.outcome, 'not_measured');
    assert.equal(events[0]?.data?.reason, 'command_failed');
    assert.equal(events[0]?.data?.exitCode, 2);
    const archiveDir = getArchiveDir(project.config.paths.openspecRoot, project.root);
    assert.equal((await fs.readdir(archiveDir)).length, 1, 'the change still archived');
  });

  it('records the picks left once the budget runs out', async () => {
    const project = await setupProject({
      source: { [QUOTE_FILE]: TWO_SOURCE, [TEST_FILE]: testSource(['quote', 'quoteTwo']) },
      edits: {
        [QUOTE_FILE]: TWO_SOURCE.replace('quantity * 2', 'quantity * 4').replace(
          'quantity * 3',
          'quantity * 6',
        ),
      },
      scope: [QUOTE_FILE, TEST_FILE],
      mutation: { command: 'node fake-mutate.cjs', budgetSeconds: 1 },
    });

    await runWatcher(project, 'sleep');

    const events = mutationEvents(await archivedEvents(project));
    assert.equal(events.length, 2);
    assert.equal(events[0]?.data?.reason, 'timed_out');
    assert.equal(typeof events[0]?.data?.output, 'string');
    assert.equal(events[1]?.data?.outcome, 'not_measured');
    assert.equal(events[1]?.data?.reason, 'budget');
    assert.equal(await ranLogExists(project), true);
  });

  it('does nothing when mutation is unset', async () => {
    const project = await setupProject({
      source: { [QUOTE_FILE]: QUOTE_SOURCE, [TEST_FILE]: testSource() },
      edits: { [QUOTE_FILE]: QUOTE_EDITED },
      scope: [QUOTE_FILE, TEST_FILE],
    });

    await runWatcher(project);

    const events = mutationEvents(await archivedEvents(project));
    assert.equal(events.length, 0);
    assert.equal(await ranLogExists(project), false);
  });
});
