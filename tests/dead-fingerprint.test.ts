import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { MockAdapter } from '../src/harness/mock.js';
import {
  addFingerprint,
  markerFingerprint,
  normalizeFailureBody,
  stripAnsi,
} from '../src/watcher/fingerprint.js';
import { writeDeadMarker } from '../src/watcher/outcome.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const FINGERPRINT = /^fingerprint: (sha256:[0-9a-f]{64})$/m;

function marker(reason: string, body: string): string {
  return `---\nreason: ${reason}\n---\n${body}`;
}

/** The marker bytes left after the inserted fingerprint line is removed. */
function withoutFingerprint(content: string): string {
  return content.replace(/^fingerprint: .*\n/m, '');
}

describe('failure body normalization', () => {
  it('strips ANSI escape sequences', () => {
    assert.equal(stripAnsi('\u001b[31mred\u001b[0m plain'), 'red plain');
    assert.equal(stripAnsi('a\u001b[1;32mb'), 'ab');
  });

  it('replaces timestamps, durations, and pids with placeholders', () => {
    const body = 'at 2026-09-23T19:40:00.000Z after 12ms and 3.4s and (812.5ms) and 2m pid: 123';
    assert.equal(
      normalizeFailureBody(body),
      'at <time> after <duration> and <duration> and <duration> and <duration> pid <pid>',
    );
    assert.equal(normalizeFailureBody('pid: 1 pid 2 PID=3'), 'pid <pid> pid <pid> pid <pid>');
  });

  it('replaces absolute paths under the project root', () => {
    assert.equal(
      normalizeFailureBody('/tmp/proj/src/a.ts and /tmp/proj', '/tmp/proj'),
      '<root>/src/a.ts and <root>',
    );
    assert.equal(normalizeFailureBody('/tmp/proj/src/a.ts'), '<tmp>/src/a.ts');
  });

  it('replaces numbers after duration keys', () => {
    assert.equal(
      normalizeFailureBody('duration_ms: 3.803686\n# duration_ms 92.962079'),
      'duration_ms: <duration>\n# duration_ms <duration>',
    );
  });

  it('replaces paths under the temp directory keeping the rest', () => {
    assert.equal(normalizeFailureBody('/tmp/paas-Hfp38F/state.db'), '<tmp>/state.db');
    assert.equal(normalizeFailureBody('/tmp/paas-Hfp38F'), '<tmp>');
    assert.equal(normalizeFailureBody('file:///tmp/paas-Hfp38F/a.mjs'), 'file://<tmp>/a.mjs');
    assert.equal(normalizeFailureBody("'/tmp/paas-Hfp38F'"), "'<tmp>'");
    assert.equal(normalizeFailureBody('at /tmp/paas-Hfp38F done'), 'at <tmp> done');
  });
});

describe('dead marker fingerprint', () => {
  const root = '/tmp/root';

  it('ignores timestamps, durations, pids, ANSI codes, and the project root', () => {
    const first = marker(
      'verify_red',
      'failed /tmp/root/tests/foo.test.ts at 2026-09-23T19:40:00.000Z in 812.5ms pid: 111\n\u001b[31mboom\u001b[0m',
    );
    const second = marker(
      'verify_red',
      'failed /tmp/other/tests/foo.test.ts at 2027-01-02T03:04:05Z in 3.4s pid: 999\nboom',
    );
    assert.equal(markerFingerprint(first, root), markerFingerprint(second, '/tmp/other'));
  });

  it('separates different reasons', () => {
    assert.notEqual(
      markerFingerprint(marker('verify_red', 'same body'), root),
      markerFingerprint(marker('crashed', 'same body'), root),
    );
  });

  it('separates different failing test names', () => {
    assert.notEqual(
      markerFingerprint(marker('verify_red', 'not ok 1 - alpha test'), root),
      markerFingerprint(marker('verify_red', 'not ok 1 - beta test'), root),
    );
  });
});

describe('dead marker frontmatter', () => {
  const root = '/tmp/root';

  it('inserts the fingerprint line and preserves every other byte', () => {
    const original = marker('verify_red', 'body line\n');
    assert.equal(
      addFingerprint(original, root),
      `---\nreason: verify_red\nfingerprint: ${markerFingerprint(original, root)}\n---\nbody line\n`,
    );
  });

  it('adds a frontmatter block when there is none', () => {
    const original = 'plain failure text\n';
    assert.equal(
      addFingerprint(original, root),
      `---\nfingerprint: ${markerFingerprint(original, root)}\n---\nplain failure text\n`,
    );
  });

  it('writes the field to disk through writeDeadMarker', async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-fingerprint-'));
    try {
      const original = marker('verify_red', 'failed\n');
      await writeDeadMarker(runDir, '1', original, root);
      const written = await fs.readFile(path.join(runDir, 'dead', '1.md'), 'utf8');
      assert.ok(FINGERPRINT.test(written), `no fingerprint in ${written}`);
      assert.equal(withoutFingerprint(written), original);
    } finally {
      await fs.rm(runDir, { recursive: true, force: true });
    }
  });
});

describe('dead markers from real runs carry a fingerprint', () => {
  let tmpDir: string;
  let specFolder: string;
  let adapter: MockAdapter;

  const PASSING_VERIFY = 'node verify.cjs';
  const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

  async function installLocalVerifier(root: string, folderPath: string): Promise<void> {
    await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    for (const rel of ['proposal.md', path.join('tasks', '1.md')]) {
      const target = path.join(folderPath, rel);
      const content = await fs.readFile(target, 'utf8').catch(() => null);
      if (content === null) continue;
      await fs.writeFile(
        target,
        content.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
        'utf8',
      );
    }
  }

  async function writeTask(verify: string): Promise<void> {
    const task = [
      '---',
      'title: When a task dies, its marker records a fingerprint',
      `verify: ${verify}`,
      'scope: []',
      'entry: []',
      'skills: []',
      '---',
      '## Acceptance',
      '- [ ] should be observed',
    ].join('\n');
    await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), `${task}\n`, 'utf8');
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-dead-fingerprint-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Dead Fingerprint');
    specFolder = spec.folderPath;
    await installLocalVerifier(tmpDir, specFolder);
    adapter = new MockAdapter();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('records the field on a verify_red failure written by runTask', async () => {
    await writeTask('node -e "process.exit(1)"');
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    adapter.resetBehavior();

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.reason, 'verify_red');

    const content = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    const match = content.match(FINGERPRINT);
    assert.ok(match, `no fingerprint in ${content}`);
    assert.equal(match[1], markerFingerprint(withoutFingerprint(content), tmpDir));
  });

  it('normalizes the project root when the agent itself fails', async () => {
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    adapter.setBehavior({ exitCode: 7, error: `boom at ${tmpDir}` });

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.reason, 'crashed');

    const content = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    const match = content.match(FINGERPRINT);
    assert.ok(match, `no fingerprint in ${content}`);
    const stripped = withoutFingerprint(content);
    assert.equal(match[1], markerFingerprint(stripped, tmpDir));
    assert.notEqual(match[1], markerFingerprint(stripped));
  });
});
