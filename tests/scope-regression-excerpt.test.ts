import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { writeDoneMarker } from '../src/watcher/outcome.js';
import { auditScopeRegressions, buildDoneMetadata } from '../src/watcher/regression.js';
import { installFakeValidator } from './helpers.js';

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

const PASSING = 'process.exit(0);\n';
const FAILING = "for (let i = 1; i <= 100; i += 1) console.log('line ' + i);\nprocess.exit(1);\n";
const TIMEOUT_SECONDS = DEFAULT_CONFIG.timeouts.verifyTimeoutSeconds ?? 600;
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

function proposalFor(verify: string): string {
  return `---\ntitle: Scope excerpt\ndepends_on: []\nverify: ${verify}\nfeatures:\n  reads: []\n---\n## Goal\n\nExercise the scope regression excerpt.\n\n## Surface\n\nNone.\n`;
}

function taskFor(verify: string): string {
  return `${[
    '---',
    'title: Scope excerpt',
    `verify: ${verify}`,
    'scope: [src/a.ts]',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] the scope excerpt decides',
    '',
  ].join('\n')}`;
}

async function setup(): Promise<{ root: string; folder: string; runDir: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scope-excerpt-'));
  roots.push(root);
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'pass.cjs'), PASSING, 'utf8');
  await fs.writeFile(path.join(root, 'fail100.cjs'), FAILING, 'utf8');
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const value = 1;\n', 'utf8');

  const folder = path.join(root, 'openspec', 'changes', '001-scope-excerpt');
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposalFor(PASSING), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks.md'), '# Tasks\n\n- [ ] 1. Scope excerpt\n', 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), taskFor('node fail100.cjs'), 'utf8');
  await approveSpec(root, '001', DEFAULT_CONFIG);
  return { root, folder, runDir: path.join(folder, '.run') };
}

/** Record task 1 done against the current tree, then drift its scoped file. */
async function arrangeStaleTask(root: string, runDir: string): Promise<void> {
  await writeDoneMarker(runDir, '1', await buildDoneMetadata(root, ['src/a.ts']));
  await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const value = 2;\n', 'utf8');
}

async function readEvents(folder: string): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(folder, '.run', 'events', '1.jsonl'), 'utf8')
    .catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

/** The `log` of the last `verify_ran` event in the task stream. */
async function verifyRanLog(folder: string): Promise<string> {
  const events = await readEvents(folder);
  const event = [...events].reverse().find((candidate) => candidate.type === 'verify_ran');
  return String(event?.data?.log ?? '');
}

describe('scope regression marker excerpt', () => {
  it('holds the last 40 lines and points at the full verify_ran output', async () => {
    const { root, folder, runDir } = await setup();
    await arrangeStaleTask(root, runDir);

    const result = await auditScopeRegressions({
      projectRoot: root,
      specFolderPath: folder,
      eligibleTaskNumbers: ['1'],
      verifyTimeoutSeconds: TIMEOUT_SECONDS,
    });

    assert.equal(result.stale.length, 1);
    const marker = await fs.readFile(path.join(runDir, 'regressed', '1.md'), 'utf8');
    assert.ok(marker.includes('- src/a.ts (modified)'), 'marker lists the differing path');
    assert.ok(marker.includes('line 61'), 'keeps the fortieth-from-last line');
    assert.ok(marker.includes('line 100'), 'keeps the last line');
    assert.ok(!marker.includes('line 60'), 'drops the line before the excerpt window');
    assert.ok(!/^line 1$/m.test(marker), 'drops line 1');
    const log = await verifyRanLog(folder);
    assert.ok(marker.trimEnd().endsWith(`Full output: ${log}`));
    const full = await fs.readFile(path.join(folder, log), 'utf8');
    assert.equal(full.trim().split('\n').length, 100);
    assert.match(full, /line 1\n/);
    assert.match(full, /line 100/);

    const regressed = (await readEvents(folder)).find((event) => event.type === 'regressed');
    const tail = regressed?.data?.output;
    assert.equal(typeof tail, 'string');
    assert.equal((tail as string).trim().split('\n').length, 40);
    assert.equal((tail as string).trim().split('\n')[0], 'line 61');
    assert.match(tail as string, /line 100/);
    assert.ok(!(tail as string).includes('line 60'));
  });

  it('honors configured marker output lines from the audit options', async () => {
    const { root, folder, runDir } = await setup();
    await arrangeStaleTask(root, runDir);

    await auditScopeRegressions({
      projectRoot: root,
      specFolderPath: folder,
      eligibleTaskNumbers: ['1'],
      verifyTimeoutSeconds: TIMEOUT_SECONDS,
      limits: { ...DEFAULT_CONFIG.limits, markerOutputLines: 5 },
    });

    const marker = await fs.readFile(path.join(runDir, 'regressed', '1.md'), 'utf8');
    const log = await verifyRanLog(folder);
    const lines = marker.trimEnd().split('\n');
    assert.deepEqual(lines.slice(-6), [
      'line 96',
      'line 97',
      'line 98',
      'line 99',
      'line 100',
      `Full output: ${log}`,
    ]);
    assert.ok(!marker.includes('line 95'));
    const regressed = (await readEvents(folder)).find((event) => event.type === 'regressed');
    assert.equal((regressed?.data?.output as string).trim().split('\n').length, 5);
  });
});
