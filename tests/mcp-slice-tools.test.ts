import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { McpTool } from '../src/cli/mcp-protocol.js';
import { type McpTarget, createMcpTools } from '../src/cli/mcp-tools.js';
import type { Slice } from '../src/cli/slice-types.js';

/** The nine planning tools' names, in the order cli-foundation lists them. */
const NINE = [
  'plan',
  'list_files',
  'read_file',
  'write_file',
  'edit_file',
  'delete_file',
  'spec',
  'query',
  'lint',
];

/** A slice tool with the fixed result its `run` returns. */
function fixedTool(name: string): McpTool {
  return {
    name,
    description: `the ${name} tool`,
    inputSchema: { type: 'object' },
    run: () => ({ text: `${name}\n`, isError: false }),
  };
}

/** A slice named `name` whose `tools` records the target it receives. */
function sliceWith(name: string, tools: readonly McpTool[], received: McpTarget[]): Slice {
  return {
    name,
    tools: (target) => {
      received.push(target);
      return tools;
    },
  };
}

describe('MCP slice tools', () => {
  let project: string;
  let target: McpTarget;

  beforeEach(async () => {
    project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-mcp-slice-tools-'));
    target = { kind: 'local', cwd: project };
  });

  afterEach(async () => {
    await fs.rm(project, { recursive: true, force: true });
  });

  it('gives the nine planning tools for no slices', () => {
    assert.deepEqual(
      createMcpTools(target, []).map((tool) => tool.name),
      NINE,
    );
  });

  it('gives one slice tool after the nine, and the slice the target', () => {
    const received: McpTarget[] = [];
    const widgets = sliceWith('widgets', [fixedTool('widget_list')], received);

    assert.deepEqual(
      createMcpTools(target, [widgets]).map((tool) => tool.name),
      [...NINE, 'widget_list'],
    );
    assert.equal(received.length, 1);
    assert.equal(received[0], target);
  });

  it('gives two slices in registry order, each the same target', () => {
    const received: McpTarget[] = [];
    const widgets = sliceWith('widgets', [fixedTool('widget_list')], received);
    const gizmos = sliceWith('gizmos', [fixedTool('gizmo_list')], received);

    assert.deepEqual(
      createMcpTools(target, [widgets, gizmos]).map((tool) => tool.name),
      [...NINE, 'widget_list', 'gizmo_list'],
    );
    assert.deepEqual(received, [target, target]);
  });

  it('refuses a slice tool whose name an earlier tool has', () => {
    const received: McpTarget[] = [];
    const widgets = sliceWith('widgets', [fixedTool('lint')], received);

    assert.throws(() => createMcpTools(target, [widgets]), {
      message: 'slice widgets: tool lint is already defined',
    });
    assert.equal(received.length, 1);
    assert.equal(received[0], target);
  });
});
