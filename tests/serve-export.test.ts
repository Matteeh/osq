import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';
import { serveCommand } from '../src/cli/serve.js';
import { defineConfig } from '../src/core/foundation/config.js';
import { buildWebFixture } from './fixtures/web/build.js';

const EPHEMERAL = defineConfig({ serve: { port: 0 } });
const STUB_INDEX =
  '<!doctype html><html><head>' +
  '<script type="module" src="./assets/app-abc12345.js"></script>' +
  '</head><body><div id="root"></div></body></html>';

let projectDir: string;
let uiDir: string;
let homeDir: string;
let now: Date;

async function writeFile(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** A free loopback port, released before the caller uses it. */
async function reserveFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as net.AddressInfo;
      server.close(() => resolve(address.port));
    });
  });
}

function exportOptions(exportDir: string, extra: Record<string, unknown> = {}) {
  return {
    cwd: projectDir,
    config: EPHEMERAL,
    exportDir,
    uiDir,
    home: homeDir,
    now: () => now,
    stdout: () => {},
    ...extra,
  };
}

beforeEach(async () => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-serve-export-'));
  uiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-serve-export-ui-'));
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-serve-export-home-'));
  now = new Date('2026-06-01T00:00:00.000Z');
  await buildWebFixture(projectDir);
  await writeFile(uiDir, 'index.html', STUB_INDEX);
  await writeFile(uiDir, 'assets/app-abc12345.js', 'console.log("osq");');
});

afterEach(async () => {
  for (const dir of [projectDir, uiDir, homeDir]) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('osq serve --export', () => {
  it('writes the snapshot, prints the scrub reminder, and serves nothing', async () => {
    const port = await reserveFreePort();
    const lines: string[] = [];
    let opened = false;

    await serveCommand(
      exportOptions('./snapshot', {
        port,
        open: true,
        stdout: (line: string) => lines.push(line),
        launchBrowser: async () => {
          opened = true;
        },
      }),
    );

    const target = path.join(projectDir, 'snapshot');
    assert.deepEqual(lines, [
      `exported dashboard to ${target}`,
      'scrubbed: project root and home directory paths only; read the export before publishing',
    ]);
    assert.equal(opened, false);
    assert.ok((await fs.stat(path.join(target, 'data.js'))).isFile());
    assert.ok((await fs.stat(path.join(target, 'index.html'))).isFile());

    // The ignored port stays free: no server was bound before exiting.
    const probe = net.createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(port, '127.0.0.1', () => resolve());
    });
    await new Promise<void>((resolve) => probe.close(() => resolve()));
  });

  it('refuses a non-empty target without printing success or writing', async () => {
    const target = path.join(projectDir, 'occupied');
    await fs.mkdir(target, { recursive: true });
    await writeFile(target, 'keep.txt', 'keep\n');
    const lines: string[] = [];

    await assert.rejects(
      () =>
        serveCommand(
          exportOptions('occupied', {
            stdout: (line: string) => lines.push(line),
          }),
        ),
      (error: unknown) => error instanceof Error && error.message.includes(target),
    );

    assert.deepEqual(lines, []);
    assert.deepEqual(await fs.readdir(target), ['keep.txt']);
  });

  it('still serves normally without --export', async () => {
    const port = await reserveFreePort();
    const controller = new AbortController();
    let resolveLine: (value: string) => void = () => {};
    const line = new Promise<string>((resolve) => {
      resolveLine = resolve;
    });

    const done = serveCommand({
      cwd: projectDir,
      config: defineConfig({ serve: { port } }),
      uiDir,
      home: homeDir,
      now: () => now,
      signal: controller.signal,
      stdout: (value: string) => resolveLine(value),
    });
    assert.equal(await line, `http://127.0.0.1:${port}/`);
    controller.abort();
    await done;
  });

  it('registers the --export option on the serve command', () => {
    const program = createProgram();
    const serve = program.commands.find((command) => command.name() === 'serve');
    assert.ok(serve);
    assert.ok(serve.options.some((option) => option.long === '--export'));
  });
});
