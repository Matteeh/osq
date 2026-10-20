import assert from 'node:assert/strict';
import { scenario } from '@matteeh/osq/testing';
import { lockfileFollowsManifest } from '../src/kernel/languages/lockfiles.js';

/** The spec table wraps each cell's text in backticks; read what is inside. */
function cellText(cell: string): string {
  return cell.startsWith('`') && cell.endsWith('`') ? cell.slice(1, -1) : cell;
}

/** The manifests of one scenario-table row. */
function rowManifests(cell: string): string[] {
  return cell === '(none)' ? [] : cell.split(', ').map(cellText);
}

scenario(
  'languages',
  'Lock files and the manifests they follow',
  { covers: lockfileFollowsManifest },
  ({ run, each }) => {
    each("it returns the row's result", (row) => {
      const lockfile = cellText(row['lock file']);
      const manifests = rowManifests(row.manifests);
      assert.equal(run(lockfile, manifests), row.result === 'true');
    });
  },
);
