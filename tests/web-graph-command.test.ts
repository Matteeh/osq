import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { graphCommand } from '../src/cli/graph.js';
import { DEFAULT_CONFIG, type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { getSystemGraph } from '../src/core/web/system-graph.js';
import { serializeWebJson } from '../src/core/web/web-server.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PRICING = path.join(ROOT, 'fixture', 'trace', 'pricing');
const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-graph-command-'));
  tmpDirs.push(root);
  return root;
}

async function write(root: string, relative: string, content: string): Promise<void> {
  const full = path.join(root, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function capabilitySpec(name: string, requirements: readonly string[]): string {
  return [
    `# ${name} Specification`,
    '',
    '## Purpose',
    `${name} capability purpose.`,
    '',
    '## Requirements',
    ...requirements.flatMap((requirement) => [
      `### Requirement: ${requirement}`,
      `${name} SHALL ${requirement.toLowerCase()}.`,
      '',
    ]),
  ].join('\n');
}

interface Capture {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

/** Run `graphCommand` with every stream captured. */
async function runGraph(
  cwd: string,
  options: { json?: boolean; config?: OsqConfig } = {},
): Promise<Capture> {
  let stdout = '';
  let stderr = '';
  let exitCode: number | null = null;
  await graphCommand({
    cwd,
    ...(options.config ? { config: options.config } : {}),
    json: options.json,
    stdout: (msg) => {
      stdout += msg;
    },
    stderr: (msg) => {
      stderr += msg;
    },
    exit: (code) => {
      exitCode = code;
    },
  });
  return { stdout, stderr, exitCode };
}

describe('graph command', () => {
  it('prints the serialized system graph followed by a newline with --json', async () => {
    const root = await tempDir();
    await fs.cp(PRICING, root, { recursive: true });

    const expected = await getSystemGraph(root, DEFAULT_CONFIG);
    const { stdout, stderr, exitCode } = await runGraph(root, {
      json: true,
      config: DEFAULT_CONFIG,
    });

    assert.equal(exitCode, null);
    assert.equal(stderr, '');
    assert.equal(stdout, `${serializeWebJson(expected)}\n`);
    assert.deepEqual(JSON.parse(stdout), expected);
  });

  it('prints node, edge, and gap summary lines for a project', async () => {
    const root = await tempDir();
    await write(root, 'openspec/specs/alpha/spec.md', capabilitySpec('alpha', ['One', 'Two']));
    await write(root, 'openspec/specs/beta/spec.md', capabilitySpec('beta', ['Three']));
    await write(root, 'src/seed.ts', 'export const seed = 1;\n');

    const { stdout, stderr, exitCode } = await runGraph(root, { config: DEFAULT_CONFIG });

    assert.equal(exitCode, null);
    assert.equal(stderr, '');
    const lines = stdout.split('\n');
    assert.equal(lines[0], 'Nodes: capability 2, requirement 3, file 1');
    assert.equal(lines[1], 'Edges: contains 3');
    assert.equal(lines[2], 'Gaps: untested 0, unclaimed 0, unowned 1');
    assert.equal(lines[3], '');
  });

  it('writes no file', async () => {
    const root = await tempDir();
    await fs.cp(PRICING, root, { recursive: true });
    const before = await fs.readdir(root);

    await runGraph(root, { json: true, config: defineConfig({}) });

    assert.deepEqual(await fs.readdir(root), before);
  });

  it('prints a config error to stderr and exits one', async () => {
    const root = await tempDir();
    await write(root, 'osq.config.ts', "throw new Error('config exploded');\n");

    const { stdout, stderr, exitCode } = await runGraph(root, { json: true });

    assert.equal(exitCode, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /config exploded/);
    assert.match(stderr, /osq\.config\.ts/);
  });

  it('names osq graph in the README command list', async () => {
    const readme = await fs.readFile(path.join(ROOT, 'README.md'), 'utf8');
    assert.match(readme, /^osq graph\s/m);
    assert.match(readme, /^osq graph --json\s/m);
  });
});
