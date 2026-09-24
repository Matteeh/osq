import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { MockAdapter } from '../src/harness/mock.js';
import { resolveProjectCommit } from '../src/watcher/build-project.js';
import { resolveBuildInfo } from '../src/watcher/build.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PASSING_VERIFY = 'node verify.cjs';
const GIT_AUTHOR = ['-c', 'user.name=osq', '-c', 'user.email=osq@example.invalid'];
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

async function headCommit(cwd: string): Promise<string> {
  return git(['rev-parse', '--short', 'HEAD'], cwd);
}

async function initRepo(dir: string): Promise<string> {
  await git(['init'], dir);
  await fs.writeFile(path.join(dir, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], dir);
  await git([...GIT_AUTHOR, 'commit', '-m', 'init'], dir);
  return headCommit(dir);
}

async function readOsqVersion(): Promise<string> {
  const raw = await fs.readFile(path.join(REPO_ROOT, 'package.json'), 'utf8');
  return (JSON.parse(raw) as { version: string }).version;
}

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, taskNumber: string): Promise<ParsedEvent[]> {
  const raw = await fs.readFile(
    path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`),
    'utf8',
  );
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

async function writeTask1(specFolder: string): Promise<void> {
  const task = [
    '---',
    'title: When a task runs, osq and project identity are recorded',
    `verify: ${PASSING_VERIFY}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] records the identities',
  ].join('\n');
  await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), `${task}\n`, 'utf8');
}

/** Scaffold a runnable temp project with a local verifier and an approved change. */
async function setupRunnableProject(version: string): Promise<{
  tmpDir: string;
  specFolder: string;
}> {
  const tmpDir = await makeTempDir('osq-build-id-project-');
  await installFakeValidator(tmpDir);
  await scaffoldProject(tmpDir);
  await fs.writeFile(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({ name: 'temp-project', version }),
    'utf8',
  );
  const spec = await createNewSpec(tmpDir, 'Build Identity Project');
  const specFolder = spec.folderPath;
  await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  const proposalPath = path.join(specFolder, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(
    proposalPath,
    proposal.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
    'utf8',
  );
  await writeTask1(specFolder);
  await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
  return { tmpDir, specFolder };
}

class CaptureLogger {
  readonly statuses: string[] = [];
  readonly infos: string[] = [];
  readonly symbols = false;
  readonly interactive = false;
  info(msg: string): void {
    this.infos.push(msg);
  }
  verbose(_msg: string): void {}
  warn(_msg: string): void {}
  error(_msg: string): void {}
  status(text: string): void {
    this.statuses.push(text);
  }
  clearStatus(): void {}
}

describe('Build identity from osq package root', () => {
  it('reports the root version and HEAD when the root tops its own git repository', async () => {
    const root = await makeTempDir('osq-bi-checkout-');
    await fs.writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'fake-osq', version: '9.9.9' }),
      'utf8',
    );
    const head = await initRepo(root);

    const info = await resolveBuildInfo(root);
    assert.equal(info.version, '9.9.9');
    assert.equal(info.commit, head);
  });

  it('never reports the enclosing repository HEAD from below the work-tree top', async () => {
    const repoRoot = await makeTempDir('osq-bi-installed-');
    const repoHead = await initRepo(repoRoot);

    const rootWithDist = path.join(repoRoot, 'node_modules', '@matteeh', 'osq');
    await fs.mkdir(rootWithDist, { recursive: true });
    await fs.writeFile(
      path.join(rootWithDist, 'package.json'),
      JSON.stringify({ name: '@matteeh/osq', version: '9.9.9' }),
      'utf8',
    );
    await fs.mkdir(path.join(rootWithDist, 'dist'), { recursive: true });
    await fs.writeFile(path.join(rootWithDist, 'dist', 'a.js'), 'alpha', 'utf8');

    const expected = createHash('sha256');
    expected.update('a.js');
    expected.update('\0');
    expected.update(Buffer.from('alpha'));
    expected.update('\0');
    const expectedHash = expected.digest('hex').slice(0, 8);

    const withDist = await resolveBuildInfo(rootWithDist);
    assert.equal(withDist.version, '9.9.9');
    assert.equal(withDist.commit, expectedHash);
    assert.notEqual(withDist.commit, repoHead);

    const rootWithoutDist = path.join(repoRoot, 'node_modules', '@matteeh', 'osq-nodist');
    await fs.mkdir(rootWithoutDist, { recursive: true });
    await fs.writeFile(
      path.join(rootWithoutDist, 'package.json'),
      JSON.stringify({ name: '@matteeh/osq-nodist', version: '9.9.9' }),
      'utf8',
    );
    const withoutDist = await resolveBuildInfo(rootWithoutDist);
    assert.equal(withoutDist.commit, 'unknown');
  });

  it('reports the current checkout HEAD for the running package root', async () => {
    const info = await resolveBuildInfo();
    const expected = await headCommit(REPO_ROOT);
    const version = await readOsqVersion();
    assert.equal(info.version, version);
    assert.equal(info.commit, expected);
  });
});

describe('Run identity records', () => {
  it('records osq identity and the project commit in the started event and done marker', async () => {
    const { tmpDir, specFolder } = await setupRunnableProject('1.0.0');
    const projectHead = await initRepo(tmpDir);

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, new MockAdapter());
    assert.equal(result.success, true);

    const osqVersion = await readOsqVersion();
    const started = (await readEvents(specFolder, '1')).find(
      (event) => event.type === 'started' && typeof event.data?.version === 'string',
    );
    assert.ok(started, 'expected a started event carrying the build version');
    assert.equal(started.data?.osqVersion, osqVersion);
    assert.equal(started.data?.version, osqVersion);
    assert.equal(started.data?.projectCommit, projectHead);

    const doneRaw = await fs.readFile(path.join(specFolder, '.run', 'done', '1'), 'utf8');
    const { data } = parseFrontmatter(doneRaw);
    const buildInfo = await resolveBuildInfo();
    assert.equal(data.build_stamp, buildInfo.commit);
    assert.equal(data.project_commit, projectHead);
  });

  it('records null project identity outside a git repository', async () => {
    const { tmpDir, specFolder } = await setupRunnableProject('1.0.0');

    assert.equal(await resolveProjectCommit(tmpDir), null);

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, new MockAdapter());
    assert.equal(result.success, true);

    const started = (await readEvents(specFolder, '1')).find(
      (event) => event.type === 'started' && typeof event.data?.version === 'string',
    );
    assert.ok(started, 'expected a started event carrying the build version');
    assert.equal(started.data?.projectCommit, null);

    const doneRaw = await fs.readFile(path.join(specFolder, '.run', 'done', '1'), 'utf8');
    const { data } = parseFrontmatter(doneRaw);
    assert.equal(data.project_commit, null);
  });

  it('prints osq identity, not the project version, in the idle status line', async () => {
    const tmpDir = await makeTempDir('osq-bi-idle-');
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'temp-project', version: '1.0.0' }),
      'utf8',
    );

    const logger = new CaptureLogger();
    await runWatcherCycle(tmpDir, DEFAULT_CONFIG, new MockAdapter(), logger);

    const osqVersion = await readOsqVersion();
    const buildInfo = await resolveBuildInfo();
    const prefix = `osq v${osqVersion} (${buildInfo.commit})`;
    assert.ok(logger.statuses.length > 0, 'expected an idle status line');
    assert.ok(
      logger.statuses[0].startsWith(prefix),
      `idle status line "${logger.statuses[0]}" must start with "${prefix}"`,
    );
    assert.ok(!logger.statuses[0].includes('v1.0.0'), 'must not report the project version');
  });
});
