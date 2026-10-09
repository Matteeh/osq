import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import type { RecordedNotice } from '../src/core/spec/notices.js';
import { appendPlanReady } from '../src/core/spec/plan-ready.js';
import { type CliCapture, runCliCaptured } from './cli-capture.js';

const ARCHIVE_DIR = path.join('openspec', 'changes', 'archive');
const REJECTED_DIR = path.join('openspec', 'changes', 'rejected');

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** A fresh temporary project root, removed after the test. */
async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-query-notices-'));
  roots.push(root);
  return root;
}

/** Writes one file under the root, creating parent folders. */
async function write(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** One recorded notice. */
function notice(id: RecordedNotice['id'], severity: RecordedNotice['severity']): RecordedNotice {
  return { id, severity, folded: false };
}

/** A proposal so the folder reads as a change. */
async function writeProposal(root: string, base: string, title: string): Promise<void> {
  await write(
    root,
    path.join(base, 'proposal.md'),
    `---\ntitle: ${title}\n---\n## Goal\n\n${title}.\n`,
  );
}

/** Change 001: two plan_ready records, a manifest notice approved unopened. */
async function writeOne(root: string): Promise<void> {
  const base = path.join(ARCHIVE_DIR, '001-alpha');
  const folder = path.join(root, base);
  await writeProposal(root, base, 'Alpha');
  await appendPlanReady(folder, 'hash-1', [notice('rules_path', 'red')]);
  await appendPlanReady(folder, 'hash-2', [notice('assumptions', 'amber')]);
  await write(
    root,
    path.join(base, '.run', 'manifest.json'),
    JSON.stringify({
      notices: { items: [{ id: 'assumptions', severity: 'amber', folded: false }], opened: [] },
    }),
  );
}

/** Change 002: a manifest notice opened, and two halts. */
async function writeTwo(root: string): Promise<void> {
  const base = path.join(ARCHIVE_DIR, '002-bravo');
  const folder = path.join(root, base);
  await writeProposal(root, base, 'Bravo');
  await appendPlanReady(folder, 'hash-1', [notice('removed_requirement', 'red')]);
  await write(
    root,
    path.join(base, '.run', 'manifest.json'),
    JSON.stringify({
      notices: {
        items: [{ id: 'removed_requirement', severity: 'red', folded: false }],
        opened: ['removed_requirement'],
      },
    }),
  );
  await write(
    root,
    path.join(base, '.run', 'events', '1.jsonl'),
    `${JSON.stringify({ type: 'retry', data: {} })}\n${JSON.stringify({ type: 'retry', data: {} })}\n`,
  );
}

/** Rejected 003: a plan_ready record and a manifest without notices. */
async function writeThree(root: string): Promise<void> {
  const base = path.join(REJECTED_DIR, '003-charlie');
  const folder = path.join(root, base);
  await writeProposal(root, base, 'Charlie');
  await appendPlanReady(folder, 'hash-1', [notice('package_json', 'amber')]);
  await write(root, path.join(base, '.run', 'manifest.json'), JSON.stringify({ planner: null }));
}

/** Archived 004: neither records nor manifest notices. */
async function writeFour(root: string): Promise<void> {
  const base = path.join(ARCHIVE_DIR, '004-delta');
  await writeProposal(root, base, 'Delta');
}

/** The stdout lines of a captured run, joined by newlines. */
function stdoutText(capture: CliCapture): string {
  return capture.lines
    .filter((line) => line.stream === 'stdout')
    .map((line) => line.text)
    .join('\n');
}

describe('osq query notices', () => {
  it('lists each recorded notice of an archived or rejected change and what followed', async () => {
    const root = await makeRoot();
    await writeOne(root);
    await writeTwo(root);
    await writeThree(root);
    await writeFour(root);

    const capture = await runCliCaptured(root, [
      'query',
      'select change, notice, opened, outcome from notices order by change, notice',
    ]);

    assert.equal(capture.exitCode, undefined);
    assert.equal(
      stdoutText(capture),
      [
        'change\tnotice\topened\toutcome',
        '001-alpha\tassumptions\t0\tapproved',
        '001-alpha\trules_path\t\tplanned_again',
        '002-bravo\tremoved_requirement\t1\thalted',
        '003-charlie\tpackage_json\t\trejected',
      ].join('\n'),
    );
  });
});
