import assert from 'node:assert/strict';
import http from 'node:http';
import { after, describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import { type RemoteServer, readServerSetting, runOnServer } from '../src/cli/remote-transport.js';

const closers: Array<() => Promise<void>> = [];

after(async () => {
  while (closers.length > 0) await closers.pop()?.();
});

/** Build the server `OSQ_SERVER` would name on a loopback port. */
function serverFor(port: number, project = 'osq'): RemoteServer {
  return { base: `http://127.0.0.1:${port}/p/${project}/`, host: `127.0.0.1:${port}`, project };
}

/** Start a raw HTTP server on a free loopback port and return that port. */
async function listen(handler: http.RequestListener): Promise<number> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  closers.push(() => new Promise((resolve) => server.close(() => resolve())));
  return port;
}

/** A loopback port nothing listens on. */
async function closedPort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

const REQUEST = { command: 'status', args: [], options: {} } as const;

/** Run one command and resolve the thrown value. */
async function runFailure(server: RemoteServer, stdout = (_: string) => {}): Promise<unknown> {
  try {
    await runOnServer(server, REQUEST, stdout, () => {});
  } catch (error) {
    return error;
  }
  throw new Error('runOnServer resolved unexpectedly');
}

describe('readServerSetting', () => {
  it('returns null for an unset or blank OSQ_SERVER', () => {
    assert.equal(readServerSetting({}), null);
    assert.equal(readServerSetting({ OSQ_SERVER: '   ' }), null);
  });

  it('returns the base, host and project in the table', () => {
    const rows: ReadonlyArray<{ readonly value: string; readonly result: RemoteServer }> = [
      {
        value: 'https://box.tail1234.ts.net/p/osq/',
        result: {
          base: 'https://box.tail1234.ts.net/p/osq/',
          host: 'box.tail1234.ts.net',
          project: 'osq',
        },
      },
      {
        value: 'http://127.0.0.1:4174/p/osq',
        result: { base: 'http://127.0.0.1:4174/p/osq/', host: '127.0.0.1:4174', project: 'osq' },
      },
    ];
    for (const row of rows) {
      assert.deepEqual(readServerSetting({ OSQ_SERVER: row.value }), row.result, row.value);
    }
  });

  it('throws for every value that is not a project URL', () => {
    for (const value of [
      'box/p/osq/',
      'ftp://box/p/osq/',
      'https://box/osq/',
      'https://box/p/osq/?a=1',
    ]) {
      let caught: unknown;
      try {
        readServerSetting({ OSQ_SERVER: value });
      } catch (error) {
        caught = error;
      }
      assert.ok(caught instanceof CommandError, value);
      assert.equal(
        caught.message,
        `OSQ_SERVER must look like https://<host>/p/<project>/: ${value}`,
        value,
      );
    }
  });
});

describe('transport failures', () => {
  it('names the reason when nothing listens on the loopback port', async () => {
    const server = serverFor(await closedPort());
    const error = await runFailure(server);
    assert.ok(error instanceof CommandError);
    const prefix = `Could not reach the osq server at ${server.base}: `;
    assert.ok(error.message.startsWith(prefix), error.message);
    assert.ok(error.message.length > prefix.length, 'the reason is empty');
  });

  it('refuses a response that is not 2xx with the body error', async () => {
    const port = await listen((_req, res) => {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'request refused' }));
    });
    const server = serverFor(port);
    const error = await runFailure(server);
    assert.ok(error instanceof CommandError);
    assert.equal(
      error.message,
      `osq server at ${server.base} refused the request (403): request refused`,
    );
  });

  it('fails when a command stream ends without its last line', async () => {
    const port = await listen((req, res) => {
      if (req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ token: 'a'.repeat(64) }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' });
      res.write(`${JSON.stringify({ stream: 'stdout', text: 'a\n' })}\n`);
      res.end();
    });
    const server = serverFor(port);
    const written: string[] = [];
    const error = await runFailure(server, (text) => written.push(text));
    assert.ok(error instanceof CommandError);
    assert.equal(
      error.message,
      `osq server at ${server.base} ended the command without an exit code`,
    );
    assert.deepEqual(written, ['a\n']);
  });
});
