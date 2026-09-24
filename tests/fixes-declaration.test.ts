import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { planCommand } from '../src/cli/plan.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { parseSpecMd } from '../src/core/spec/parser.js';
import { parseQueue, prepareQueuePlan, projectQueue } from '../src/core/status/queue.js';

const OPENSPEC = 'openspec';
const QUEUE_PATH = 'openspec/queue.md';

interface ItemSpec {
  slug: string;
  title: string;
  depends?: string;
  fixes?: string;
  body?: string;
}

function queueContent(items: ItemSpec[]): string {
  return items
    .map((item) => {
      const lines = [`## [${item.slug}] ${item.title}`, `Depends on: ${item.depends ?? 'nothing'}`];
      if (item.fixes !== undefined) lines.push(`Fixes: ${item.fixes}`);
      lines.push('', item.body ?? `Brief body for ${item.slug}.`, '');
      return lines.join('\n');
    })
    .join('\n');
}

function sectionHash(content: string, slug: string): string {
  const marker = `## [${slug}] `;
  const start = content.indexOf(marker);
  assert.ok(start >= 0, `missing queue marker for ${slug}`);
  const next = content.indexOf('## [', start + marker.length);
  const raw = content.slice(start, next === -1 ? content.length : next);
  return `sha256:${createHash('sha256').update(raw, 'utf8').digest('hex')}`;
}

async function writeAt(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function proposalMd(title: string): string {
  return ['---', `title: ${title}`, 'depends_on: []', '---', '## Goal', `${title} goal.`, ''].join(
    '\n',
  );
}

function taskMd(): string {
  return [
    '---',
    'title: Task 1',
    'verify: node -e "process.exit(0)"',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] done',
    '',
  ].join('\n');
}

function briefMd(slug: string, hash: string | null): string {
  const lines = ['---', `queue_item: ${slug}`];
  if (hash !== null) lines.push(`queue_hash: ${hash}`);
  lines.push('---', `Brief body for ${slug}.`, '');
  return lines.join('\n');
}

type Location = 'active' | 'archive';

async function createQueuedChange(
  root: string,
  location: Location,
  folderName: string,
  slug: string,
  hash: string,
): Promise<string> {
  const base =
    location === 'active'
      ? path.join(root, OPENSPEC, 'changes', folderName)
      : path.join(root, OPENSPEC, 'changes', 'archive', folderName);
  await fs.mkdir(path.join(base, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(base, 'proposal.md'), proposalMd(folderName), 'utf8');
  await fs.writeFile(path.join(base, 'tasks', '1.md'), taskMd(), 'utf8');
  await fs.writeFile(path.join(base, 'brief.md'), briefMd(slug, hash), 'utf8');
  return base;
}

function expectParseError(content: string, pattern: RegExp): void {
  assert.throws(
    () => parseQueue(content, QUEUE_PATH),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, pattern);
      assert.match(error.message, /openspec\/queue\.md/);
      return true;
    },
  );
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-fixes-'));
  process.exitCode = undefined;
});

afterEach(async () => {
  process.exitCode = undefined;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('proposal fixes parsing', () => {
  it('reads fixes normalized like depends_on', () => {
    const spec = parseSpecMd(
      ['---', 'title: T', 'depends_on: [1]', 'fixes: [2, "003"]', '---', '## Goal', 'G', ''].join(
        '\n',
      ),
    );
    assert.deepEqual(spec.dependsOn, ['001']);
    assert.deepEqual(spec.fixes, ['002', '003']);
  });

  it('reads an absent or malformed fixes value as an empty list', () => {
    const absent = parseSpecMd(['---', 'title: T', '---', '## Goal', 'G', ''].join('\n'));
    assert.deepEqual(absent.fixes, []);
    const scalar = parseSpecMd(
      ['---', 'title: T', 'fixes: 7', '---', '## Goal', 'G', ''].join('\n'),
    );
    assert.deepEqual(scalar.fixes, []);
    const object = parseSpecMd(
      ['---', 'title: T', 'fixes:', '  one: two', '---', '## Goal', 'G', ''].join('\n'),
    );
    assert.deepEqual(object.fixes, []);
  });
});

describe('lint fixes declaration', () => {
  function proposalDoc(fixes: string): string {
    return [
      '---',
      'title: Fixes Probe',
      'depends_on: []',
      `fixes: [${fixes}]`,
      'verify: node verify.cjs',
      'features:',
      '  reads: []',
      '---',
      '## Goal',
      'Goal.',
      '## Contract',
      '### Requirement: Probe',
      'The system SHALL probe.',
      '#### Scenario: Probe',
      '- **WHEN** probed',
      '- **THEN** probes',
      '## Non-goals',
      'None',
      '## Surface',
      'None',
      '## Delta',
      'None',
      '',
    ].join('\n');
  }

  async function writeChange(name: string, fixes: string): Promise<string> {
    const folder = path.join(tmpDir, OPENSPEC, 'changes', name);
    await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(folder, 'proposal.md'), proposalDoc(fixes), 'utf8');
    await fs.writeFile(
      path.join(folder, 'tasks', '1.md'),
      [
        '---',
        'title: Probe',
        'verify: node verify.cjs',
        'scope: []',
        'entry: []',
        'skills: []',
        '---',
        '## Acceptance',
        '- [ ] done',
        '',
      ].join('\n'),
      'utf8',
    );
    return folder;
  }

  it('reports fixes naming a missing change', async () => {
    const folder = await writeChange('001-probe', '999');
    const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('fixes names missing change: 999'));
  });

  it('accepts fixes naming an active, archived, or rejected change', async () => {
    await fs.mkdir(path.join(tmpDir, OPENSPEC, 'changes', 'archive', '042-archived'), {
      recursive: true,
    });
    const folder = await writeChange('001-probe', '042');
    const result = await lintChangeFolder(tmpDir, folder, DEFAULT_CONFIG);
    assert.equal(
      result.errors.some((error) => error.startsWith('fixes names missing change')),
      false,
    );
  });
});

describe('queue fixes parsing', () => {
  it('parses an optional fixes line out of the body with an unchanged hash', () => {
    const content = queueContent([
      { slug: 'first-item', title: 'First Item' },
      { slug: 'second-item', title: 'Second Item', fixes: 'first-item' },
    ]);
    const items = parseQueue(content, QUEUE_PATH);
    assert.deepEqual(items[0].fixes, []);
    assert.deepEqual(items[1].fixes, ['first-item']);
    assert.equal(items[1].body, 'Brief body for second-item.');
    assert.ok(!items[1].body.includes('Fixes:'));
    assert.equal(items[1].hash, sectionHash(content, 'second-item'));
  });

  it('accepts a fixes line beside dependencies', () => {
    const content = queueContent([
      { slug: 'one', title: 'One' },
      { slug: 'two', title: 'Two' },
      { slug: 'three', title: 'Three', depends: 'one', fixes: 'two' },
    ]);
    const items = parseQueue(content, QUEUE_PATH);
    assert.deepEqual(items[2].fixes, ['two']);
    assert.deepEqual(items[2].dependsOn, ['one']);
  });

  it('rejects an empty fixes line and an invalid slug', () => {
    expectParseError('## [a] A\nDepends on: nothing\nFixes:\n\nA\n', /empty fixes/);
    expectParseError('## [a] A\nDepends on: nothing\nFixes: Bad_Slug\n\nA\n', /invalid fix/);
  });

  it('rejects repeated, self, forward, and unknown fixes', () => {
    expectParseError(
      '## [a] A\nDepends on: nothing\n\nA\n\n## [b] B\nDepends on: nothing\nFixes: a, a\n\nB\n',
      /repeats fix/,
    );
    expectParseError('## [a] A\nDepends on: nothing\nFixes: a\n\nA\n', /earlier item/);
    expectParseError(
      '## [a] A\nDepends on: nothing\nFixes: b\n\nA\n\n## [b] B\nDepends on: nothing\n\nB\n',
      /earlier item/,
    );
    expectParseError('## [a] A\nDepends on: nothing\nFixes: missing\n\nA\n', /earlier item/);
  });

  it('rejects a second fixes line', () => {
    expectParseError('## [a] A\nDepends on: nothing\n\nA body.\nFixes: a\n', /more than one Fixes/);
    expectParseError(
      '## [a] A\nDepends on: nothing\n\nA\n\n## [b] B\nDepends on: nothing\nFixes: a\n\nB\nFixes: a\n',
      /more than one Fixes/,
    );
  });
});

describe('queue fixes waiting and seeding', () => {
  it('keeps unlanded fixes after dependencies in unmet dependencies', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta' },
      { slug: 'gamma', title: 'Gamma', depends: 'alpha', fixes: 'beta' },
    ]);
    await writeAt(tmpDir, QUEUE_PATH, content);

    const projection = await projectQueue(tmpDir, DEFAULT_CONFIG);
    const gamma = projection.items.find((row) => row.slug === 'gamma');
    assert.deepEqual(gamma?.unmetDependencies, ['alpha', 'beta']);
  });

  it('waits on an unlanded fixed item rather than planning it', async () => {
    const content = queueContent([
      { slug: 'first-item', title: 'First Item' },
      { slug: 'second-item', title: 'Second Item', fixes: 'first-item' },
    ]);
    await writeAt(tmpDir, QUEUE_PATH, content);
    await createQueuedChange(
      tmpDir,
      'active',
      '010-first-item',
      'first-item',
      sectionHash(content, 'first-item'),
    );

    const preparation = await prepareQueuePlan(tmpDir, DEFAULT_CONFIG);
    assert.equal(preparation.kind, 'refused');
    if (preparation.kind === 'refused') {
      assert.match(preparation.message, /second-item: unplanned \(waiting on first-item\)/);
    }
  });

  it('seeds a landed fix as the new proposal fixes id', async () => {
    const content = queueContent([
      { slug: 'first-item', title: 'First Item' },
      { slug: 'second-item', title: 'Second Item', fixes: 'first-item' },
    ]);
    await writeAt(tmpDir, QUEUE_PATH, content);
    await createQueuedChange(
      tmpDir,
      'archive',
      '020-first-item',
      'first-item',
      sectionHash(content, 'first-item'),
    );

    let stdout = '';
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Buffer) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;
    try {
      await planCommand(undefined, { next: true, print: true, cwd: tmpDir });
    } finally {
      process.stdout.write = originalWrite;
    }

    const folder = path.join(tmpDir, OPENSPEC, 'changes', '021-second-item');
    const proposal = await fs.readFile(path.join(folder, 'proposal.md'), 'utf8');
    const lines = proposal.split('\n');
    const depIndex = lines.findIndex((line) => line.startsWith('depends_on:'));
    assert.ok(depIndex >= 0, 'proposal carries depends_on');
    assert.equal(lines[depIndex], 'depends_on: []');
    assert.equal(lines[depIndex + 1], 'fixes: ["020"]');
    assert.match(stdout, /# Change: 021 - Second Item/);
  });

  it('seeds fixes through createNewSpec only when non-empty', async () => {
    const withFixes = await createNewSpec(tmpDir, 'With Fixes', {
      slug: 'with-fixes',
      dependsOn: ['001'],
      fixes: ['007'],
    });
    const proposal = await fs.readFile(path.join(withFixes.folderPath, 'proposal.md'), 'utf8');
    assert.match(proposal, /^depends_on: \["001"\]$/m);
    assert.match(proposal, /^fixes: \["007"\]$/m);

    const without = await createNewSpec(tmpDir, 'Without Fixes', {
      slug: 'without-fixes',
      dependsOn: ['001'],
    });
    const empty = await fs.readFile(path.join(without.folderPath, 'proposal.md'), 'utf8');
    assert.equal(/^fixes:/m.test(empty), false);
  });
});
