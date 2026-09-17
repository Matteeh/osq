import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createNewSpec } from '../src/core/new.js';
import { MockAdapter } from '../src/harness/mock.js';
import { runWatcherOnce } from '../src/watcher/loop.js';

describe('Watcher Loop and CLI', () => {
  let tmpDir: string;
  let mockAdapter: MockAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-watcher-test-'));
    await scaffoldProject(tmpDir);
    mockAdapter = new MockAdapter();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('runWatcherOnce processes approved specs, executes tasks, and archives on completion', async () => {
    const spec = await createNewSpec(tmpDir, 'Automated Spec');
    // Task 1 with valid passing verify
    const taskPath = path.join(spec.folderPath, 'tasks', '1.md');
    await fs.writeFile(
      taskPath,
      [
        '---',
        'title: When automated task runs',
        'verify: node -e "process.exit(0)"',
        'scope: []',
        'entry: []',
        'skills: []',
        '---',
        '## Acceptance',
        '- [ ] passes',
      ].join('\n'),
      'utf8',
    );

    // Approve spec
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    // Run watcher in once mode
    const summary = await runWatcherOnce(tmpDir, DEFAULT_CONFIG, mockAdapter);

    assert.equal(summary.tasksRun, 1);
    assert.equal(summary.specsArchived, 1);

    // Folder is archived
    const folderName = path.basename(spec.folderPath);
    const archivedPath = path.join(tmpDir, 'specs', 'archive', folderName);
    const stat = await fs.stat(archivedPath);
    assert.ok(stat);

    // Done marker exists in archive
    const doneMarker = path.join(archivedPath, '.run', 'done', '1');
    assert.ok(await fs.stat(doneMarker));
  });

  it('CLI registers watch and setup commands with expected options', () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());

    assert.ok(commandNames.includes('watch'));
    assert.ok(commandNames.includes('setup'));

    const watchCmd = program.commands.find((c) => c.name() === 'watch');
    assert.ok(watchCmd);
    const onceOption = watchCmd.options.find((o) => o.short === '-o' || o.long === '--once');
    assert.ok(onceOption);
  });
});
