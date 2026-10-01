import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { type DecisionRecords, readDecisions } from '../src/core/foundation/decisions.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-decisions-date-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const target = path.join(tmpDir, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function adrFile(frontmatter: string, heading: string, body = ''): string {
  return `---\n${frontmatter}\n---\n# ${heading}\n\n${body}`;
}

function read(config: OsqConfig = DEFAULT_CONFIG): Promise<DecisionRecords> {
  return readDecisions(tmpDir, config);
}

describe('architecture decision dates', () => {
  it('reads the first date on the first `Date:` line as the ADR date', async () => {
    await write(
      'decisions/007-ui-framework.md',
      adrFile(
        'status: accepted\napplies_to: all\nrule: UI uses React.',
        '007. UI framework',
        'Date: 2026-09-18. Revised: 2026-09-26.\n',
      ),
    );

    const records = await read();
    assert.equal(records.adrs[0].date, '2026-09-18');
  });

  it('reads a date from a `Date:` line that is not the first body line', async () => {
    await write(
      'decisions/007-ui-framework.md',
      adrFile(
        'status: accepted\napplies_to: all\nrule: UI uses React.',
        '007. UI framework',
        '## Status\n\nAccepted\n\nDate: 2026-09-30\n',
      ),
    );

    const records = await read();
    assert.equal(records.adrs[0].date, '2026-09-30');
  });

  it('reads a missing date as null', async () => {
    await write(
      'decisions/007-ui-framework.md',
      adrFile(
        'status: accepted\napplies_to: all\nrule: UI uses React.',
        '007. UI framework',
        '## Status\n\nAccepted\n',
      ),
    );

    const records = await read();
    assert.equal(records.adrs[0].date, null);
  });

  it('reads a `Date:` line without a date as null', async () => {
    await write(
      'decisions/007-ui-framework.md',
      adrFile(
        'status: accepted\napplies_to: all\nrule: UI uses React.',
        '007. UI framework',
        'Date: unknown\n',
      ),
    );

    const records = await read();
    assert.equal(records.adrs[0].date, null);
  });

  it('leaves every other field as before', async () => {
    await write(
      'decisions/007-ui-framework.md',
      adrFile(
        'status: accepted\napplies_to: all\nrule: UI uses React.',
        '007. UI framework',
        'Date: 2026-09-18\n',
      ),
    );

    const records = await read();
    const record = records.adrs[0];
    assert.equal(record.number, '007');
    assert.equal(record.title, 'UI framework');
    assert.equal(record.status, 'accepted');
    assert.equal(record.rule, 'UI uses React.');
    assert.deepEqual(records.ignored, []);
  });

  it('reads this repository ADRs 003 and 007 with their dates', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const dates = new Map(records.adrs.map((adr) => [adr.number, adr.date]));

    assert.equal(dates.get('003'), '2026-09-18');
    assert.equal(dates.get('007'), '2026-09-30');
  });
});
