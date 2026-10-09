import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_CONFIG, defineConfig } from '../src/core/foundation/config.js';

/** Run `fn` and return the error it threw. */
function thrownBy(fn: () => unknown): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected the call to throw');
}

describe('Server defaults', () => {
  it('defaults allowedHosts and the server block on top of the serve defaults', () => {
    const expected = {
      port: 4173,
      eventDebounceMs: 100,
      allowedHosts: [],
      server: { port: 4174, buildCheckSeconds: 30 },
    };
    assert.deepEqual(DEFAULT_CONFIG.serve, expected);
    assert.deepEqual(defineConfig({}).serve, expected);
  });
});

describe('Partial server block', () => {
  it('keeps each missing server value defaulted and leaves name and project absent', () => {
    const server = defineConfig({ serve: { server: { port: 4180 } } }).serve?.server;
    assert.deepEqual(server, { port: 4180, buildCheckSeconds: 30 });
    assert.equal('name' in (server ?? {}), false);
    assert.equal('project' in (server ?? {}), false);
    assert.equal(defineConfig({ serve: { server: { port: 4180 } } }).serve?.port, 4173);
  });

  it('keeps a supplied name, project and buildCheckSeconds', () => {
    const server = defineConfig({
      serve: { server: { buildCheckSeconds: 5, name: 'box', project: 'osq.server' } },
    }).serve?.server;
    assert.deepEqual(server, {
      port: 4174,
      buildCheckSeconds: 5,
      name: 'box',
      project: 'osq.server',
    });
  });
});

describe('Invalid server values', () => {
  const cases: ReadonlyArray<{ readonly input: unknown; readonly error: string }> = [
    {
      input: { serve: { allowedHosts: 'box' } },
      error: 'serve.allowedHosts must be an array of host names',
    },
    {
      input: { serve: { allowedHosts: ['https://box'] } },
      error: 'serve.allowedHosts must be an array of host names',
    },
    {
      input: { serve: { allowedHosts: ['box tail'] } },
      error: 'serve.allowedHosts must be an array of host names',
    },
    {
      input: { serve: { allowedHosts: [''] } },
      error: 'serve.allowedHosts must be an array of host names',
    },
    {
      input: { serve: { server: { port: 0 } } },
      error: 'serve.server.port must be an integer from 1 through 65535',
    },
    {
      input: { serve: { server: { buildCheckSeconds: 0 } } },
      error: 'serve.server.buildCheckSeconds must be a finite number greater than zero',
    },
    {
      input: { serve: { server: { name: '' } } },
      error: 'serve.server.name must be a non-empty string',
    },
    {
      input: { serve: { server: { project: 'a/b' } } },
      error:
        "serve.server.project must start with a letter or digit and hold only letters, digits, '.', '_' or '-'",
    },
  ];

  for (const { input, error } of cases) {
    it(`throws "${error}" for ${JSON.stringify(input)}`, () => {
      assert.equal(thrownBy(() => defineConfig(input as never)).message, error);
    });
  }
});
