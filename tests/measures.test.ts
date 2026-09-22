import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { parseTaskMd } from '../src/core/spec/parser.js';
import { MockAdapter } from '../src/harness/mock.js';
import type {
  HarnessAdapter,
  MeasuresEventData,
  SpawnResult,
  SpawnTaskOptions,
} from '../src/harness/types.js';
import {
  countDeltaRequirementsAndScenarios,
  countImportFanIn,
  countWords,
  emitMeasures,
  gatherEndMeasures,
  gatherRepoCounts,
  gatherScopeCounts,
  gatherStartMeasures,
  hashFileForMeasures,
  snapshotScope,
  snapshotScopeHashes,
} from '../src/watcher/measures.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

/** Test adapter that edits a scoped file before reporting a successful exit. */
class ScopeWritingAdapter implements HarnessAdapter {
  readonly name = 'scope-writer';
  constructor(
    private readonly target: string,
    private readonly content: string,
  ) {}

  async setup(): Promise<void> {}
  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await fs.writeFile(path.join(options.projectRoot, this.target), this.content, 'utf8');
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, `${options.taskNumber}.md`), '# done\n', 'utf8');
    return { exitCode: 0 };
  }
}

async function readMeasuresEvents(
  specFolder: string,
  taskNumber = '1',
): Promise<MeasuresEventData[]> {
  const raw = await fs.readFile(
    path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`),
    'utf8',
  );
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as { type: string; data: MeasuresEventData })
    .filter((event) => event.type === 'measures')
    .map((event) => event.data);
}

function sha256(content: string): string {
  return `sha256:${crypto.createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

function startMeasureData(overrides: Partial<MeasuresEventData> = {}): MeasuresEventData {
  return {
    phase: 'start',
    scopeResolver: 2,
    scopeFiles: 2,
    scopeLines: 10,
    repoFiles: 100,
    repoLines: 1000,
    importFanIn: 3,
    proposalWords: 20,
    taskWords: 30,
    deltaRequirements: 1,
    deltaScenarios: 2,
    ...overrides,
  };
}

describe('measures', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-measures-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('countWords', () => {
    it('returns 0 for empty and whitespace-only input', () => {
      assert.equal(countWords(''), 0);
      assert.equal(countWords('   \n\t '), 0);
    });

    it('counts single and multiple whitespace-delimited words', () => {
      assert.equal(countWords('hello'), 1);
      assert.equal(countWords('hello world'), 2);
      assert.equal(countWords('a\nb\tc  d'), 4);
    });
  });

  describe('gatherScopeCounts', () => {
    it('counts existing scoped files and their lines, ignoring missing ones', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.ts'), 'one\ntwo', 'utf8');
      await fs.writeFile(path.join(tmpDir, 'b.ts'), 'x\n', 'utf8');

      const counts = await gatherScopeCounts(tmpDir, ['a.ts', 'b.ts', 'missing.ts']);

      assert.deepEqual(counts, { files: 2, lines: 4 });
    });

    it('returns zeros when no scoped file exists', async () => {
      assert.deepEqual(await gatherScopeCounts(tmpDir, ['ghost.ts']), { files: 0, lines: 0 });
    });

    it('counts each file a glob resolves and zero for an unmatched glob', async () => {
      await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), 'one\ntwo', 'utf8');
      await fs.writeFile(path.join(tmpDir, 'src', 'b.ts'), 'three', 'utf8');

      const counts = await gatherScopeCounts(tmpDir, [
        'src/*.ts',
        'src/b.ts',
        'absent/*.ts',
        'missing.ts',
      ]);

      // One glob matching two files, one exact duplicate, one unmatched glob,
      // and one exact missing path: exactly the two resolved files count.
      assert.deepEqual(counts, { files: 2, lines: 3 });
    });
  });

  describe('gatherRepoCounts', () => {
    it('totals text files while skipping ignored directories', async () => {
      await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), 'a\n', 'utf8');
      await fs.writeFile(path.join(tmpDir, 'notes.txt'), 'hello', 'utf8');

      await fs.mkdir(path.join(tmpDir, 'node_modules', 'pkg'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'node_modules', 'pkg', 'index.js'), 'junk\n', 'utf8');
      await fs.mkdir(path.join(tmpDir, '.git'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, '.git', 'config'), 'ignored\n', 'utf8');
      await fs.mkdir(path.join(tmpDir, 'dist'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'dist', 'out.js'), 'ignored\n', 'utf8');

      const counts = await gatherRepoCounts(tmpDir);

      assert.deepEqual(counts, { files: 2, lines: 3 });
    });

    it('skips binary files containing null bytes', async () => {
      await fs.writeFile(path.join(tmpDir, 'text.txt'), 'a\nb', 'utf8');
      await fs.writeFile(path.join(tmpDir, 'blob.bin'), Buffer.from([1, 0, 2, 3]));

      const counts = await gatherRepoCounts(tmpDir);

      assert.deepEqual(counts, { files: 1, lines: 2 });
    });
  });

  describe('countImportFanIn', () => {
    it('counts non-scoped files that import a scoped file', async () => {
      await fs.mkdir(path.join(tmpDir, 'src', 'core'), { recursive: true });
      await fs.mkdir(path.join(tmpDir, 'src', 'other'), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'src', 'core', 'foo.ts'),
        'export const foo = 1;\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(tmpDir, 'src', 'core', 'bar.ts'),
        "import { foo } from './foo.js';\n",
        'utf8',
      );
      await fs.writeFile(
        path.join(tmpDir, 'src', 'other', 'baz.ts'),
        "import { foo } from '../core/foo.js';\n",
        'utf8',
      );
      await fs.writeFile(
        path.join(tmpDir, 'src', 'other', 'none.ts'),
        'export const none = true;\n',
        'utf8',
      );

      const fanIn = await countImportFanIn(tmpDir, ['src/core/foo.ts']);

      assert.equal(fanIn, 2);
    });

    it('returns 0 when only scoped files import each other', async () => {
      await fs.mkdir(path.join(tmpDir, 'src', 'core'), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'src', 'core', 'foo.ts'),
        "import { bar } from './bar.js';\n",
        'utf8',
      );
      await fs.writeFile(
        path.join(tmpDir, 'src', 'core', 'bar.ts'),
        "import { foo } from './foo.js';\n",
        'utf8',
      );

      const fanIn = await countImportFanIn(tmpDir, ['src/core/foo.ts', 'src/core/bar.ts']);

      assert.equal(fanIn, 0);
    });

    it('resolves a glob into its real import targets instead of the literal glob text', async () => {
      await fs.mkdir(path.join(tmpDir, 'src', 'core'), { recursive: true });
      await fs.mkdir(path.join(tmpDir, 'src', 'other'), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'src', 'core', 'foo.ts'),
        'export const foo = 1;\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(tmpDir, 'src', 'other', 'baz.ts'),
        "import { foo } from '../core/foo.js';\n",
        'utf8',
      );

      const fanIn = await countImportFanIn(tmpDir, ['src/core/*.ts']);

      assert.equal(fanIn, 1);
    });
  });

  describe('countDeltaRequirementsAndScenarios', () => {
    it('counts requirement and scenario headers across delta specs', async () => {
      const specFolder = path.join(tmpDir, 'change');
      await fs.mkdir(path.join(specFolder, 'specs', 'cap-a'), { recursive: true });
      await fs.mkdir(path.join(specFolder, 'specs', 'cap-b'), { recursive: true });
      await fs.writeFile(
        path.join(specFolder, 'specs', 'cap-a', 'spec.md'),
        [
          '## ADDED Requirements',
          '### Requirement: One',
          '#### Scenario: A',
          '#### Scenario: B',
          '### Requirement: Two',
          '#### Scenario: C',
        ].join('\n'),
        'utf8',
      );
      await fs.writeFile(
        path.join(specFolder, 'specs', 'cap-b', 'spec.md'),
        ['### Requirement: Three', '#### Scenario: D'].join('\n'),
        'utf8',
      );

      const counts = await countDeltaRequirementsAndScenarios(specFolder);

      assert.deepEqual(counts, { requirements: 3, scenarios: 4 });
    });

    it('returns zeros when no delta specs exist', async () => {
      assert.deepEqual(await countDeltaRequirementsAndScenarios(tmpDir), {
        requirements: 0,
        scenarios: 0,
      });
    });
  });

  describe('snapshotScopeHashes and hashFileForMeasures', () => {
    it('hashes known content and returns null for missing files', async () => {
      await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), 'known content', 'utf8');
      await fs.writeFile(path.join(tmpDir, 'b.ts'), 'other', 'utf8');

      const hashes = await snapshotScopeHashes(tmpDir, ['src/a.ts', 'b.ts', 'missing.ts']);

      assert.equal(hashes['src/a.ts'], sha256('known content'));
      assert.equal(hashes['b.ts'], sha256('other'));
      assert.equal(hashes['missing.ts'], null);
      assert.ok(hashes['src/a.ts']?.startsWith('sha256:'));
    });

    it('hashFileForMeasures returns null for an absent file', async () => {
      assert.equal(await hashFileForMeasures(path.join(tmpDir, 'nope.ts')), null);
    });

    it('keeps an exact missing path as null and omits unmatched globs', async () => {
      await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), 'content', 'utf8');

      const hashes = await snapshotScopeHashes(tmpDir, ['src/*.ts', 'src/missing.ts', 'gone/*.ts']);

      assert.deepEqual(Object.keys(hashes).sort(), ['src/a.ts', 'src/missing.ts']);
      assert.equal(hashes['src/a.ts'], sha256('content'));
      assert.equal(hashes['src/missing.ts'], null);
    });
  });

  describe('gatherEndMeasures', () => {
    it('counts changed files and absolute line deltas for modified, added, and deleted files', async () => {
      await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'src', 'modified.ts'), 'a\nb\nc', 'utf8');
      await fs.writeFile(path.join(tmpDir, 'src', 'deleted.ts'), 'x\ny\nz\nw', 'utf8');
      const scope = ['src/modified.ts', 'src/added.ts', 'src/deleted.ts'];
      const before = await snapshotScope(tmpDir, scope);

      await fs.writeFile(path.join(tmpDir, 'src', 'modified.ts'), 'a\nb\nc\nd\ne', 'utf8');
      await fs.writeFile(path.join(tmpDir, 'src', 'added.ts'), 'new', 'utf8');
      await fs.rm(path.join(tmpDir, 'src', 'deleted.ts'));

      const end = await gatherEndMeasures(startMeasureData(), before, tmpDir, scope);

      assert.equal(end.phase, 'end');
      assert.equal(end.changedFiles, 3);
      assert.equal(end.changedLines, 7);
      assert.deepEqual(end.scopeHashes?.['src/modified.ts'], {
        before: sha256('a\nb\nc'),
        after: sha256('a\nb\nc\nd\ne'),
      });
      assert.deepEqual(end.scopeHashes?.['src/added.ts'], { before: null, after: sha256('new') });
      assert.deepEqual(end.scopeHashes?.['src/deleted.ts'], {
        before: sha256('x\ny\nz\nw'),
        after: null,
      });
    });

    it('re-resolves a glob at end so added, modified, and deleted matches are visible', async () => {
      await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'src', 'kept.ts'), 'same', 'utf8');
      await fs.writeFile(path.join(tmpDir, 'src', 'modified.ts'), 'a\nb', 'utf8');
      await fs.writeFile(path.join(tmpDir, 'src', 'deleted.ts'), 'x\ny\nz', 'utf8');
      const scope = ['src/*.ts'];
      const before = await snapshotScope(tmpDir, scope);

      await fs.writeFile(path.join(tmpDir, 'src', 'kept.ts'), 'same', 'utf8');
      await fs.writeFile(path.join(tmpDir, 'src', 'modified.ts'), 'a\nb\nc\nd', 'utf8');
      await fs.rm(path.join(tmpDir, 'src', 'deleted.ts'));
      await fs.writeFile(path.join(tmpDir, 'src', 'added.ts'), 'new', 'utf8');

      const end = await gatherEndMeasures(startMeasureData(), before, tmpDir, scope);

      assert.equal(end.changedFiles, 3);
      assert.equal(end.changedLines, 6);
      assert.deepEqual(Object.keys(end.scopeHashes ?? {}).sort(), [
        'src/added.ts',
        'src/deleted.ts',
        'src/kept.ts',
        'src/modified.ts',
      ]);
      assert.deepEqual(end.scopeHashes?.['src/added.ts'], { before: null, after: sha256('new') });
      assert.deepEqual(end.scopeHashes?.['src/deleted.ts'], {
        before: sha256('x\ny\nz'),
        after: null,
      });
      assert.deepEqual(end.scopeHashes?.['src/kept.ts'], {
        before: sha256('same'),
        after: sha256('same'),
      });
    });

    it('reports zero changes and equal before/after hashes when scope is untouched', async () => {
      await fs.writeFile(path.join(tmpDir, 'stable.ts'), 'unchanged', 'utf8');
      const before = await snapshotScope(tmpDir, ['stable.ts']);

      const end = await gatherEndMeasures(startMeasureData(), before, tmpDir, ['stable.ts']);

      assert.equal(end.changedFiles, 0);
      assert.equal(end.changedLines, 0);
      assert.deepEqual(end.scopeHashes?.['stable.ts'], {
        before: sha256('unchanged'),
        after: sha256('unchanged'),
      });
    });

    it('carries every start-phase field into the end event', async () => {
      const before = await snapshotScope(tmpDir, []);
      const end = await gatherEndMeasures(
        startMeasureData({ scopeFiles: 9, repoLines: 42 }),
        before,
        tmpDir,
        [],
      );

      assert.equal(end.scopeFiles, 9);
      assert.equal(end.repoLines, 42);
      assert.equal(end.importFanIn, 3);
      assert.equal(end.deltaRequirements, 1);
      assert.equal(end.deltaScenarios, 2);
    });
  });

  describe('emitMeasures', () => {
    async function readEvents(specFolder: string): Promise<Record<string, unknown>[]> {
      const raw = await fs.readFile(path.join(specFolder, '.run', 'events', '1.jsonl'), 'utf8');
      return raw
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    }

    it('appends a measures start event to .run/events/<n>.jsonl', async () => {
      const specFolder = path.join(tmpDir, 'change');

      await emitMeasures(specFolder, '1', startMeasureData());

      const events = await readEvents(specFolder);
      assert.equal(events.length, 1);
      assert.equal(events[0].type, 'measures');
      assert.equal(typeof events[0].timestamp, 'string');
      assert.deepEqual(events[0].data, startMeasureData());
    });

    it('uses one emission path for both start and end phases', async () => {
      const specFolder = path.join(tmpDir, 'change');
      const endData = startMeasureData({
        phase: 'end',
        changedFiles: 1,
        changedLines: 4,
        scopeHashes: { 'src/a.ts': { before: sha256('a'), after: sha256('b') } },
      });

      await emitMeasures(specFolder, '1', startMeasureData());
      await emitMeasures(specFolder, '1', endData);

      const events = await readEvents(specFolder);
      assert.deepEqual(
        events.map((event) => (event.data as MeasuresEventData).phase),
        ['start', 'end'],
      );
    });
  });

  describe('gatherStartMeasures', () => {
    it('collects scope, repo, word, and delta baselines for a task', async () => {
      const specFolder = path.join(tmpDir, 'change');
      await fs.mkdir(path.join(specFolder, 'specs', 'cap'), { recursive: true });
      await fs.writeFile(
        path.join(specFolder, 'proposal.md'),
        'Adds raw measures to the watcher.\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(specFolder, 'specs', 'cap', 'spec.md'),
        ['### Requirement: One', '#### Scenario: A'].join('\n'),
        'utf8',
      );
      await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'src', 'foo.ts'), 'a\nb\n', 'utf8');

      const taskContent = [
        '---',
        'title: Probe',
        'verify: node -e "process.exit(0)"',
        'scope: [src/foo.ts]',
        'entry: []',
        'skills: []',
        '---',
        '## Acceptance',
        '- [ ] a line',
      ].join('\n');

      const measures = await gatherStartMeasures(tmpDir, specFolder, parseTaskMd(taskContent));

      assert.equal(measures.phase, 'start');
      assert.equal(measures.scopeResolver, 2);
      assert.equal(measures.scopeFiles, 1);
      assert.equal(measures.scopeLines, 3);
      assert.equal(measures.importFanIn, 0);
      assert.equal(measures.proposalWords, 6);
      assert.equal(measures.taskWords, countWords(taskContent));
      assert.equal(measures.deltaRequirements, 1);
      assert.equal(measures.deltaScenarios, 1);
      assert.ok(measures.repoFiles >= 1);
    });
  });

  describe('runner integration', () => {
    const successVerify = 'node verify.cjs';

    async function setupProject(
      title: string,
      options: { scopeFile?: string; verify?: string } = {},
    ): Promise<{ projectRoot: string; specFolderPath: string }> {
      const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-measures-run-'));
      await installFakeValidator(projectRoot);
      await scaffoldProject(projectRoot);
      const spec = await createNewSpec(projectRoot, title);
      await fs.writeFile(path.join(projectRoot, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
      const seededProposalPath = path.join(spec.folderPath, 'proposal.md');
      const seededProposal = await fs.readFile(seededProposalPath, 'utf8').catch(() => null);
      if (seededProposal !== null) {
        await fs.writeFile(
          seededProposalPath,
          seededProposal.replace(/^verify:.*$/m, 'verify: node verify.cjs'),
          'utf8',
        );
      }
      const task = [
        '---',
        `title: ${title}`,
        `verify: ${options.verify ?? successVerify}`,
        `scope: ${options.scopeFile ? `['${options.scopeFile}']` : '[]'}`,
        'entry: []',
        'skills: []',
        '---',
        '## Acceptance',
        '- [ ] observed',
      ].join('\n');
      await fs.writeFile(path.join(spec.folderPath, 'tasks', '1.md'), `${task}\n`, 'utf8');
      await approveSpec(projectRoot, '001', DEFAULT_CONFIG);
      return { projectRoot, specFolderPath: spec.folderPath };
    }

    async function readEventTypes(specFolderPath: string): Promise<string[]> {
      const raw = await fs.readFile(path.join(specFolderPath, '.run', 'events', '1.jsonl'), 'utf8');
      return raw
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => (JSON.parse(line) as { type: string }).type);
    }

    it('emits start then end measures for a verified task', async () => {
      const { projectRoot, specFolderPath } = await setupProject('Measures Probe');
      try {
        const result = await runTask(
          projectRoot,
          specFolderPath,
          '1',
          DEFAULT_CONFIG,
          new MockAdapter(),
        );
        assert.equal(result.success, true);

        const measures = await readMeasuresEvents(specFolderPath);
        assert.deepEqual(
          measures.map((data) => data.phase),
          ['start', 'end'],
        );
        assert.deepEqual(
          measures.map((data) => data.scopeResolver),
          [2, 2],
        );
        assert.equal(measures[1].changedFiles, 0);
        assert.equal(measures[1].changedLines, 0);
        assert.deepEqual(measures[1].scopeHashes, {});

        const types = await readEventTypes(specFolderPath);
        assert.ok(
          types.indexOf('done') > types.lastIndexOf('measures'),
          `expected measures end before done: ${types.join(',')}`,
        );
      } finally {
        await fs.rm(projectRoot, { recursive: true, force: true });
      }
    });

    it('reports changed files and lines for a scoped edit', async () => {
      const { projectRoot, specFolderPath } = await setupProject('Measures Scope', {
        scopeFile: 'src/widget.ts',
      });
      try {
        await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
        await fs.writeFile(path.join(projectRoot, 'src', 'widget.ts'), 'one\ntwo\nthree', 'utf8');

        const adapter = new ScopeWritingAdapter('src/widget.ts', 'one\ntwo\nthree\nfour');
        const result = await runTask(projectRoot, specFolderPath, '1', DEFAULT_CONFIG, adapter);
        assert.equal(result.success, true);

        const measures = await readMeasuresEvents(specFolderPath);
        assert.deepEqual(
          measures.map((data) => data.phase),
          ['start', 'end'],
        );
        assert.equal(measures[1].changedFiles, 1);
        assert.equal(measures[1].changedLines, 1);
        assert.deepEqual(measures[1].scopeHashes?.['src/widget.ts'], {
          before: sha256('one\ntwo\nthree'),
          after: sha256('one\ntwo\nthree\nfour'),
        });
      } finally {
        await fs.rm(projectRoot, { recursive: true, force: true });
      }
    });

    it('emits an end measures event for a crashed dead outcome', async () => {
      const { projectRoot, specFolderPath } = await setupProject('Measures Dead');
      try {
        const adapter = new MockAdapter();
        adapter.setBehavior({ exitCode: 1, writeResult: false });
        const result = await runTask(projectRoot, specFolderPath, '1', DEFAULT_CONFIG, adapter);
        assert.equal(result.success, false);
        assert.equal(result.reason, 'crashed');

        const measures = await readMeasuresEvents(specFolderPath);
        assert.deepEqual(
          measures.map((data) => data.phase),
          ['start', 'end'],
        );
      } finally {
        await fs.rm(projectRoot, { recursive: true, force: true });
      }
    });

    it('emits end measures before the dead event on verify_red', async () => {
      const { projectRoot, specFolderPath } = await setupProject('Measures Red', {
        verify: 'node -e "process.exit(1)"',
      });
      try {
        const result = await runTask(
          projectRoot,
          specFolderPath,
          '1',
          DEFAULT_CONFIG,
          new MockAdapter(),
        );
        assert.equal(result.success, false);
        assert.equal(result.reason, 'verify_red');

        const measures = await readMeasuresEvents(specFolderPath);
        assert.deepEqual(
          measures.map((data) => data.phase),
          ['start', 'end'],
        );

        const types = await readEventTypes(specFolderPath);
        assert.ok(
          types.lastIndexOf('measures') < types.indexOf('dead'),
          `expected measures end before dead: ${types.join(',')}`,
        );
      } finally {
        await fs.rm(projectRoot, { recursive: true, force: true });
      }
    });
  });
});
