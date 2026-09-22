import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { OpencodeAdapter } from '../src/harness/opencode/opencode.js';

describe('OpencodeAdapter planner agent setup', () => {
  let tmpDir: string;
  let adapter: OpencodeAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-planner-setup-'));
    adapter = new OpencodeAdapter();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('OpencodeAdapter setup writes .opencode/agent/osq-planner.md with expected permissions and body', async () => {
    await adapter.setup(tmpDir, DEFAULT_CONFIG);

    const plannerFile = path.join(tmpDir, '.opencode', 'agent', 'osq-planner.md');
    const exists = await fs
      .stat(plannerFile)
      .then(() => true)
      .catch(() => false);
    assert.ok(exists, '.opencode/agent/osq-planner.md should exist');

    const content = await fs.readFile(plannerFile, 'utf8');
    const { data, body } = parseFrontmatter(content);

    assert.equal(data.mode, 'all');
    assert.ok(
      typeof data.description === 'string' && data.description.length > 0,
      'description should be a non-empty string',
    );

    const perms = (data.permission ?? data.permissions) as Record<string, string>;
    assert.ok(perms, 'permission block should exist in frontmatter');

    assert.equal(perms.read, 'allow');
    assert.equal(perms.write, 'allow');
    assert.equal(perms.edit, 'allow');
    assert.equal(perms.glob, 'allow');
    assert.equal(perms.grep, 'allow');
    assert.equal(perms.bash, 'deny');
    assert.equal(perms.git, 'deny');
    assert.equal(perms.webfetch, 'deny');
    assert.equal(perms.websearch, 'deny');

    assert.ok(body.includes('PLANNER.md'), 'body should point to PLANNER.md');
    assert.ok(
      body.includes('openspec/changes/<id>/'),
      'body should state writes are expected under openspec/changes/<id>/',
    );
  });

  it('Running setup twice leaves .opencode/agent/osq-planner.md byte-identical', async () => {
    await adapter.setup(tmpDir, DEFAULT_CONFIG);
    const plannerFile = path.join(tmpDir, '.opencode', 'agent', 'osq-planner.md');
    const contentFirstRun = await fs.readFile(plannerFile, 'utf8');

    await adapter.setup(tmpDir, DEFAULT_CONFIG);
    const contentSecondRun = await fs.readFile(plannerFile, 'utf8');

    assert.equal(contentSecondRun, contentFirstRun, 'repeated setup should be byte-identical');
  });

  it('OpencodeAdapter setup respects custom planner agent name in config', async () => {
    const customConfig: OsqConfig = {
      ...DEFAULT_CONFIG,
      planner: {
        harness: 'opencode',
        model: 'deepseek/deepseek-flash',
        agent: 'custom-planner-agent',
      },
    };

    await adapter.setup(tmpDir, customConfig);

    const customPlannerFile = path.join(tmpDir, '.opencode', 'agent', 'custom-planner-agent.md');
    const exists = await fs
      .stat(customPlannerFile)
      .then(() => true)
      .catch(() => false);
    assert.ok(exists, 'custom planner agent file should exist');
  });
});
