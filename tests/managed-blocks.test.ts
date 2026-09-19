import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MANAGED_AGENTS_MD_BODY } from '../src/core/init.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const agentsMdPath = path.join(repoRoot, 'AGENTS.md');

const FEATURES_PATH = 'features/';
const DRIFT_AGAINST_FEATURES = /drift against features/i;

/**
 * `specs/` is only legitimate as part of the living layout (`openspec/specs/`)
 * or as a change-folder delta specification (`specs/<capability>/spec.md`).
 * Every other occurrence is a reference to the retired root-level `specs/`.
 */
function legacySpecsReferences(text: string): string[] {
  const offenders: string[] = [];
  for (const match of text.matchAll(/specs\//g)) {
    const index = match.index ?? 0;
    const before = text.slice(Math.max(0, index - 'openspec/'.length), index);
    const after = text.slice(index + 'specs/'.length);
    const isLivingLayout = before === 'openspec/';
    const isDeltaSpec = /^(<capability>|[A-Za-z0-9][A-Za-z0-9._-]*)\/spec\.md/.test(after);
    if (!isLivingLayout && !isDeltaSpec) {
      offenders.push(text.slice(Math.max(0, index - 24), index + 48));
    }
  }
  return offenders;
}

const documents: Array<{ label: string; text: string }> = [
  { label: 'MANAGED_AGENTS_MD_BODY', text: MANAGED_AGENTS_MD_BODY },
  { label: 'AGENTS.md', text: await fs.readFile(agentsMdPath, 'utf8') },
];

describe('managed instructions block retired paths', () => {
  for (const doc of documents) {
    describe(doc.label, () => {
      it('does not reference retired features/ paths', () => {
        assert.equal(doc.text.split(FEATURES_PATH).length - 1, 0);
      });

      it('does not reference "drift against features"', () => {
        assert.equal(DRIFT_AGAINST_FEATURES.test(doc.text), false);
      });

      it('does not reference a legacy root-level specs/ path', () => {
        assert.deepEqual(legacySpecsReferences(doc.text), []);
      });
    });
  }
});

describe('managed instructions block OpenSpec protocol', () => {
  it('documents the OpenSpec layout, markers, gates, and permissions', () => {
    const text = MANAGED_AGENTS_MD_BODY;

    assert.match(text, /proposal\.md/);
    assert.match(text, /\.run\/results\/<n>\.md/);
    assert.match(text, /`verify`/);
    assert.match(text, /`scope`/);
    assert.match(text, /delta/i);
    assert.match(text, /running\/<n>\.pid/);
    assert.match(text, /done\/<n>/);
    assert.match(text, /dead\/<n>\.md/);
    assert.match(text, /regressed\/<n>\.md/);
    assert.match(text, /approved/);
    assert.match(text, /approval gate/i);
    assert.match(text, /verification gate/i);
    assert.match(text, /derived purely from the marker files on disk/i);
    assert.match(text, /openspec\/specs\//);
    assert.match(text, /openspec\/changes\//);
  });

  it('is mirrored by the repository AGENTS.md guidance', () => {
    const text = documents[1].text;

    assert.match(text, /Executing a spec/);
    assert.match(text, /proposal\.md/);
    assert.match(text, /\.run\/results\/<n>\.md/);
    assert.match(text, /regressed/);
  });
});
