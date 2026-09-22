import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createNewSpec } from '../src/core/new.js';
import { MockAdapter } from '../src/harness/mock.js';
import { resolveBuildInfo } from '../src/watcher/build.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, taskNumber: string): Promise<ParsedEvent[]> {
  const eventFilePath = path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`);
  const raw = await fs.readFile(eventFilePath, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

async function writeTask1(specFolder: string): Promise<void> {
  const task = [
    '---',
    'title: When a task runs, its build identity is recorded',
    `verify: ${PASSING_VERIFY}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] records the build identity',
  ].join('\n');
  await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), `${task}\n`, 'utf8');
}

describe('Build identity resolution', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  async function makeTempProject(version: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-build-info-'));
    tmpDirs.push(dir);
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'temp-project', version }),
      'utf8',
    );
    return dir;
  }

  it('returns the package version and a git commit or dist hash', async () => {
    const info = await resolveBuildInfo();

    assert.equal(info.version, '0.1.0');
    assert.equal(typeof info.commit, 'string');
    assert.match(info.commit, /^[0-9a-f]{7,40}$/);
  });

  it('falls back to the dist hash when git is unavailable', async () => {
    const dir = await makeTempProject('9.9.9');
    await fs.mkdir(path.join(dir, 'dist', 'nested'), { recursive: true });
    await fs.writeFile(path.join(dir, 'dist', 'a.js'), 'alpha', 'utf8');
    await fs.writeFile(path.join(dir, 'dist', 'nested', 'b.js'), 'beta', 'utf8');

    // Mirrors the implementation's sorted, path-folding sha256 of dist/.
    const expected = createHash('sha256');
    expected.update('a.js');
    expected.update('\0');
    expected.update(Buffer.from('alpha'));
    expected.update('\0');
    expected.update('nested/b.js');
    expected.update('\0');
    expected.update(Buffer.from('beta'));
    expected.update('\0');
    const expectedHash = expected.digest('hex').slice(0, 8);

    const info = await resolveBuildInfo(dir);
    assert.equal(info.version, '9.9.9');
    assert.equal(info.commit, expectedHash);
  });

  it('falls back to unknown when neither git nor dist is present', async () => {
    const dir = await makeTempProject('1.2.3');

    const info = await resolveBuildInfo(dir);
    assert.equal(info.version, '1.2.3');
    assert.equal(info.commit, 'unknown');
  });
});

describe('Runner build identity events', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-build-identity-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Build Identity');
    specFolder = spec.folderPath;
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    const seededProposalPath = path.join(specFolder, 'proposal.md');
    const seededProposal = await fs.readFile(seededProposalPath, 'utf8').catch(() => null);
    if (seededProposal !== null) {
      await fs.writeFile(
        seededProposalPath,
        seededProposal.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
        'utf8',
      );
    }
    await writeTask1(specFolder);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('records version and commit in the started lifecycle event data', async () => {
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, new MockAdapter());
    assert.equal(result.success, true);

    const startedEvents = (await readEvents(specFolder, '1')).filter(
      (event) => event.type === 'started',
    );
    // MockAdapter emits its own started event; the runner's carries build identity.
    const runnerStarted = startedEvents.find((event) => typeof event.data?.version === 'string');
    assert.ok(runnerStarted, 'expected a started event carrying the build version');
    assert.equal(typeof runnerStarted.data?.commit, 'string');
    assert.ok((runnerStarted.data?.version as string).length > 0);
    assert.ok((runnerStarted.data?.commit as string).length > 0);
  });
});
