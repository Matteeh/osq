import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import type { Writer } from '../src/cli/command-inputs.js';
import { lintCommand } from '../src/cli/lint.js';
import type { McpTool, McpToolResult } from '../src/cli/mcp-protocol.js';
import { createMcpTools } from '../src/cli/mcp-tools.js';
import { queryCommand } from '../src/cli/query.js';
import { createForwardedRunner } from '../src/cli/remote-commands.js';
import { remoteWorkRoot } from '../src/cli/remote-plan.js';
import type { RemoteServer } from '../src/cli/remote-transport.js';
import { specCommand } from '../src/cli/spec.js';
import { type OsqConfig, defineConfig, loadConfig } from '../src/core/foundation/config.js';
import { formatNextStep, readNextStep } from '../src/core/status/next-step.js';
import type { WebServerHandle } from '../src/core/web/web-server.js';
import { startWebServer } from '../src/core/web/web-server.js';
import { installFakeValidator } from './helpers.js';

const FOLDER = '001-demo';
const PROPOSAL = [
  '---',
  'title: Demo Change',
  'depends_on: []',
  'verify: node -e "process.exit(0)"',
  '---',
  '## Goal',
  'Demo goal.',
  '',
].join('\n');
const TASK = [
  '---',
  'title: Task one',
  'verify: node -e "process.exit(0)"',
  'scope: []',
  'entry: []',
  'skills: []',
  '---',
  '## Acceptance',
  '- [ ] done',
  '',
].join('\n');

/** The writers one command function receives. */
interface Writers {
  readonly stdout: Writer;
  readonly stderr: Writer;
}

/** Write a file under `root`, creating the folders it needs. */
async function write(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** The one tool with `name`, or a failure naming it. */
function toolOf(tools: readonly McpTool[], name: string): McpTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`no tool named ${name}`);
  return tool;
}

/**
 * Run a command function through its writers and render the same text an MCP
 * command tool returns: the chunks in order, then a failure's error and next.
 */
async function directText(run: (writers: Writers) => Promise<unknown>): Promise<McpToolResult> {
  const chunks: string[] = [];
  const writers: Writers = {
    stdout: (text) => chunks.push(text),
    stderr: (text) => chunks.push(text),
  };
  try {
    await run(writers);
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    let text = chunks.join('');
    if (error.message) text += `${error.message}\n`;
    if (error.next) text += `Next: ${error.next}\n`;
    return { text, isError: true };
  }
  return { text: chunks.join(''), isError: false };
}

describe('MCP planning tools', () => {
  let project: string;
  let config: OsqConfig;

  beforeEach(async () => {
    project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-mcp-tools-'));
    await write(project, `openspec/changes/${FOLDER}/proposal.md`, PROPOSAL);
    await write(project, `openspec/changes/${FOLDER}/tasks/1.md`, TASK);
    await write(
      project,
      `openspec/changes/${FOLDER}/brief.md`,
      '---\nqueue_item: demo\n---\nBrief body for demo.\n',
    );
    config = await loadConfig(project);
  });

  afterEach(async () => {
    await fs.rm(project, { recursive: true, force: true });
  });

  it('lists exactly the nine planning tools in order', () => {
    const tools = createMcpTools({ kind: 'local', cwd: project });
    assert.deepEqual(
      tools.map((tool) => tool.name),
      [
        'plan',
        'list_files',
        'read_file',
        'write_file',
        'edit_file',
        'delete_file',
        'spec',
        'query',
        'lint',
      ],
    );
    for (const tool of tools) {
      assert.equal(tool.description.includes('\n'), false, tool.name);
      assert.equal(tool.inputSchema.type, 'object', tool.name);
      assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
    }
  });

  it('gives the CLI text for spec, query and lint', async () => {
    const tools = createMcpTools({ kind: 'local', cwd: project });
    const rows = [
      {
        tool: 'spec',
        args: {},
        run: (writers: Writers) => specCommand(undefined, undefined, { cwd: project, ...writers }),
      },
      {
        tool: 'query',
        args: {},
        run: (writers: Writers) => queryCommand({ cwd: project, ...writers }),
      },
      {
        tool: 'lint',
        args: { change: '001' },
        run: (writers: Writers) => lintCommand(['001'], { cwd: project, ...writers }),
      },
    ];
    for (const row of rows) {
      const result = await toolOf(tools, row.tool).run(row.args);
      assert.deepEqual(result, await directText(row.run), row.tool);
    }
  });

  it('prepares the prompt for a change that has a brief', async () => {
    const tools = createMcpTools({ kind: 'local', cwd: project });
    const folder = path.join(project, 'openspec', 'changes', FOLDER);

    const result = await toolOf(tools, 'plan').run({ change: '001' });

    const next = formatNextStep(await readNextStep(project, folder, config));
    assert.deepEqual(result, {
      text: `${folder}: ask your planning tool to plan change ${FOLDER} \u2014 next: ${next}\n`,
      isError: false,
    });
    assert.ok(await fs.stat(path.join(folder, 'plan-prompt.md')));
  });

  it('keeps the runner refusal for a change with no brief', async () => {
    await write(project, 'openspec/changes/002-demo/proposal.md', PROPOSAL);
    const tools = createMcpTools({ kind: 'local', cwd: project });

    const result = await toolOf(tools, 'plan').run({ change: '002' });

    assert.deepEqual(result, {
      text:
        'osq plan 002 on a server needs an unapproved change with a brief; ' +
        'queue the brief and run osq plan --next\n',
      isError: true,
    });
  });
});

describe('MCP planning tools against a server', () => {
  let root: string;
  let home: string;
  let uiDir: string;
  let handle: WebServerHandle;
  let server: RemoteServer;

  before(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-mcp-tools-server-'));
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-mcp-tools-server-home-'));
    uiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-mcp-tools-server-ui-'));
    await installFakeValidator(root);
    await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
    await write(root, `openspec/changes/${FOLDER}/brief.md`, 'Brief body for demo.\n');
    await write(root, `openspec/changes/${FOLDER}/proposal.md`, PROPOSAL);
    await write(root, `openspec/changes/${FOLDER}/tasks/1.md`, TASK);
    await write(root, `openspec/changes/${FOLDER}/.run/manifest.json`, '{"state":"planned"}\n');
    await fs.writeFile(path.join(uiDir, 'index.html'), '<!doctype html><div id="root"></div>');
    handle = await startWebServer({
      projectRoot: root,
      config: defineConfig({ serve: { port: 0 } }),
      port: 0,
      uiDir,
      site: { name: 'box', project: 'osq' },
      runCommand: createForwardedRunner(root, { home }),
    });
    server = {
      base: `http://127.0.0.1:${handle.port}/p/osq/`,
      host: `127.0.0.1:${handle.port}`,
      project: 'osq',
    };
  });

  after(async () => {
    await handle.close();
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(uiDir, { recursive: true, force: true });
  });

  it('plans, writes and lints through the working copy', async () => {
    const tools = createMcpTools({ kind: 'remote', server, home });
    const folder = path.join(remoteWorkRoot(server, home), FOLDER);

    const planned = await toolOf(tools, 'plan').run({ change: '001' });
    assert.equal(planned.isError, false, planned.text);
    assert.ok(await fs.stat(path.join(folder, 'plan-prompt.md')));

    const wrote = await toolOf(tools, 'write_file').run({
      change: '001',
      path: 'tasks/2.md',
      text: '# Two\n',
    });
    assert.deepEqual(wrote, { text: 'wrote tasks/2.md (6 bytes)', isError: false });
    assert.equal(await fs.readFile(path.join(folder, 'tasks', '2.md'), 'utf8'), '# Two\n');

    const linted = await toolOf(tools, 'lint').run({ change: '001' });
    assert.equal(
      await fs.readFile(path.join(root, 'openspec', 'changes', FOLDER, 'tasks', '2.md'), 'utf8'),
      '# Two\n',
    );
    assert.deepEqual(
      linted,
      await directText((writers) => lintCommand(['001'], { cwd: root, ...writers })),
    );
  });
});
