import assert from 'node:assert/strict';
import { scenario } from '@matteeh/osq/testing';
import { lockRebuildCommand } from '../src/kernel/languages/lockfiles.js';

/** The spec table wraps each cell's text in backticks; read what is inside. */
function cellText(cell: string): string {
  return cell.startsWith('`') && cell.endsWith('`') ? cell.slice(1, -1) : cell;
}

/** The command of one scenario-table row, `null` standing for no command. */
function rowCommand(cell: string): string | null {
  const text = cellText(cell);
  return text === 'null' ? null : text;
}

scenario(
  'languages',
  'Rebuild command of a lock file',
  { covers: lockRebuildCommand },
  ({ run, each }) => {
    each("it returns the row's command", (row) => {
      const lockfile = cellText(row['lock file']);
      assert.equal(run(lockfile), rowCommand(row.command));
    });
  },
);
