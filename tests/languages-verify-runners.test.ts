import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scenario } from '@matteeh/osq/testing';
import {
  LANGUAGE_PRESETS,
  type VerifyRunner,
  verifyRunners,
} from '../src/kernel/languages/presets.js';

/** The languages of one scenario-table row. */
function rowLanguages(cell: string): string[] {
  return cell === '(none)' ? [] : cell.split(', ');
}

/** The runners of one scenario-table row, read from its prose cell. */
function rowRunners(cell: string): VerifyRunner[] {
  const text = cell.replaceAll('`', '');
  if (text === '(none)') return [];
  const match = /^(\S+) with (.+)$/.exec(text);
  assert.ok(match, `unrecognized runners cell: ${cell}`);
  return [{ binary: match[1], subcommands: match[2].split(', ') }];
}

const CARGO: VerifyRunner = {
  binary: 'cargo',
  subcommands: ['test', 'nextest', 'build', 'check', 'clippy', 'fmt', 'run'],
};

scenario(
  'languages',
  'Verify runners of the languages',
  { covers: verifyRunners },
  ({ run, each }) => {
    each("it returns the row's runners", (row) => {
      assert.deepEqual(run(rowLanguages(row.languages)), rowRunners(row.runners));
    });
  },
);

describe('preset verify runners', () => {
  it("matches every preset's runners to its row of the presets table", () => {
    const rows: Record<string, readonly VerifyRunner[]> = {
      'TypeScript/JavaScript': [],
      Rust: [CARGO],
      Python: [],
      Go: [],
    };
    assert.deepEqual(
      LANGUAGE_PRESETS.map((preset) => preset.name).sort(),
      Object.keys(rows).sort(),
    );
    for (const preset of LANGUAGE_PRESETS) {
      assert.deepEqual(preset.verifyRunners, rows[preset.name], preset.name);
    }
  });
});
