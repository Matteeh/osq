import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  countChangeDisclosures,
  parseResultSections,
  readChangeDisclosures,
} from '../src/core/report/result-sections.js';

describe('parseResultSections', () => {
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
      '',
      'Touched: src/a.ts, src/b.ts',
    ].join('\n');

    const sections = parseResultSections(content);

    assert.equal(sections.deviated, 'We skipped the migration step.');
    assert.equal(sections.missingContext, null);
    assert.equal(sections.outsideScope, 'Found a dead helper outside the task.');
    assert.equal(sections.touched, 'src/a.ts, src/b.ts');
    assert.equal(sections.changed, null);
    assert.equal(sections.next, null);
  });

  it('treats a None section, in any case with an optional period, as absent', () => {
    const content = [
      '## Changed',
      '',
      'None',
      '',
      '## Deviated',
      '',
      'none.',
      '',
      '## Missing context',
      '',
      '   ',
    ].join('\n');

    const sections = parseResultSections(content);

    assert.equal(sections.changed, null);
    assert.equal(sections.deviated, null);
    assert.equal(sections.missingContext, null);
  });

  it('reads a Touched heading and its body', () => {
    const sections = parseResultSections(['## Touched:', '', 'src/x.ts', ''].join('\n'));

    assert.equal(sections.touched, 'src/x.ts');
  });

  it('ignores unknown headings and stops the preceding section at them', () => {
    const content = [
      '## Changed',
      '',
      'did the thing',
      '',
      '## Secret sauce',
      '',
      'not a reported section',
      '',
      '## Deviated',
      '',
      'took a shortcut',
    ].join('\n');

    const sections = parseResultSections(content);

    assert.equal(sections.changed, 'did the thing');
    assert.equal(sections.deviated, 'took a shortcut');
  });

  it('returns every section null for empty content', () => {
    assert.deepEqual(parseResultSections(''), {
      changed: null,
      deviated: null,
      missingContext: null,
      outsideScope: null,
      next: null,
      touched: null,
    });
  });
});

describe('readChangeDisclosures', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-result-sections-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeResult(name: string, content: string): Promise<void> {
    const dir = path.join(tmpDir, '.run', 'results');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), content, 'utf8');
  }

  it('reads every numbered result file in numeric order', async () => {
    await writeResult('2.md', '## Deviated\n\nshortcut taken\n');
    await writeResult('10.md', '## Outside Scope\n\nbroken helper left alone\n');
    await writeResult('1.md', '## Changed\n\ndid the work\n');

    const disclosures = await readChangeDisclosures(tmpDir);

    assert.deepEqual(disclosures, [
      {
        task: '2',
        deviated: 'shortcut taken',
        missingContext: null,
        outsideScope: null,
      },
      {
        task: '10',
        deviated: null,
        missingContext: null,
        outsideScope: 'broken helper left alone',
      },
    ]);

    assert.deepEqual(await countChangeDisclosures(tmpDir), {
      deviated: 1,
      missingContext: 0,
      outsideScope: 1,
    });
  });

  it('ignores a task whose only sections are None and a missing results folder', async () => {
    await writeResult('3.md', '## Missing context\n\nNone\n\n## Deviated\n\nNone.\n');
    await writeResult('notes.md', '## Deviated\n\nshould not be counted\n');

    assert.deepEqual(await readChangeDisclosures(tmpDir), []);
    assert.deepEqual(await countChangeDisclosures(path.join(tmpDir, 'absent')), {
      deviated: 0,
      missingContext: 0,
      outsideScope: 0,
    });
  });
});
