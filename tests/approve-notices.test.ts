import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveCommand } from '../src/cli/approve.js';
import { CommandError } from '../src/cli/command-error.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { buildManifest } from '../src/core/run/manifest.js';
import { approveSpec } from '../src/core/spec/approve.js';
import {
  captureLogs,
  createChange,
  createProject,
  readManifest,
  restoreEnv,
} from './planning-observed-helpers.js';

/**
 * A living `alpha` capability whose `Alpha one` requirement the fixture change
 * removes, so approval carries a red `removed_requirement` notice.
 */
const LIVING_ALPHA = `# alpha Specification

## Purpose

Provides the alpha capability for the approval notices fixture.

## Requirements

### Requirement: Alpha one
The system SHALL do the alpha thing.

#### Scenario: Alpha works
- **WHEN** alpha runs
- **THEN** it works
`;

const REMOVED_DELTA = `# Spec Delta: alpha

## REMOVED Requirements

### Requirement: Alpha one
`;

/** A second delta that deliberately creates `beta`, so approval carries a grey `new_capability` notice. */
const CREATED_DELTA = `# Spec Delta: beta

## Purpose

Beta is a capability this change deliberately creates to prove the new_capability notice.

## ADDED Requirements

### Requirement: Beta thing
The system SHALL do the beta thing.

#### Scenario: Beta works
- **WHEN** beta runs
- **THEN** it works
`;

/** Root, id, and folder of a fresh project fixture. */
interface Fixture {
  readonly root: string;
  readonly specId: string;
  readonly folderPath: string;
}

/**
 * A change that removes `Alpha one`: its living `alpha` spec exists beside its
 * removed-requirement delta, so `osq approve` lints, prints the red notice, and
 * seals as `tests/show-digest.test.ts` approves.
 */
async function removedChange(root: string, index: number): Promise<Fixture> {
  const change = await createChange(root, `Red Notice ${index}`);
  const alphaDir = path.join(root, 'openspec', 'specs', 'alpha');
  await fs.mkdir(alphaDir, { recursive: true });
  await fs.writeFile(path.join(alphaDir, 'spec.md'), LIVING_ALPHA, 'utf8');
  const deltaDir = path.join(change.folderPath, 'specs', 'alpha');
  await fs.mkdir(deltaDir, { recursive: true });
  await fs.writeFile(path.join(deltaDir, 'spec.md'), REMOVED_DELTA, 'utf8');
  return { root, specId: change.specId, folderPath: change.folderPath };
}

/**
 * The removed change plus a created `beta` capability, so approval carries one
 * red and one grey notice.
 */
async function redAndGreyChange(root: string, index: number): Promise<Fixture> {
  const fixture = await removedChange(root, index);
  const proposal = await fs.readFile(path.join(fixture.folderPath, 'proposal.md'), 'utf8');
  await fs.writeFile(
    path.join(fixture.folderPath, 'proposal.md'),
    proposal.replace('verify: node verify.cjs\n', 'verify: node verify.cjs\ncreates:\n  - beta\n'),
    'utf8',
  );
  const deltaDir = path.join(fixture.folderPath, 'specs', 'beta');
  await fs.mkdir(deltaDir, { recursive: true });
  await fs.writeFile(path.join(deltaDir, 'spec.md'), CREATED_DELTA, 'utf8');
  return fixture;
}

/** A grey-only change: one deliberately created capability and nothing else. */
async function greyChange(root: string, index: number): Promise<Fixture> {
  const change = await createChange(root, `Grey Notice ${index}`);
  const proposal = await fs.readFile(path.join(change.folderPath, 'proposal.md'), 'utf8');
  await fs.writeFile(
    path.join(change.folderPath, 'proposal.md'),
    proposal
      .replace('verify: node verify.cjs\n', 'verify: node verify.cjs\ncreates:\n  - beta\n')
      .replace('verify: node verify.cjs', 'verify: node --import tsx --test tests/sample.test.ts'),
    'utf8',
  );
  const task = await fs.readFile(path.join(change.folderPath, 'tasks', '1.md'), 'utf8');
  await fs.writeFile(
    path.join(change.folderPath, 'tasks', '1.md'),
    task.replace(
      'verify: node verify.cjs',
      'verify: node --import tsx --test tests/sample.test.ts',
    ),
    'utf8',
  );
  await fs.mkdir(path.join(root, 'tests'), { recursive: true });
  await fs.writeFile(path.join(root, 'tests', 'sample.test.ts'), '// fixture test\n', 'utf8');
  const deltaDir = path.join(change.folderPath, 'specs', 'beta');
  await fs.mkdir(deltaDir, { recursive: true });
  await fs.writeFile(path.join(deltaDir, 'spec.md'), CREATED_DELTA, 'utf8');
  return { root, specId: change.specId, folderPath: change.folderPath };
}

describe('osq approve notices', () => {
  let root = '';
  let counter = 0;

  beforeEach(() => {
    restoreEnv();
    counter = 0;
  });
  afterEach(async () => {
    restoreEnv();
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('prints the notices before the digest, with and without --confirm', async () => {
    root = await createProject();
    const fixture = await removedChange(root, counter++);

    const plain = await captureLogs(() =>
      approveCommand([fixture.specId], {
        cwd: root,
        config: DEFAULT_CONFIG,
        planningReaders: [],
        now: new Date(),
      }),
    );
    const noticesIndex = plain.findIndex((line) => line === 'Notices:');
    const redIndex = plain.findIndex((line) => line.startsWith('  RED removes requirements'));
    const digestIndex = plain.findIndex((line) => line.startsWith('Change: '));
    assert.ok(noticesIndex >= 0, `stdout should hold Notices:, got:\n${plain.join('\n')}`);
    assert.ok(redIndex >= 0, `stdout should hold the red notice, got:\n${plain.join('\n')}`);
    assert.equal(plain[redIndex], '  RED removes requirements \u2014 alpha: Alpha one');
    assert.ok(
      digestIndex >= 0 && noticesIndex < digestIndex,
      'the notices should print before the digest',
    );

    // A second project reuses a grey-only change, so --confirm has no flags and
    // asks nothing, and the notice block still prints first.
    const grey = await greyChange(root, counter++);
    let asked = false;
    const confirmed = await captureLogs(() =>
      approveCommand([grey.specId], {
        cwd: root,
        config: DEFAULT_CONFIG,
        planningReaders: [],
        now: new Date(),
        confirm: true,
        isTerminal: () => true,
        ask: async () => {
          asked = true;
          return 'y';
        },
      }),
    );
    assert.equal(asked, false);
    assert.ok(confirmed.includes('Notices: Nothing unusual'));
    assert.ok(confirmed.includes('  GREY new capability \u2014 beta'));
  });

  it('refuses an unopened red notice and writes nothing', async () => {
    root = await createProject();
    const fixture = await removedChange(root, counter++);

    await assert.rejects(
      approveSpec(root, fixture.specId, DEFAULT_CONFIG, {
        planningReaders: [],
        openedNotices: [],
      }),
      /open each red notice before approving: removes requirements/,
    );
    await assert.rejects(fs.stat(path.join(fixture.folderPath, '.run', 'approved')));
    await assert.rejects(fs.stat(path.join(fixture.folderPath, '.run', 'manifest.json')));
  });

  it('reaches the CLI refusal through approveCommand', async () => {
    root = await createProject();
    const fixture = await removedChange(root, counter++);

    let caught: CommandError | undefined;
    const lines = await captureLogs(async () => {
      try {
        await approveCommand([fixture.specId], {
          cwd: root,
          config: DEFAULT_CONFIG,
          planningReaders: [],
          now: new Date(),
          openedNotices: [],
        });
      } catch (error) {
        if (!(error instanceof CommandError)) throw error;
        caught = error;
      }
    });
    assert.ok(caught instanceof CommandError);
    assert.equal(caught.exitCode, 1);
    assert.ok(
      caught.message.includes('Error approving '),
      `the refusal is an approval error, got: ${caught.message}`,
    );
    assert.ok(
      caught.message.includes('open each red notice before approving: removes requirements'),
      `the refusal names the red notice, got:\n${caught.message}\n${lines.join('\n')}`,
    );
    await assert.rejects(fs.stat(path.join(fixture.folderPath, '.run', 'approved')));
    await assert.rejects(fs.stat(path.join(fixture.folderPath, '.run', 'manifest.json')));
  });

  it('records the opened notices on the digest, filtering unknown ids', async () => {
    root = await createProject();
    const fixture = await removedChange(root, counter++);

    const result = await approveSpec(root, fixture.specId, DEFAULT_CONFIG, {
      planningReaders: [],
      openedNotices: ['removed_requirement', 'unknown'],
    });

    assert.ok(result.digest.notices, 'confirmApproval should set the digest notices');
    assert.deepEqual(result.digest.notices.opened, ['removed_requirement']);
    assert.ok(
      result.digest.notices.items.some(
        (item) => item.id === 'removed_requirement' && item.severity === 'red',
      ),
      'the removed_requirement notice should be recorded',
    );
  });

  it('records the notices in the approval manifest, next to approvalFlags', async () => {
    root = await createProject();
    const fixture = await redAndGreyChange(root, counter++);

    await approveSpec(root, fixture.specId, DEFAULT_CONFIG, { planningReaders: [] });

    const manifest = await readManifest(fixture.folderPath);
    assert.ok(manifest.notices, 'the approval manifest should carry notices');
    const notices = manifest.notices as {
      items: Array<{ id: string; severity: string; folded: boolean }>;
      opened: string[] | null;
    };
    assert.deepEqual(
      notices.items.map((item) => [item.id, item.severity, item.folded]),
      [
        ['removed_requirement', 'red', false],
        ['new_capability', 'grey', false],
      ],
    );
    assert.equal(notices.opened, null);
    assert.ok(manifest.approvalFlags, 'approvalFlags stays next to notices');
  });

  it('omits notices from a planning-only manifest', async () => {
    root = await createProject();
    const change = await createChange(root, 'Planning Only');
    const manifest = await buildManifest(root, change.folderPath, DEFAULT_CONFIG);
    assert.equal('notices' in manifest, false);
  });

  it('omits opened ids that no notice of the change carries', async () => {
    root = await createProject();
    const fixture = await greyChange(root, counter++);

    const result = await approveSpec(root, fixture.specId, DEFAULT_CONFIG, {
      planningReaders: [],
      openedNotices: ['removed_requirement'],
    });

    assert.ok(result.digest.notices);
    assert.deepEqual(result.digest.notices.opened, []);
    // The red notice is not its own id: `removed_requirement` opens nothing
    // here because the change carries only the grey `new_capability`.
    assert.deepEqual(
      result.digest.notices.items.map((item) => item.id),
      ['new_capability'],
    );
  });

  it('opens nothing and records null when openedNotices is not given', async () => {
    root = await createProject();
    const fixture = await removedChange(root, counter++);

    const result = await approveSpec(root, fixture.specId, DEFAULT_CONFIG, {
      planningReaders: [],
    });

    assert.ok(result.digest.notices);
    assert.equal(result.digest.notices.opened, null);
  });
});
