import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { parseResultSections, readChangeDisclosures } from '../src/core/report/result-sections.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { getArchiveDir } from '../src/core/status/layout.js';
import { MockAdapter } from '../src/harness/mock.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

describe('Result file sections: None however written', () => {
  it('matches headings regardless of case, hashes, spaces, and a trailing colon', () => {
    const content = [
      '## deviated:',
      '',
      'We skipped the migration step.',
      '',
      '## Missing context',
      '',
      'None',
      '',
      '##  Outside Scope',
      '',
      'Found a dead helper outside the task.',
    ].join('\n');

    const sections = parseResultSections(content);

    assert.equal(sections.deviated, 'We skipped the migration step.');
    assert.equal(sections.missingContext, null);
    assert.equal(sections.outsideScope, 'Found a dead helper outside the task.');
    assert.equal(sections.blocked, null);
  });

  it('reads Blocked text and treats a None section as absent without a disclosure', () => {
    const present = parseResultSections(['## blocked:', '', 'Needs the database', ''].join('\n'));
    assert.equal(present.blocked, 'Needs the database');
    assert.equal(present.deviated, null);
    assert.equal(present.missingContext, null);
    assert.equal(present.outsideScope, null);

    const absent = parseResultSections(['## Blocked', '', 'none.', ''].join('\n'));
    assert.equal(absent.blocked, null);
    assert.equal(absent.deviated, null);
    assert.equal(absent.missingContext, null);
    assert.equal(absent.outsideScope, null);
  });

  it('treats None written as a bullet or in bold as absent', () => {
    for (const line of ['- None.', '* **None**', '1. None', '_None_.']) {
      const sections = parseResultSections(`## Changed\n\n${line}\n`);
      assert.equal(sections.changed, null, `expected ${line} to be absent`);
    }
  });

  it('treats None followed straight away by an explanation as absent', () => {
    const explained = ['None; the task is complete.', 'None. All acceptance lines are satisfied.'];
    for (const line of explained) {
      const sections = parseResultSections(`## Deviated\n\n${line}\n`);
      assert.equal(sections.deviated, null, `expected ${line} to be absent`);
    }
  });

  it('keeps a sentence that starts with None as content', () => {
    const content = ['## Blocked', '', 'None of the fixtures exist; I need a seed script', ''].join(
      '\n',
    );

    const sections = parseResultSections(content);

    assert.equal(sections.blocked, 'None of the fixtures exist; I need a seed script');
  });
});

describe('readChangeDisclosures keeps multi-line None sections', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('reads a section with more than one non-blank line as a disclosure', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-none-sections-'));
    const resultsDir = path.join(tmpDir, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(
      path.join(resultsDir, '4.md'),
      ['## Deviated', '', 'None.', '- Renamed the helper.'].join('\n'),
      'utf8',
    );

    assert.deepEqual(await readChangeDisclosures(tmpDir), [
      {
        task: '4',
        deviated: 'None.\n- Renamed the helper.',
        missingContext: null,
        outsideScope: null,
      },
    ]);
  });
});

const VERIFY = 'node verify.cjs';

const PASSING = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const BLOCKED_BULLET_NONE = [
  '# Result for Task 1',
  '',
  '## Changed',
  '',
  'Did the work.',
  '',
  '## Blocked',
  '',
  '- None.',
].join('\n');

type Gates = Partial<NonNullable<OsqConfig['gates']>>;

interface StreamEvent {
  type: string;
  data?: Record<string, unknown>;
}

interface Fixture {
  root: string;
  folder: string;
  runDir: string;
  config: OsqConfig;
  adapter: MockAdapter;
  logger: CaptureLogger;
}

class CaptureLogger implements Logger {
  readonly infos: string[] = [];
  readonly warns: string[] = [];
  readonly errors: string[] = [];
  readonly statuses: string[] = [];
  readonly interactive = false;
  readonly symbols = false;

  info(msg: string): void {
    this.infos.push(msg);
  }
  verbose(_msg: string): void {}
  warn(msg: string): void {
    this.warns.push(msg);
  }
  error(msg: string): void {
    this.errors.push(msg);
  }
  status(text: string): void {
    this.statuses.push(text);
  }
  clearStatus(): void {}
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function writeTask(folder: string): Promise<void> {
  const content = [
    '---',
    'title: A Blocked section that says None as a bullet still verifies',
    `verify: ${VERIFY}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] should be observed',
    '',
  ].join('\n');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), content, 'utf8');
}

async function setup(verifyScript: string, gates: Gates = {}): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-none-blocked-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), verifyScript, 'utf8');

  const spec = await createNewSpec(root, 'Blocked Bullet None');
  const folder = spec.folderPath;
  await writeTask(folder);
  const proposalPath = path.join(folder, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(proposalPath, proposal.replace(/^verify:.*$/m, `verify: ${VERIFY}`), 'utf8');
  await approveSpec(root, '001', DEFAULT_CONFIG);

  const config: OsqConfig = {
    ...DEFAULT_CONFIG,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off', ...gates },
  };
  return {
    root,
    folder,
    runDir: path.join(folder, '.run'),
    config,
    adapter: new MockAdapter(),
    logger: new CaptureLogger(),
  };
}

async function readEvents(folder: string, target = '1'): Promise<StreamEvent[]> {
  const raw = await fs
    .readFile(path.join(folder, '.run', 'events', `${target}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as StreamEvent);
}

async function singleArchived(root: string, config: OsqConfig): Promise<string> {
  const archiveDir = getArchiveDir(config.paths.openspecRoot, root);
  const entries = (await fs.readdir(archiveDir)).sort();
  assert.equal(entries.length, 1, `expected one archived change, got ${entries.join(', ')}`);
  return path.join(archiveDir, entries[0]);
}

describe('Blocked says None as a bullet', () => {
  let fixture: Fixture;

  afterEach(async () => {
    if (fixture) await fs.rm(fixture.root, { recursive: true, force: true });
  });

  it('lets the task verify, finish done, and archive', async () => {
    fixture = await setup(PASSING);
    fixture.adapter.setBehavior({ resultContent: BLOCKED_BULLET_NONE });

    const summary = await runWatcherOnce(
      fixture.root,
      fixture.config,
      fixture.adapter,
      fixture.logger,
    );

    assert.equal(summary.tasksRun, 1);
    assert.equal(summary.specsArchived, 1);
    assert.equal(await exists(path.join(fixture.runDir, 'dead', '1.md')), false);

    const archived = await singleArchived(fixture.root, fixture.config);
    assert.ok(await exists(path.join(archived, '.run', 'done', '1')));
    assert.ok(
      (await readEvents(archived)).some((event) => event.type === 'verify_ran'),
      'a bulleted None Blocked section must not stop the verify',
    );
  });
});
