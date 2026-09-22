import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { getRejectedDir } from '../src/core/layout.js';
import { createNewSpec } from '../src/core/new.js';
import { parseFrontmatter } from '../src/core/parser.js';
import { rejectSpec } from '../src/core/reject.js';
import { installFakeValidator } from './helpers.js';

const VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

async function writeTask(specFolder: string): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    'title: When rejection is exercised, the record is preserved',
    `verify: ${VERIFY}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] should be observed',
  ].join('\n');
  await fs.writeFile(taskPath, `${task}\n`, 'utf8');
}

async function writeMarker(
  specFolder: string,
  kind: string,
  name: string,
  reason: string,
): Promise<void> {
  const dir = path.join(specFolder, '.run', kind);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), `---\nreason: ${reason}\n---\nmarker\n`, 'utf8');
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function readEvents(folderPath: string, target: string): Promise<Record<string, unknown>[]> {
  const raw = await fs
    .readFile(path.join(folderPath, '.run', 'events', `${target}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function readBytes(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

describe('explicit rejection transition', () => {
  let tmpDir: string;
  let specFolder: string;
  let folderName: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-reject-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Reject Target');
    specFolder = spec.folderPath;
    folderName = spec.folderName;
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    const seededProposalPath = path.join(specFolder, 'proposal.md');
    const seededProposal = await fs.readFile(seededProposalPath, 'utf8').catch(() => null);
    if (seededProposal !== null) {
      await fs.writeFile(
        seededProposalPath,
        seededProposal.replace(/^verify:.*$/m, 'verify: node verify.cjs'),
        'utf8',
      );
    }
    await writeTask(specFolder);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('refuses an empty or whitespace-only reason without moving the folder', async () => {
    await assert.rejects(() => rejectSpec(tmpDir, '001', '   ', DEFAULT_CONFIG), /reason/i);
    assert.equal(await exists(specFolder), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'rejected.md')), false);
  });

  it('rejects an unapproved active change into the canonical rejected directory', async () => {
    const result = await rejectSpec(
      tmpDir,
      '001',
      'superseded by a different plan',
      DEFAULT_CONFIG,
    );

    const expectedDestination = path.join(getRejectedDir('openspec', tmpDir), folderName);
    assert.equal(result.destinationPath, expectedDestination);
    assert.equal(result.folderName, folderName);
    assert.equal(result.sourcePath, specFolder);
    assert.equal(await exists(specFolder), false);
    assert.equal(await exists(expectedDestination), true);

    const marker = await fs.readFile(path.join(expectedDestination, '.run', 'rejected.md'), 'utf8');
    const { data } = parseFrontmatter(marker);
    assert.equal(data.reason, 'superseded by a different plan');
    assert.equal(typeof data.timestamp, 'string');
    assert.equal(data.timestamp, result.timestamp);

    const events = await readEvents(expectedDestination, 'change');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'rejected');
    assert.equal((events[0].data as Record<string, unknown>).reason, data.reason);
    assert.equal(events[0].timestamp, data.timestamp);
  });

  it('rejects an approved change with an active dead marker', async () => {
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await writeMarker(specFolder, 'dead', '1.md', 'verify_red');

    const result = await rejectSpec(tmpDir, '001', 'task cannot be completed', DEFAULT_CONFIG);

    const destination = path.join(getRejectedDir('openspec', tmpDir), folderName);
    assert.equal(result.destinationPath, destination);
    assert.equal(await exists(path.join(destination, '.run', 'dead', '1.md')), true);
    assert.equal(await exists(path.join(destination, '.run', 'events', 'change.jsonl')), true);
  });

  it('rejects an approved change with an active regressed task marker', async () => {
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await writeMarker(specFolder, 'regressed', '1.md', 'verify_red');

    const result = await rejectSpec(tmpDir, '001', 'regression is unrecoverable', DEFAULT_CONFIG);

    const destination = path.join(getRejectedDir('openspec', tmpDir), folderName);
    assert.equal(result.destinationPath, destination);
    assert.equal(await exists(path.join(destination, '.run', 'regressed', '1.md')), true);
  });

  it('rejects an approved change with a change-level regression', async () => {
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await writeMarker(specFolder, 'regressed', 'change.md', 'verify_red');

    const result = await rejectSpec(
      tmpDir,
      '001',
      'change verification is unrecoverable',
      DEFAULT_CONFIG,
    );

    const destination = path.join(getRejectedDir('openspec', tmpDir), folderName);
    assert.equal(result.destinationPath, destination);
    assert.equal(await exists(path.join(destination, '.run', 'regressed', 'change.md')), true);
  });

  it('refuses a healthy approved change and leaves it in place', async () => {
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    await assert.rejects(() => rejectSpec(tmpDir, '001', 'no reason to reject', DEFAULT_CONFIG));

    assert.equal(await exists(specFolder), true);
    assert.equal(await exists(path.join(getRejectedDir('openspec', tmpDir), folderName)), false);
  });

  it('refuses an approved completed change', async () => {
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await writeMarker(specFolder, 'done', '1', '');

    await assert.rejects(() => rejectSpec(tmpDir, '001', 'already complete', DEFAULT_CONFIG));

    assert.equal(await exists(specFolder), true);
  });

  it('refuses a running task even when a dead marker would win state precedence', async () => {
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await writeMarker(specFolder, 'dead', '1.md', 'verify_red');
    await fs.mkdir(path.join(specFolder, '.run', 'running'), { recursive: true });
    await fs.writeFile(path.join(specFolder, '.run', 'running', '1.pid'), '{"pid":1}', 'utf8');

    await assert.rejects(
      () => rejectSpec(tmpDir, '001', 'still running', DEFAULT_CONFIG),
      /running/i,
    );

    assert.equal(await exists(specFolder), true);
  });

  it('refuses a historical suffixed failure marker as not active', async () => {
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await writeMarker(specFolder, 'dead', '1.1.md', 'verify_red');

    await assert.rejects(
      () => rejectSpec(tmpDir, '001', 'historical only', DEFAULT_CONFIG),
      /healthy/i,
    );

    assert.equal(await exists(specFolder), true);
  });

  it('refuses an archived change', async () => {
    const archiveDir = path.join(tmpDir, 'openspec', 'changes', 'archive');
    await fs.mkdir(archiveDir, { recursive: true });
    await fs.rename(specFolder, path.join(archiveDir, folderName));

    await assert.rejects(() => rejectSpec(tmpDir, '001', 'archived', DEFAULT_CONFIG), /not found/i);
  });

  it('refuses an already rejected change', async () => {
    await rejectSpec(tmpDir, '001', 'first rejection', DEFAULT_CONFIG);

    await assert.rejects(
      () => rejectSpec(tmpDir, '001', 'second rejection', DEFAULT_CONFIG),
      /not found/i,
    );
  });

  it('refuses a missing change', async () => {
    await assert.rejects(() => rejectSpec(tmpDir, '999', 'missing', DEFAULT_CONFIG), /not found/i);
  });

  it('refuses a destination collision without moving or overwriting', async () => {
    const destination = path.join(getRejectedDir('openspec', tmpDir), folderName);
    await fs.mkdir(destination, { recursive: true });
    await fs.writeFile(path.join(destination, 'sentinel.txt'), 'existing\n', 'utf8');

    await assert.rejects(
      () => rejectSpec(tmpDir, '001', 'collision', DEFAULT_CONFIG),
      /already exists/i,
    );

    assert.equal(await exists(specFolder), true);
    assert.equal(await fs.readFile(path.join(destination, 'sentinel.txt'), 'utf8'), 'existing\n');
  });

  it('moves the complete record intact and appends one matching rejection event', async () => {
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    // Authored and run artifacts added after sealing; rejection must preserve
    // every byte of them while adding exactly the marker and one event.
    await fs.writeFile(
      path.join(specFolder, 'brief.md'),
      '---\nplanner: codex\n---\nbrief\n',
      'utf8',
    );
    await fs.mkdir(path.join(specFolder, 'specs', 'cli-foundation'), { recursive: true });
    await fs.writeFile(
      path.join(specFolder, 'specs', 'cli-foundation', 'spec.md'),
      '# cli-foundation delta\n\n### Requirement: Rejection example\n\nText.\n',
      'utf8',
    );
    await fs.mkdir(path.join(specFolder, '.run', 'results'), { recursive: true });
    await fs.writeFile(path.join(specFolder, '.run', 'results', '1.md'), 'prior result\n', 'utf8');
    await fs.mkdir(path.join(specFolder, '.run', 'events'), { recursive: true });
    await fs.writeFile(
      path.join(specFolder, '.run', 'events', '1.jsonl'),
      '{"type":"started"}\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(specFolder, '.run', 'events', 'change.jsonl'),
      '{"type":"started","task":"change"}\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(specFolder, '.run', 'plan.jsonl'),
      '{"type":"plan_started"}\n',
      'utf8',
    );
    await writeMarker(specFolder, 'dead', '1.md', 'verify_red');
    await writeMarker(specFolder, 'regressed', '1.1.md', 'verify_red');

    const preserved = [
      'proposal.md',
      'brief.md',
      'tasks.md',
      'tasks/1.md',
      'specs/cli-foundation/spec.md',
      '.run/plan.jsonl',
      '.run/events/1.jsonl',
      '.run/results/1.md',
      '.run/dead/1.md',
      '.run/regressed/1.1.md',
    ];
    const before = new Map<string, Buffer>();
    for (const rel of preserved) {
      before.set(rel, await readBytes(path.join(specFolder, rel)));
    }
    const changeEventsBefore = await readBytes(
      path.join(specFolder, '.run', 'events', 'change.jsonl'),
    );
    const tasksMdBefore = before.get('tasks.md') as Buffer;

    const reason = 'stuck: "cannot" continue';
    const result = await rejectSpec(tmpDir, '001', reason, DEFAULT_CONFIG);
    const destination = path.join(getRejectedDir('openspec', tmpDir), folderName);
    assert.equal(result.destinationPath, destination);

    for (const rel of preserved) {
      const after = await readBytes(path.join(destination, rel));
      assert.ok(
        after.equals(before.get(rel) as Buffer),
        `${rel} changed across the rejection move`,
      );
    }

    // Task checkboxes are untouched.
    assert.ok((await readBytes(path.join(destination, 'tasks.md'))).equals(tasksMdBefore));
    // Deltas are never applied to living specs.
    assert.equal(
      await exists(path.join(tmpDir, 'openspec', 'specs', 'cli-foundation', 'spec.md')),
      false,
    );

    // Pre-existing event bytes are a prefix; exactly one rejected event follows.
    const changeEventsAfter = await fs.readFile(
      path.join(destination, '.run', 'events', 'change.jsonl'),
    );
    assert.ok(changeEventsAfter.subarray(0, changeEventsBefore.length).equals(changeEventsBefore));
    const lines = changeEventsAfter
      .toString('utf8')
      .split('\n')
      .filter((line) => line.trim());
    assert.equal(lines.length, 2);
    const rejected = JSON.parse(lines[1]) as Record<string, unknown>;
    assert.equal(rejected.type, 'rejected');
    assert.equal(rejected.timestamp, result.timestamp);
    assert.equal((rejected.data as Record<string, unknown>).reason, reason);

    const marker = parseFrontmatter(
      await fs.readFile(path.join(destination, '.run', 'rejected.md'), 'utf8'),
    );
    assert.equal(marker.data.reason, reason);
    assert.equal(marker.data.timestamp, result.timestamp);
    assert.equal(marker.data.timestamp, rejected.timestamp);
    assert.equal(result.reason, reason);
  });
});
