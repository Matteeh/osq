import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scaffoldProject } from '../src/core/init.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const readmePath = path.join(repoRoot, 'README.md');

describe('planning consumer guidance', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-init-planning-guidance-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('describes prompt handoff, explicit session, print mode, and entry points', async () => {
    const readme = await fs.readFile(readmePath, 'utf8');

    assert.match(readme, /plan-prompt\.md/, 'README must describe the prompt file handoff');
    assert.match(
      readme,
      /ask your planning tool to plan change <slug>/,
      'README must show the handoff line',
    );
    assert.match(readme, /--session/, 'README must document explicit session mode');
    assert.match(readme, /--print/, 'README must document print mode');
    assert.match(
      readme,
      /\.claude\/commands\/osq-plan\.md/,
      'README must name the installed Claude command',
    );
    assert.match(readme, /Planning a change/, 'README must name the Codex AGENTS section');
  });

  it('describes approval observation and planning-tool-owned model choice', async () => {
    const readme = await fs.readFile(readmePath, 'utf8');

    assert.match(readme, /osq approve[\s\S]{0,220}observes local/i);
    assert.match(readme, /model choice belongs to the planning tool/i);
    assert.match(readme, /contains no required[\s\S]{0,20}planner model/i);
  });

  it('generates a config with no required planner model', async () => {
    await scaffoldProject(tmpDir);
    const config = await fs.readFile(path.join(tmpDir, 'osq.config.ts'), 'utf8');

    assert.equal(config.includes('planner'), false, 'generated config must not require a planner');
    assert.match(config, /harness:/);
  });
});
