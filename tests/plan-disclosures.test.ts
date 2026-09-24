import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { buildOpeningPrompt, planCommand } from '../src/cli/plan.js';
import { validatePlanningConfig } from '../src/core/foundation/config-planning.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import {
  DISCLOSURES_CLAIM,
  RECENT_DISCLOSURES_HEADING,
  formatRecentDisclosures,
  quoteDisclosureText,
  truncateDisclosureEntry,
} from '../src/core/report/recent-disclosures.js';

function configWith(recentChanges: number, maxCharacters: number): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    planning: {
      idleGapMinutes: DEFAULT_CONFIG.planning?.idleGapMinutes ?? 10,
      disclosures: { recentChanges, maxCharacters },
    },
  };
}

async function writeArchiveChange(
  root: string,
  folder: string,
  results: Record<string, string>,
): Promise<void> {
  const dir = path.join(root, 'openspec', 'changes', 'archive', folder, '.run', 'results');
  await fs.mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(results)) {
    await fs.writeFile(path.join(dir, name), content, 'utf8');
  }
}

async function captureStdout(run: () => Promise<void>): Promise<string> {
  let output = '';
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Buffer) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    await run();
  } finally {
    process.stdout.write = original;
  }
  return output;
}

function entriesOf(body: string): string {
  return body.slice(DISCLOSURES_CLAIM.length + 2);
}

describe('formatRecentDisclosures', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-disclosures-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no archived change holds a disclosure', async () => {
    await writeArchiveChange(tmpDir, '001-alpha', {
      '1.md': '## Changed\n\ndid the work\n\nTouched: src/a.ts\n',
    });

    assert.equal(await formatRecentDisclosures(tmpDir, DEFAULT_CONFIG), null);
  });

  it('quotes only the configured number of newest archived changes, newest first', async () => {
    await writeArchiveChange(tmpDir, '001-one', { '1.md': '## Outside scope\n\none\n' });
    await writeArchiveChange(tmpDir, '002-two', { '1.md': '## Outside scope\n\ntwo\n' });
    await writeArchiveChange(tmpDir, '003-three', { '1.md': '## Outside scope\n\nthree\n' });
    await writeArchiveChange(tmpDir, '004-four', { '1.md': '## Outside scope\n\nfour\n' });

    const body = await formatRecentDisclosures(tmpDir, configWith(2, 4000));
    assert.ok(body);
    assert.ok(body.includes('004-four task 1, outside scope:'));
    assert.ok(body.includes('003-three task 1, outside scope:'));
    assert.ok(!body.includes('002-two'));
    assert.ok(!body.includes('001-one'));
    assert.ok(body.indexOf('004-four') < body.indexOf('003-three'));
  });

  it('orders tasks numerically and sections as deviated, missing context, outside scope', async () => {
    await writeArchiveChange(tmpDir, '001-mixed', {
      '2.md': '## Missing context\n\nmissing two\n',
      '1.md': '## Outside scope\n\noutside one\n\n## Deviated\n\ndeviated one\n',
    });

    const body = await formatRecentDisclosures(tmpDir, configWith(1, 4000));
    assert.ok(body);
    const positions = [
      body.indexOf('001-mixed task 1, deviated:'),
      body.indexOf('001-mixed task 1, outside scope:'),
      body.indexOf('001-mixed task 2, missing context:'),
    ];
    assert.ok(
      positions.every((position) => position !== -1),
      body,
    );
    assert.deepEqual(
      positions,
      [...positions].sort((a, b) => a - b),
      body,
    );
  });

  it('cuts the first entry that does not fit and includes nothing after it', async () => {
    await writeArchiveChange(tmpDir, '001-one', { '1.md': '## Outside scope\n\nA\n' });
    await writeArchiveChange(tmpDir, '002-two', {
      '1.md': `## Outside scope\n\n${'B'.repeat(300)}\n`,
    });
    await writeArchiveChange(tmpDir, '003-three', { '1.md': '## Outside scope\n\nthree\n' });
    await writeArchiveChange(tmpDir, '004-four', { '1.md': '## Outside scope\n\nfour\n' });

    const body = await formatRecentDisclosures(tmpDir, configWith(4, 140));
    assert.ok(body);
    assert.ok(body.includes('004-four task 1, outside scope:'));
    assert.ok(body.includes('003-three task 1, outside scope:'));
    assert.ok(body.includes('002-two task 1, outside scope:'));
    assert.ok(!body.includes('001-one'));
    assert.ok(body.trimEnd().endsWith('[truncated]'));
    const entries = entriesOf(body).split('\n\n');
    const total = entries.reduce((sum, entry) => sum + entry.length, 0);
    assert.ok(total <= 140, `${total} must fit the budget`);
    assert.ok(entries.at(-1)?.trimEnd().split('\n').at(-1)?.startsWith('> '));
  });

  it('never quotes Changed, Next, Touched, or result headings', async () => {
    await writeArchiveChange(tmpDir, '001-alpha', {
      '1.md': [
        '## Changed',
        '',
        'changed body',
        '',
        '## Deviated',
        '',
        'deviated body',
        '',
        '## Next',
        '',
        'next body',
        '',
        '## Missing context',
        '',
        'None',
        '',
        'Touched: src/a.ts, src/b.ts',
      ].join('\n'),
    });

    const body = await formatRecentDisclosures(tmpDir, configWith(1, 4000));
    assert.ok(body);
    assert.ok(body.includes('deviated body'));
    for (const forbidden of [
      '## Changed',
      '## Deviated',
      '## Next',
      'changed body',
      'next body',
      'Touched:',
    ]) {
      assert.ok(!body.includes(forbidden), `must omit ${forbidden}`);
    }
  });

  it('prefixes every quoted disclosure line, including one starting with #', () => {
    // The result parser treats a leading `#` as a heading boundary, so the
    // quoting helper owns the guarantee that no quoted line reads as a heading.
    assert.equal(quoteDisclosureText('# a heading\nplain text'), '> # a heading\n> plain text');
    assert.equal(truncateDisclosureEntry('label\n> abcdef', 80), 'label\n> abcdef');
  });
});

describe('planning disclosure configuration', () => {
  it('accepts a partial disclosures block over the defaults', () => {
    const resolved = validatePlanningConfig({ disclosures: { recentChanges: 5 } });
    assert.deepEqual(resolved.disclosures, { recentChanges: 5, maxCharacters: 4000 });
  });

  it('rejects a value that is not a positive integer naming the key', () => {
    for (const key of ['recentChanges', 'maxCharacters'] as const) {
      for (const value of [0, -1, 1.5, Number.NaN, '3']) {
        assert.throws(
          () => validatePlanningConfig({ disclosures: { [key]: value } }),
          new RegExp(`planning\\.disclosures\\.${key}`),
          `expected rejection for ${key}=${String(value)}`,
        );
      }
    }
  });
});

describe('plan prompt disclosure section', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-disclosures-prompt-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function openingPrompt(): Promise<string> {
    return await buildOpeningPrompt({
      projectRoot: tmpDir,
      folderPath: path.join(tmpDir, 'openspec', 'changes', '001-probe'),
      specId: '001',
      specTitle: 'Probe',
      briefContent: '# Probe\n',
      openspecRoot: DEFAULT_CONFIG.paths.openspecRoot,
      config: DEFAULT_CONFIG,
    });
  }

  it('omits the section when no archived change discloses', async () => {
    await writeArchiveChange(tmpDir, '001-alpha', { '1.md': '## Changed\n\nwork\n' });
    assert.ok(!(await openingPrompt()).includes(RECENT_DISCLOSURES_HEADING));
  });

  it('appends the claim-labelled section after the repository record', async () => {
    await writeArchiveChange(tmpDir, '001-alpha', {
      '1.md': '## Outside scope\n\nAlpha outside scope text\n',
    });

    const prompt = await openingPrompt();
    const index = prompt.indexOf(RECENT_DISCLOSURES_HEADING);
    assert.notEqual(index, -1);
    assert.ok(index > prompt.indexOf("## This repository's record"));
    assert.ok(prompt.includes(DISCLOSURES_CLAIM));
    assert.ok(prompt.trimEnd().endsWith('> Alpha outside scope text'));
  });

  it('ends osq plan <name> --print output with the section', async () => {
    await scaffoldProject(tmpDir);
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      "export default { harness: 'mock' };\n",
      'utf8',
    );
    await writeArchiveChange(tmpDir, '001-alpha', {
      '1.md': '## Deviated\n\nAlpha deviated text\n',
    });
    const brief = path.join(tmpDir, 'brief.md');
    await fs.writeFile(brief, '# Print Probe\n\nBody.\n', 'utf8');

    const stdout = await captureStdout(() =>
      planCommand('print-probe', { brief, print: true, cwd: tmpDir }),
    );

    assert.ok(stdout.includes(RECENT_DISCLOSURES_HEADING));
    assert.ok(stdout.includes(DISCLOSURES_CLAIM));
    assert.ok(stdout.trimEnd().endsWith('> Alpha deviated text'));
  });
});
