import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { runDoctorChecks } from '../src/core/foundation/doctor.js';
import {
  MANAGED_AGENTS_MD_BODY,
  MANAGED_CLAUDE_PLAN_COMMAND,
  MANAGED_PLANNER_BLOCK,
  OSQ_END_MARKER,
  OSQ_START_MARKER,
} from '../src/core/foundation/init.js';
import { OPENSPEC_EXPECTED_VERSION } from '../src/core/spec/linter.js';
import { OpencodeAdapter } from '../src/harness/opencode/opencode.js';
import { defineConfig } from '../src/index.js';

const DEFAULT_AGENT = DEFAULT_CONFIG.opencode?.agent ?? '';
const AGENT_REL_PATH = path.join('.opencode', 'agent', `${DEFAULT_AGENT}.md`);

/** Healthy repository: every init-owned managed file is current. */
async function writeHealthyRepo(root: string): Promise<void> {
  await fs.mkdir(path.join(root, 'openspec', 'changes', 'archive'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'AGENTS.md'),
    `# Instructions\n\n${MANAGED_AGENTS_MD_BODY}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(root, 'PLANNER.md'),
    `# Instructions\n\n${MANAGED_PLANNER_BLOCK}\n`,
    'utf8',
  );
  const commandDir = path.join(root, '.claude', 'commands');
  await fs.mkdir(commandDir, { recursive: true });
  await fs.writeFile(
    path.join(commandDir, 'osq-plan.md'),
    `# Plan a change with osq\n\n${MANAGED_CLAUDE_PLAN_COMMAND}\n`,
    'utf8',
  );
}

async function writeAgentBlock(root: string, relPath: string, block: string): Promise<void> {
  const fullPath = path.join(root, relPath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, `---\ndescription: test agent\n---\n\n${block}\n`, 'utf8');
}

async function managedBlocksCheck(root: string, config: OsqConfig) {
  const report = await runDoctorChecks(root, {
    loadConfig: async () => config,
    probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
  });
  const check = report.checks.find((entry) => entry.name === 'managed-blocks');
  assert.ok(check, 'expected a managed-blocks check');
  return check;
}

describe('doctor opencode executor agent file', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-doctor-agent-'));
    await writeHealthyRepo(root);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('fails when the opencode executor agent file is missing', async () => {
    const check = await managedBlocksCheck(root, defineConfig({ harness: 'opencode' }));

    assert.equal(check.ok, false);
    assert.equal(check.message, `${AGENT_REL_PATH} is missing (run osq setup)`);
  });

  it('fails when the opencode executor agent file holds a stale block', async () => {
    await writeAgentBlock(
      root,
      AGENT_REL_PATH,
      `${OSQ_START_MARKER}\nstale executor\n${OSQ_END_MARKER}`,
    );

    const check = await managedBlocksCheck(root, defineConfig({ harness: 'opencode' }));

    assert.equal(check.ok, false);
    assert.equal(check.message, `${AGENT_REL_PATH} has a stale managed block (run osq setup)`);
  });

  it('passes when OpencodeAdapter.setup writes the current block', async () => {
    const config = defineConfig({ harness: 'opencode' });
    await new OpencodeAdapter().setup(root, config);

    const check = await managedBlocksCheck(root, config);

    assert.equal(check.ok, true);
    assert.equal(check.message, 'managed blocks valid');
  });

  it('honours a custom opencode.agent name', async () => {
    const relPath = path.join('.opencode', 'agent', 'custom-coder.md');
    const config = defineConfig({ harness: 'opencode', opencode: { agent: 'custom-coder' } });

    const missing = await managedBlocksCheck(root, config);
    assert.equal(missing.ok, false);
    assert.equal(missing.message, `${relPath} is missing (run osq setup)`);

    await new OpencodeAdapter().setup(root, config);
    const current = await managedBlocksCheck(root, config);
    assert.equal(current.ok, true);
  });

  it('requires the agent file for an opencode planner with a mock executor', async () => {
    const config = defineConfig({
      harness: 'mock',
      planner: { harness: 'opencode', model: 'planner-model' },
    });

    const missing = await managedBlocksCheck(root, config);
    assert.equal(missing.ok, false);
    assert.equal(missing.message, `${AGENT_REL_PATH} is missing (run osq setup)`);

    await new OpencodeAdapter().setup(root, config);
    const current = await managedBlocksCheck(root, config);
    assert.equal(current.ok, true);
  });

  it('does not require an agent file for a codex executor', async () => {
    const check = await managedBlocksCheck(root, defineConfig({ harness: 'codex' }));

    assert.equal(check.ok, true);
  });

  it('joins the init group and then the setup group when both drift', async () => {
    await fs.writeFile(
      path.join(root, 'AGENTS.md'),
      `# Instructions\n\n${OSQ_START_MARKER}\nstale agents\n${OSQ_END_MARKER}\n`,
      'utf8',
    );
    await writeAgentBlock(
      root,
      AGENT_REL_PATH,
      `${OSQ_START_MARKER}\nstale executor\n${OSQ_END_MARKER}`,
    );

    const check = await managedBlocksCheck(root, defineConfig({ harness: 'opencode' }));

    assert.equal(check.ok, false);
    assert.equal(
      check.message,
      `AGENTS.md has a stale managed block (run osq init); ${AGENT_REL_PATH} has a stale managed block (run osq setup)`,
    );
  });
});
