import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { checkManagedBlocks } from '../src/core/foundation/doctor-managed.js';
import { OSQ_END_MARKER, scaffoldProject } from '../src/core/foundation/init.js';
import {
  TRACEABILITY_END_MARKER,
  TRACEABILITY_START_MARKER,
  checkTraceabilityBlocks,
  renderTraceabilityBlock,
  traceabilityScope,
  writeTraceabilityBlocks,
} from '../src/core/foundation/traceability-block.js';

function opted(capabilities: 'all' | string[]): OsqConfig {
  return { ...DEFAULT_CONFIG, traceability: { capabilities, mode: 'warn' } };
}

/** The exact PLANNER.md block the cli-foundation delta specifies. */
function expectedPlanner(scope: string): string {
  return `${TRACEABILITY_START_MARKER}
## Traceability

Traceability covers ${scope}.

- Under \`## Scenarios\` in each task, list the scenarios its tests prove as \`- <capability>: <scenario name>\`, and scope their test files.
- Give a scenario with more than one case a table of exact inputs and outputs directly under its THEN.
- Put every test that names a modified scenario in its task's scope with \`tests.modify: true\`; \`osq lint\` lists them.
- Have exported functions tagged with \`@scenario\` and \`@adr\`.
${TRACEABILITY_END_MARKER}`;
}

/** The exact AGENTS.md block the cli-foundation delta specifies. */
function expectedAgents(scope: string): string {
  return `${TRACEABILITY_START_MARKER}
## Traceability

For ${scope}:

- Prove each scenario with \`import { scenario } from '@matteeh/osq/testing'\` and \`scenario('<capability>', '<scenario name>', { covers: fn }, ({ run, then, each }) => ...)\`, with literal names. Call \`fn\` only through \`run\`.
- Take expected values from the scenario's THEN lines and tables, never from running the code.
- Check a table with \`each\`. Check a rule that holds for every input with a property test inside \`then\`.
- Tag each exported function you add or change in a doc comment directly above \`export function\` or \`export const <name> = (...) =>\`: one \`@scenario <capability>: <scenario name>\` line per scenario it serves and one \`@adr <number>\` line per decision it follows.
${TRACEABILITY_END_MARKER}`;
}

function read(root: string, file: string): Promise<string> {
  return fs.readFile(path.join(root, file), 'utf8');
}

function traceMessage(file: string, problem: 'missing' | 'out of date' | 'unexpected'): string {
  if (problem === 'unexpected') {
    return `${file} has an unexpected traceability block; run \`osq init\``;
  }
  return `${file} traceability block is ${problem}; run \`osq init\``;
}

describe('traceability instruction blocks', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-trace-blocks-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes both blocks naming an opted-in capability directly after the managed block', async () => {
    const result = await scaffoldProject(tmpDir, { config: opted(['pricing']) });

    assert.equal(result.updatedTraceability, true);
    const agents = await read(tmpDir, 'AGENTS.md');
    const planner = await read(tmpDir, 'PLANNER.md');
    const agentsBlock = expectedAgents('pricing');
    const plannerBlock = expectedPlanner('pricing');

    assert.ok(agents.includes(agentsBlock));
    assert.ok(planner.includes(plannerBlock));
    const afterEnd = agents.indexOf(OSQ_END_MARKER) + OSQ_END_MARKER.length;
    assert.ok(agents.slice(afterEnd).startsWith(`\n${agentsBlock}`));
    const plannerEnd = planner.indexOf(OSQ_END_MARKER) + OSQ_END_MARKER.length;
    assert.ok(planner.slice(plannerEnd).startsWith(`\n${plannerBlock}`));
  });

  it('joins a list of two capabilities with a comma', async () => {
    await writeTraceabilityBlocks(tmpDir, opted(['pricing', 'billing']));

    const agents = await read(tmpDir, 'AGENTS.md');
    const planner = await read(tmpDir, 'PLANNER.md');
    assert.ok(agents.includes('For pricing, billing:'));
    assert.ok(planner.includes('Traceability covers pricing, billing.'));
  });

  it('renders every capability for the all opt-in', async () => {
    assert.equal(traceabilityScope(opted('all')), 'every capability');
    assert.equal(traceabilityScope(opted([])), null);

    await writeTraceabilityBlocks(tmpDir, opted('all'));

    assert.ok((await read(tmpDir, 'AGENTS.md')).includes('For every capability:'));
    assert.ok((await read(tmpDir, 'PLANNER.md')).includes('Traceability covers every capability.'));
    assert.equal(
      renderTraceabilityBlock('PLANNER.md', opted('all'))?.includes('every capability'),
      true,
    );
  });

  it('changes nothing on a second osq init', async () => {
    const first = await scaffoldProject(tmpDir, { config: opted(['pricing']) });
    const agents = await read(tmpDir, 'AGENTS.md');
    const planner = await read(tmpDir, 'PLANNER.md');

    const second = await scaffoldProject(tmpDir, { config: opted(['pricing']) });

    assert.equal(first.updatedTraceability, true);
    assert.equal(second.updatedTraceability, false);
    assert.equal(await read(tmpDir, 'AGENTS.md'), agents);
    assert.equal(await read(tmpDir, 'PLANNER.md'), planner);
  });

  it('removes both blocks and restores the files when the config stops opting in', async () => {
    await scaffoldProject(tmpDir, { config: DEFAULT_CONFIG });
    const agents = await read(tmpDir, 'AGENTS.md');
    const planner = await read(tmpDir, 'PLANNER.md');

    assert.equal(
      (await scaffoldProject(tmpDir, { config: opted(['pricing']) })).updatedTraceability,
      true,
    );
    assert.ok((await read(tmpDir, 'AGENTS.md')).includes(TRACEABILITY_START_MARKER));

    const removed = await scaffoldProject(tmpDir, { config: DEFAULT_CONFIG });

    assert.equal(removed.updatedTraceability, true);
    assert.equal(await read(tmpDir, 'AGENTS.md'), agents);
    assert.equal(await read(tmpDir, 'PLANNER.md'), planner);
  });

  it('reports a missing block for each file', async () => {
    await scaffoldProject(tmpDir, { config: DEFAULT_CONFIG });

    const errors = await checkTraceabilityBlocks(tmpDir, opted(['pricing']));

    assert.deepEqual(errors, [
      traceMessage('AGENTS.md', 'missing'),
      traceMessage('PLANNER.md', 'missing'),
    ]);
  });

  it('reports an out-of-date block', async () => {
    await scaffoldProject(tmpDir, { config: opted(['pricing']) });
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      (await read(tmpDir, 'AGENTS.md')).replace('For pricing:', 'For stale:'),
      'utf8',
    );

    const errors = await checkTraceabilityBlocks(tmpDir, opted(['pricing']));

    assert.deepEqual(errors, [traceMessage('AGENTS.md', 'out of date')]);
  });

  it('reports an unexpected block when nothing is opted in', async () => {
    await scaffoldProject(tmpDir, { config: DEFAULT_CONFIG });
    const agents = await read(tmpDir, 'AGENTS.md');
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      `${agents}${expectedAgents('pricing')}\n`,
      'utf8',
    );

    const errors = await checkTraceabilityBlocks(tmpDir, DEFAULT_CONFIG);

    assert.deepEqual(errors, [traceMessage('AGENTS.md', 'unexpected')]);
  });

  it('adds the block problems to the doctor managed-blocks result', async () => {
    await scaffoldProject(tmpDir, { config: DEFAULT_CONFIG });
    const clean = await checkManagedBlocks(tmpDir, DEFAULT_CONFIG);
    assert.equal(clean.ok, true);

    const missing = await checkManagedBlocks(tmpDir, opted(['pricing']));
    assert.equal(missing.ok, false);
    assert.ok(missing.message.includes(traceMessage('AGENTS.md', 'missing')));

    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      `${await read(tmpDir, 'AGENTS.md')}${expectedAgents('pricing')}\n`,
      'utf8',
    );
    const unexpected = await checkManagedBlocks(tmpDir, DEFAULT_CONFIG);
    assert.equal(unexpected.message, traceMessage('AGENTS.md', 'unexpected'));
  });
});
