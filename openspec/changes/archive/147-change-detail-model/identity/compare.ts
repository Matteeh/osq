// Byte-identity proof for change 147. For every change in this repository
// (active, archived and rejected, every tree `listChanges` sees) and in
// fixture/inbox, it renders `osq show <folder>` and `osq show <folder> --json`
// twice: once with the pre-change code (legacy-show.ts plus the old CLI
// composition below) and once through the current `showCommand`. Any byte of
// difference, or a different error, exits 1 and names the change, the mode
// and the first differing line. The change folder holding this file is
// skipped, because the watcher writes its events while it runs.
//
// Test files named as arguments run first with `node --test`; a missing or
// failing one exits 1 before any rendering, so a task verify is one command.
//
// Run from the project root:
//   node --import tsx openspec/changes/147-change-detail-model/identity/compare.ts [test files]
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveInputs } from '../../../../src/cli/command-inputs.js';
import { showCommand } from '../../../../src/cli/show.js';
import type { OsqConfig } from '../../../../src/core/foundation/config.js';
import {
  buildApprovalDigest,
  formatApprovalDigest,
  formatApprovalFlags,
} from '../../../../src/core/spec/digest.js';
import { listChanges } from '../../../../src/core/status/change-locations.js';
import { formatSpecDetails, getSpecDetails } from './legacy-show.js';

const ownFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(ownFolder, '../../..');
const roots = [repoRoot, path.join(repoRoot, 'fixture', 'inbox')];

interface Rendered {
  text: string;
  json: string;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** What the CLI printed before change 147, for both modes, from one model build. */
async function legacyRender(root: string, selector: string, config: OsqConfig): Promise<Rendered> {
  try {
    const details = await getSpecDetails(root, selector, config);
    const digest =
      details.approvedHash === null
        ? await buildApprovalDigest(root, details.folderPath, config)
        : null;
    const json = JSON.stringify({ ...details, digest }, null, 2);
    let text = formatSpecDetails(details);
    if (digest) {
      text += `\n${formatApprovalDigest(digest)}`;
      for (const line of formatApprovalFlags(digest.flags)) {
        text += `\n${line}`;
      }
    }
    return { text: `${text}\n`, json: `${json}\n` };
  } catch (err) {
    const failed = `error: Show error: ${message(err)}`;
    return { text: failed, json: failed };
  }
}

/** What the current `showCommand` prints for one mode. */
async function currentRender(
  root: string,
  selector: string,
  config: OsqConfig,
  json: boolean,
): Promise<string> {
  let printed = '';
  try {
    await showCommand(selector, {
      cwd: root,
      config,
      json,
      stdout: (text) => {
        printed += text;
      },
    });
    return printed;
  } catch (err) {
    return `error: ${message(err)}`;
  }
}

function firstDifference(expected: string, actual: string): string {
  const want = expected.split('\n');
  const got = actual.split('\n');
  const length = Math.max(want.length, got.length);
  for (let index = 0; index < length; index += 1) {
    if (want[index] !== got[index]) {
      return `line ${index + 1}\n    before: ${JSON.stringify(want[index])}\n    after:  ${JSON.stringify(got[index])}`;
    }
  }
  return 'same lines, different bytes';
}

const testFiles = process.argv.slice(2);
if (testFiles.length > 0) {
  const missing = testFiles.filter((file) => !existsSync(path.resolve(repoRoot, file)));
  if (missing.length > 0) {
    process.stderr.write(`missing test files: ${missing.join(', ')}\n`);
    process.exit(1);
  }
  const run = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--import', './tests/git-test-env.ts', '--test', ...testFiles],
    { cwd: repoRoot, stdio: 'inherit' },
  );
  if (run.status !== 0) process.exit(1);
}

let compared = 0;
const failures: string[] = [];
for (const root of roots) {
  const config = await resolveInputs({ cwd: root }).config();
  const changes = await listChanges(root, config);
  for (const change of changes) {
    if (path.resolve(change.folderPath) === ownFolder) continue;
    const before = await legacyRender(root, change.folderPath, config);
    for (const mode of ['text', 'json'] as const) {
      const after = await currentRender(root, change.folderPath, config, mode === 'json');
      compared += 1;
      if (after !== before[mode]) {
        const where = path.relative(repoRoot, change.folderPath);
        failures.push(`${where} (${mode}): ${firstDifference(before[mode], after)}`);
      }
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(
    `osq show output changed in ${failures.length} of ${compared} renderings:\n${failures.join('\n')}\n`,
  );
  process.exit(1);
}
process.stdout.write(`osq show output identical in ${compared} renderings\n`);
