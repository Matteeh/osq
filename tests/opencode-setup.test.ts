import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { OSQ_END_MARKER, OSQ_START_MARKER } from '../src/core/foundation/init.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { OpencodeAdapter } from '../src/harness/opencode/opencode.js';

describe('OpenCode Adapter Setup', () => {
  let tmpDir: string;
  let adapter: OpencodeAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-opencode-setup-test-'));
    adapter = new OpencodeAdapter();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('OpencodeAdapter setup creates directory .opencode/agent/ if absent', async () => {
    const agentDir = path.join(tmpDir, '.opencode', 'agent');

    // Ensure directory does not exist initially
    const existsBefore = await fs
      .stat(agentDir)
      .then(() => true)
      .catch(() => false);
    assert.equal(existsBefore, false);

    await adapter.setup(tmpDir, DEFAULT_CONFIG);

    const stat = await fs.stat(agentDir);
    assert.ok(stat.isDirectory(), '.opencode/agent should be a directory');
  });

  it('OpencodeAdapter setup writes .opencode/agent/osq-coder.md with description and mode all frontmatter', async () => {
    await adapter.setup(tmpDir, DEFAULT_CONFIG);

    const agentFile = path.join(tmpDir, '.opencode', 'agent', 'osq-coder.md');
    const exists = await fs
      .stat(agentFile)
      .then(() => true)
      .catch(() => false);
    assert.ok(exists, '.opencode/agent/osq-coder.md should exist');

    const content = await fs.readFile(agentFile, 'utf8');
    const { data } = parseFrontmatter(content);

    assert.equal(data.mode, 'all', 'mode should be all');
    assert.ok(
      typeof data.description === 'string' && data.description.length > 0,
      'description should be a non-empty string',
    );
  });

  it('Frontmatter permissions allow read, edit, bash, glob, grep, denying webfetch, websearch', async () => {
    await adapter.setup(tmpDir, DEFAULT_CONFIG);

    const agentFile = path.join(tmpDir, '.opencode', 'agent', 'osq-coder.md');
    const content = await fs.readFile(agentFile, 'utf8');
    const { data } = parseFrontmatter(content);

    const perms = (data.permission ?? data.permissions) as Record<string, string>;
    assert.ok(perms, 'permissions object should exist in frontmatter');

    assert.equal(perms.read, 'allow', 'read permission should be allow');
    assert.equal(perms.edit, 'allow', 'edit permission should be allow');
    assert.equal(perms.bash, 'allow', 'bash permission should be allow');
    assert.equal(perms.glob, 'allow', 'glob permission should be allow');
    assert.equal(perms.grep, 'allow', 'grep permission should be allow');
    assert.equal(perms.webfetch, 'deny', 'webfetch permission should be deny');
    assert.equal(perms.websearch, 'deny', 'websearch permission should be deny');
  });

  it('Agent file body contains AGENTS.md task execution procedure enclosed in managed block markers', async () => {
    await adapter.setup(tmpDir, DEFAULT_CONFIG);

    const agentFile = path.join(tmpDir, '.opencode', 'agent', 'osq-coder.md');
    const content = await fs.readFile(agentFile, 'utf8');
    const { body } = parseFrontmatter(content);

    const startIndex = body.indexOf(OSQ_START_MARKER);
    const endIndex = body.indexOf(OSQ_END_MARKER);

    assert.notEqual(startIndex, -1, 'body should contain OSQ_START_MARKER');
    assert.notEqual(endIndex, -1, 'body should contain OSQ_END_MARKER');
    assert.ok(endIndex > startIndex, 'OSQ_END_MARKER should appear after OSQ_START_MARKER');

    const managedContent = body.slice(startIndex, endIndex + OSQ_END_MARKER.length);
    assert.ok(
      managedContent.includes('## Executing a spec'),
      'managed block should contain "## Executing a spec"',
    );
    assert.ok(managedContent.includes('## Exiting'), 'managed block should contain "## Exiting"');
    assert.ok(
      managedContent.includes("Run the task's `verify` command before exiting."),
      'managed block should contain task verification step',
    );
    assert.ok(
      managedContent.includes('Write `.run/results/<n>.md` first'),
      'managed block should contain results writing guideline',
    );
  });

  it('Setup is idempotent and preserves user edits outside managed block markers', async () => {
    // 1. Initial setup
    await adapter.setup(tmpDir, DEFAULT_CONFIG);
    const agentFile = path.join(tmpDir, '.opencode', 'agent', 'osq-coder.md');
    const initialContent = await fs.readFile(agentFile, 'utf8');

    // 2. Second run without changes -> exact same content
    await adapter.setup(tmpDir, DEFAULT_CONFIG);
    const secondContent = await fs.readFile(agentFile, 'utf8');
    assert.equal(secondContent, initialContent, 'second setup run should be idempotent');

    // Verify marker count
    const startOccurrences = secondContent.split(OSQ_START_MARKER).length - 1;
    const endOccurrences = secondContent.split(OSQ_END_MARKER).length - 1;
    assert.equal(startOccurrences, 1, 'should contain exactly one START marker');
    assert.equal(endOccurrences, 1, 'should contain exactly one END marker');

    // 3. User edits frontmatter and surrounds managed block with custom instructions
    const customUserContent = [
      '---',
      'description: Custom user-defined coding assistant',
      'mode: subagent',
      'model: anthropic/claude-3-5-sonnet',
      'permission:',
      '  read: allow',
      '  edit: allow',
      '  bash: allow',
      '  glob: allow',
      '  grep: allow',
      '  webfetch: deny',
      '  websearch: deny',
      '---',
      '',
      '# Project Specific Guidelines',
      '',
      'Always check package.json before adding dependencies.',
      '',
      `${OSQ_START_MARKER}`,
      'Old procedure that should be replaced',
      `${OSQ_END_MARKER}`,
      '',
      '# Additional Notes',
      '',
      'Contact the team before making breaking changes.',
      '',
    ].join('\n');

    await fs.writeFile(agentFile, customUserContent, 'utf8');

    // 4. Run setup again -> custom frontmatter and custom outer text preserved, managed block refreshed
    await adapter.setup(tmpDir, DEFAULT_CONFIG);
    const refreshedContent = await fs.readFile(agentFile, 'utf8');
    const { data: refreshedData, body: refreshedBody } = parseFrontmatter(refreshedContent);

    assert.equal(refreshedData.description, 'Custom user-defined coding assistant');
    assert.equal(refreshedData.model, 'anthropic/claude-3-5-sonnet');
    assert.ok(
      refreshedBody.includes('# Project Specific Guidelines'),
      'custom text before managed block should be preserved',
    );
    assert.ok(
      refreshedBody.includes('Always check package.json before adding dependencies.'),
      'custom guidelines should be preserved',
    );
    assert.ok(
      refreshedBody.includes('# Additional Notes'),
      'custom text after managed block should be preserved',
    );
    assert.ok(
      refreshedBody.includes('Contact the team before making breaking changes.'),
      'custom notes should be preserved',
    );
    assert.ok(
      refreshedBody.includes('## Executing a spec'),
      'managed block should be refreshed with spec procedure',
    );
    assert.equal(
      refreshedBody.includes('Old procedure that should be replaced'),
      false,
      'old managed block content should be replaced',
    );
  });

  it('README notes --auto flag approves any action the agent file does not deny', async () => {
    const readmePath = path.resolve(import.meta.dirname, '..', 'README.md');
    const readmeContent = await fs.readFile(readmePath, 'utf8');

    assert.ok(readmeContent.includes('--auto'), 'README should mention --auto flag');
    assert.ok(
      readmeContent.toLowerCase().includes('approves') &&
        (readmeContent.includes('not deny') || readmeContent.includes('does not deny')),
      'README should note that --auto approves actions not denied by the agent file',
    );
  });

  it('OpencodeAdapter setup respects custom agent name configured in OsqConfig', async () => {
    const customConfig: OsqConfig = {
      ...DEFAULT_CONFIG,
      opencode: {
        ...DEFAULT_CONFIG.opencode,
        agent: 'my-custom-coder',
      },
    };

    await adapter.setup(tmpDir, customConfig);

    const customFile = path.join(tmpDir, '.opencode', 'agent', 'my-custom-coder.md');
    const exists = await fs
      .stat(customFile)
      .then(() => true)
      .catch(() => false);
    assert.ok(exists, '.opencode/agent/my-custom-coder.md should exist');
  });
});
