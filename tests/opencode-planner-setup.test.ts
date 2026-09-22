import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import {
  OPENCODE_PLANNER_AGENT_TEMPLATE,
  OpencodeAdapter,
} from '../src/harness/opencode/opencode.js';

/** Exact bytes the generated and checked-in planner agent file must hold. */
const PLANNER_AGENT_CONTENT = [
  '---',
  'description: Interactive planning agent for osq',
  'mode: all',
  'permission:',
  '  read: allow',
  '  edit: allow',
  '  glob: allow',
  '  grep: allow',
  '  bash:',
  '    "*": deny',
  '    "osq lint*": allow',
  '    "pnpm osq lint*": allow',
  '    "npx osq lint*": allow',
  '    "*;*": deny',
  '    "*&*": deny',
  '    "*|*": deny',
  '    "*>*": deny',
  '    "*<*": deny',
  '    "*`*": deny',
  '    "*$(*": deny',
  '    "*\\n*": deny',
  '  webfetch: deny',
  '  websearch: deny',
  '---',
  '',
  'Follow PLANNER.md strictly for change planning rules and procedure.',
  'Writes are expected only under openspec/changes/<id>/.',
  'The only shell command you may run is `osq lint <slug>`.',
  '',
].join('\n');

/** The complete ordered key list of the planner's `bash` pattern map. */
const BASH_KEYS = [
  '*',
  'osq lint*',
  'pnpm osq lint*',
  'npx osq lint*',
  '*;*',
  '*&*',
  '*|*',
  '*>*',
  '*<*',
  '*`*',
  '*$(*',
  '*\n*',
];

/**
 * Translate an OpenCode permission pattern into an anchored regular
 * expression. `*` matches any characters, including spaces and newlines.
 */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[\\s\\S]*');
  return new RegExp(`^${escaped}$`);
}

/** Apply OpenCode's last-matching-pattern-wins rule to a command. */
function evaluateBashRule(bashMap: Record<string, string>, command: string): string | undefined {
  let decision: string | undefined;
  for (const [pattern, rule] of Object.entries(bashMap)) {
    if (globToRegExp(pattern).test(command)) {
      decision = rule;
    }
  }
  return decision;
}

describe('OpencodeAdapter planner agent setup', () => {
  let tmpDir: string;
  let adapter: OpencodeAdapter;
  let plannerFile: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-planner-setup-'));
    adapter = new OpencodeAdapter();
    plannerFile = path.join(tmpDir, '.opencode', 'agent', 'osq-planner.md');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('OPENCODE_PLANNER_AGENT_TEMPLATE and the checked-in planner agent are byte-identical', async () => {
    assert.equal(OPENCODE_PLANNER_AGENT_TEMPLATE, PLANNER_AGENT_CONTENT);

    const repoFile = path.resolve(
      import.meta.dirname,
      '..',
      '.opencode',
      'agent',
      'osq-planner.md',
    );
    const repoContent = await fs.readFile(repoFile, 'utf8');
    assert.equal(repoContent, PLANNER_AGENT_CONTENT);
  });

  it('setup writes the planner agent with lint-only bash permissions and body', async () => {
    await adapter.setup(tmpDir, DEFAULT_CONFIG);

    const exists = await fs
      .stat(plannerFile)
      .then(() => true)
      .catch(() => false);
    assert.ok(exists, '.opencode/agent/osq-planner.md should exist');

    const content = await fs.readFile(plannerFile, 'utf8');
    assert.equal(content, PLANNER_AGENT_CONTENT);

    const { data, body } = parseFrontmatter(content);
    assert.equal(data.mode, 'all');
    assert.ok(
      typeof data.description === 'string' && data.description.length > 0,
      'description should be a non-empty string',
    );

    const perms = data.permission as Record<string, unknown>;
    assert.ok(perms, 'permission block should exist in frontmatter');

    assert.equal(perms.read, 'allow');
    assert.equal(perms.edit, 'allow');
    assert.equal(perms.glob, 'allow');
    assert.equal(perms.grep, 'allow');
    assert.equal(perms.webfetch, 'deny');
    assert.equal(perms.websearch, 'deny');
    assert.ok(!('write' in perms), 'write is not an OpenCode permission key');
    assert.ok(!('git' in perms), 'git is not an OpenCode permission key');

    assert.deepEqual(Object.keys(perms.bash as Record<string, string>), BASH_KEYS);

    assert.ok(body.includes('PLANNER.md'), 'body should point to PLANNER.md');
    assert.ok(
      body.includes('openspec/changes/<id>/'),
      'body should state writes are expected under openspec/changes/<id>/',
    );
    assert.ok(body.includes('`osq lint <slug>`'), 'body should name the only allowed command');
  });

  it('bash patterns allow lint only and deny chained or other commands', async () => {
    await adapter.setup(tmpDir, DEFAULT_CONFIG);

    const content = await fs.readFile(plannerFile, 'utf8');
    const { data } = parseFrontmatter(content);
    const perms = data.permission as Record<string, unknown>;
    const bash = perms.bash as Record<string, string>;

    for (const command of ['osq lint 048', 'osq lint', 'pnpm osq lint 048', 'npx osq lint 048']) {
      assert.equal(evaluateBashRule(bash, command), 'allow', `${command} should be allowed`);
    }

    for (const command of [
      'git status',
      'osq lint 048 && rm -rf x',
      'osq lint 048; git push',
      'osq lint 048 | tee x',
      'osq lint $(whoami)',
    ]) {
      assert.equal(evaluateBashRule(bash, command), 'deny', `${command} should be denied`);
    }
  });

  it('Running setup twice leaves .opencode/agent/osq-planner.md byte-identical', async () => {
    await adapter.setup(tmpDir, DEFAULT_CONFIG);
    const contentFirstRun = await fs.readFile(plannerFile, 'utf8');

    await adapter.setup(tmpDir, DEFAULT_CONFIG);
    const contentSecondRun = await fs.readFile(plannerFile, 'utf8');

    assert.equal(contentSecondRun, contentFirstRun, 'repeated setup should be byte-identical');
  });

  it('setup leaves a pre-existing planner agent file untouched', async () => {
    await fs.mkdir(path.dirname(plannerFile), { recursive: true });
    const customContent = '---\ndescription: custom planner\n---\n\ncustom body\n';
    await fs.writeFile(plannerFile, customContent, 'utf8');

    await adapter.setup(tmpDir, DEFAULT_CONFIG);

    const content = await fs.readFile(plannerFile, 'utf8');
    assert.equal(content, customContent, 'an existing planner agent file is never overwritten');
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
