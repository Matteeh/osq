import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCliCaptured } from './cli-capture.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** The exact executor line the cli-foundation delta puts under "Where things live". */
const EXECUTOR_QUERY_LINE =
  '- Archived changes live under `openspec/changes/archive/`. For facts about them, such as why tasks died or which changes touched a requirement, run `osq query "<select>"` and add `LIMIT`; `osq query` alone lists its tables. Don\'t open event files for history.';

/** The exact planner line the cli-foundation delta puts after the grep line. */
const PLANNER_QUERY_LINE =
  '- For osq\'s own history, such as earlier changes to a requirement, dead reasons, or executor disclosures, run `osq query "<select>"` and add `LIMIT`; `osq query` alone lists its tables. Don\'t open event files for it.';

describe('history query managed blocks', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-query-blocks-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('osq init tells planners and executors to use osq query', async () => {
    const capture = await runCliCaptured(tmpDir, ['init']);
    assert.equal(capture.exitCode, undefined);

    const planner = await fs.readFile(path.join(tmpDir, 'PLANNER.md'), 'utf8');
    const agents = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf8');

    assert.ok(planner.includes(PLANNER_QUERY_LINE), 'PLANNER.md should name osq query');
    assert.ok(agents.includes(EXECUTOR_QUERY_LINE), 'AGENTS.md should name osq query');
  });

  it("this repository's copies hold the same lines", async () => {
    const [agents, planner, opencode] = await Promise.all([
      fs.readFile(path.join(repoRoot, 'AGENTS.md'), 'utf8'),
      fs.readFile(path.join(repoRoot, 'PLANNER.md'), 'utf8'),
      fs.readFile(path.join(repoRoot, '.opencode', 'agent', 'osq-coder.md'), 'utf8'),
    ]);

    assert.ok(agents.includes(EXECUTOR_QUERY_LINE), 'AGENTS.md should name osq query');
    assert.ok(planner.includes(PLANNER_QUERY_LINE), 'PLANNER.md should name osq query');
    assert.ok(opencode.includes(EXECUTOR_QUERY_LINE), 'osq-coder.md should name osq query');
  });
});
