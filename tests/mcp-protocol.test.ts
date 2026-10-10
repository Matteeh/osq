import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type McpServerInfo,
  type McpTool,
  type McpToolResult,
  createMcpHandler,
} from '../src/cli/mcp-protocol.js';

const INFO: McpServerInfo = { name: 'osq', version: '1.2.3', instructions: 'I' };
const SUPPORTED = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { 'io.modelcontextprotocol/serverInfo': { name: 'osq', version: '1.2.3' } };

const NAMES = [
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

/** The nine planning tools the handler is built with, stubbed to a fixed result. */
function stubTools(): McpTool[] {
  return NAMES.map((name) => ({
    name,
    description: `The ${name} tool`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: () => ({ text: `${name} ok`, isError: false }),
  }));
}

/** The `tools/list` rendering of a tool list. */
function listed(tools: readonly McpTool[]): unknown[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

/** The `_meta` a modern request carries. */
function modernMeta(version: string, capabilities = true): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    'io.modelcontextprotocol/protocolVersion': version,
  };
  if (capabilities) meta['io.modelcontextprotocol/clientCapabilities'] = {};
  return meta;
}

const TOOLS = stubTools();
const TOOLS_LIST = listed(TOOLS);

interface Case {
  readonly name: string;
  readonly message: unknown;
  readonly expected: unknown;
}

const CASES: readonly Case[] = [
  {
    name: 'initialize echoes a supported legacy version',
    message: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' },
    },
    expected: {
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'osq', version: '1.2.3' },
        instructions: 'I',
      },
    },
  },
  {
    name: 'initialize falls back to the latest legacy version',
    message: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '1999-01-01' },
    },
    expected: {
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-11-25',
        capabilities: { tools: {} },
        serverInfo: { name: 'osq', version: '1.2.3' },
        instructions: 'I',
      },
    },
  },
  {
    name: 'ping answers an empty result',
    message: { jsonrpc: '2.0', id: 1, method: 'ping' },
    expected: { jsonrpc: '2.0', id: 1, result: {} },
  },
  {
    name: 'tools/list lists the nine tools in order',
    message: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    expected: { jsonrpc: '2.0', id: 1, result: { tools: TOOLS_LIST } },
  },
  {
    name: 'server/discover answers a modern request',
    message: {
      jsonrpc: '2.0',
      id: 1,
      method: 'server/discover',
      params: { _meta: modernMeta('2026-07-28') },
    },
    expected: {
      jsonrpc: '2.0',
      id: 1,
      result: {
        resultType: 'complete',
        supportedVersions: SUPPORTED,
        capabilities: { tools: {} },
        instructions: 'I',
        _meta: SERVER_INFO,
      },
    },
  },
  {
    name: 'tools/list answers a modern request with resultType and _meta',
    message: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: { _meta: modernMeta('2026-07-28') },
    },
    expected: {
      jsonrpc: '2.0',
      id: 1,
      result: { resultType: 'complete', tools: TOOLS_LIST, _meta: SERVER_INFO },
    },
  },
  {
    name: 'a modern request with an unknown version is refused',
    message: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: { _meta: modernMeta('2030-01-01') },
    },
    expected: {
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32022,
        message: 'Unsupported protocol version',
        data: { supported: SUPPORTED, requested: '2030-01-01' },
      },
    },
  },
  {
    name: 'a modern request without clientCapabilities is refused',
    message: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: { _meta: modernMeta('2026-07-28', false) },
    },
    expected: {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32602, message: 'Invalid params' },
    },
  },
  {
    name: 'an unknown tool is refused',
    message: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'approve' },
    },
    expected: {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32602, message: 'Unknown tool: approve' },
    },
  },
  {
    name: 'an unknown method is refused',
    message: { jsonrpc: '2.0', id: 1, method: 'resources/list' },
    expected: {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32601, message: 'Method not found: resources/list' },
    },
  },
  {
    name: 'a notification without an id gets no answer',
    message: { jsonrpc: '2.0', method: 'notifications/initialized' },
    expected: null,
  },
];

describe('cli-foundation: Requests and answers', () => {
  for (const testCase of CASES) {
    it(testCase.name, async () => {
      const answer = await createMcpHandler(stubTools(), INFO)(testCase.message);
      assert.deepEqual(answer, testCase.expected);
    });
  }

  it('a message with a result and no method gets no answer', async () => {
    const answer = await createMcpHandler(
      stubTools(),
      INFO,
    )({
      jsonrpc: '2.0',
      id: 1,
      result: {},
    });
    assert.equal(answer, null);
  });

  it('a tool call returns the tool text and flag', async () => {
    const answer = await createMcpHandler(
      stubTools(),
      INFO,
    )({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { change: '001', path: 'proposal.md' } },
    });
    assert.deepEqual(answer, {
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'text', text: 'read_file ok' }], isError: false },
    });
  });
});

describe('cli-foundation: A throwing tool', () => {
  it('turns a thrown error into an isError result', async () => {
    const tools: McpTool[] = [
      {
        name: 'boom',
        description: 'The boom tool',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        run: (): McpToolResult => {
          throw new Error('boom');
        },
      },
    ];
    const answer = await createMcpHandler(
      tools,
      INFO,
    )({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'boom' },
    });
    assert.deepEqual(answer, {
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'text', text: 'Error: boom\n' }], isError: true },
    });
  });
});
