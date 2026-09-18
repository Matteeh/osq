import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  getArchiveDir,
  getChangeRunDir,
  getChangeTasksDir,
  getChangesDir,
  getDeadMarkerPath,
  getDoneMarkerPath,
  getEventsPath,
  getSpecsDir,
} from '../src/core/layout.js';

const LAYOUT_SRC = fileURLToPath(new URL('../src/core/layout.ts', import.meta.url));

describe('layout path derivation', () => {
  it('derives the changes directory from a relative openspecRoot', () => {
    assert.equal(getChangesDir('openspec'), path.join('openspec', 'changes'));
  });

  it('derives the changes directory from an absolute openspecRoot', () => {
    assert.equal(getChangesDir('/repo/openspec'), path.join('/repo/openspec', 'changes'));
  });

  it('prepends an optional project root', () => {
    assert.equal(
      getChangesDir('openspec', '/project'),
      path.join('/project', 'openspec', 'changes'),
    );
    assert.equal(
      getArchiveDir('openspec', '/project'),
      path.join('/project', 'openspec', 'changes', 'archive'),
    );
    assert.equal(getSpecsDir('openspec', '/project'), path.join('/project', 'openspec', 'specs'));
  });

  it('derives the archive directory from openspecRoot', () => {
    assert.equal(getArchiveDir('openspec'), path.join('openspec', 'changes', 'archive'));
    assert.equal(
      getArchiveDir('/repo/openspec'),
      path.join('/repo/openspec', 'changes', 'archive'),
    );
  });

  it('derives the specs directory from openspecRoot', () => {
    assert.equal(getSpecsDir('openspec'), path.join('openspec', 'specs'));
    assert.equal(getSpecsDir('/repo/openspec'), path.join('/repo/openspec', 'specs'));
  });

  it('derives change-local directories from the change folder', () => {
    const change = path.join('openspec', 'changes', '001-example');
    assert.equal(getChangeRunDir(change), path.join(change, '.run'));
    assert.equal(getChangeTasksDir(change), path.join(change, 'tasks'));
  });

  it('derives done, dead, and event artifact paths', () => {
    const change = path.join('openspec', 'changes', '001-example');
    assert.equal(getDoneMarkerPath(change, '3'), path.join(change, '.run', 'done', '3'));
    assert.equal(getDeadMarkerPath(change, '3'), path.join(change, '.run', 'dead', '3.md'));
    assert.equal(getEventsPath(change, '3'), path.join(change, '.run', 'events', '3.jsonl'));
  });

  it('anchors absolute change folders without rebasing them', () => {
    const change = path.join('/repo', 'openspec', 'changes', '001-example');
    assert.equal(getChangeRunDir(change), path.join(change, '.run'));
    assert.equal(getChangeTasksDir(change), path.join(change, 'tasks'));
    assert.equal(getDoneMarkerPath(change, '1'), path.join(change, '.run', 'done', '1'));
    assert.equal(getDeadMarkerPath(change, '1'), path.join(change, '.run', 'dead', '1.md'));
    assert.equal(getEventsPath(change, '1'), path.join(change, '.run', 'events', '1.jsonl'));
  });

  it('derives deterministically and tracks the configured root', () => {
    assert.equal(getChangesDir('custom-root'), path.join('custom-root', 'changes'));
    assert.equal(getChangesDir('custom-root'), getChangesDir('custom-root'));
    assert.notEqual(getChangesDir('root-a'), getChangesDir('root-b'));
  });

  it('keeps the layout module under 200 lines', async () => {
    const source = await fs.readFile(LAYOUT_SRC, 'utf8');
    assert.ok(source.split('\n').length <= 200, 'src/core/layout.ts exceeds 200 lines');
  });
});
