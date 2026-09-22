import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import {
  HARNESS_CATALOG,
  HARNESS_NAMES,
  availableHarnessNames,
  findHarness,
  lookupHarness,
  normalizeHarnessName,
  resolveExecutorIdentity,
  resolveHarnessExecutable,
} from '../src/core/foundation/harness-catalog.js';
import { getHarnessAdapter, harnessAdapterFactories } from '../src/harness/index.js';
import * as publicApi from '../src/index.js';

const ENV_KEYS = ['AGY_PATH', 'OPENCODE_PATH', 'CODEX_PATH', 'OSQ_MODEL'] as const;
const SAVED_ENV = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = SAVED_ENV.get(key);
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
}

describe('harness capability catalog', () => {
  it('contains every supported harness exactly once in ordered available names', () => {
    const names = HARNESS_CATALOG.map((entry) => entry.name);
    assert.deepEqual(names, [...HARNESS_NAMES]);
    assert.equal(new Set(names).size, names.length, 'each harness appears once');
    assert.deepEqual(availableHarnessNames(), [...HARNESS_NAMES]);

    assert.ok(Object.isFrozen(HARNESS_CATALOG), 'catalog is immutable');
    for (const entry of HARNESS_CATALOG) {
      assert.ok(Object.isFrozen(entry), `catalog entry ${entry.name} is immutable`);
    }
  });

  it('normalizes lookup across supported casing and reports catalog names when unknown', () => {
    assert.equal(normalizeHarnessName('  CoDeX '), 'codex');
    for (const name of HARNESS_NAMES) {
      assert.equal(lookupHarness(name).name, name);
      assert.equal(lookupHarness(name.toUpperCase()).name, name);
      assert.equal(lookupHarness(`  ${name}  `).name, name);
      assert.equal(findHarness(name.toUpperCase())?.name, name);
    }

    assert.equal(findHarness('nope'), undefined);
    assert.throws(
      () => lookupHarness('nope'),
      /Unknown harness: "nope"\. Available harnesses: agy, opencode, mock, codex/,
    );
  });

  it('resolves each harness executable through catalog metadata', () => {
    restoreEnv();
    try {
      Reflect.deleteProperty(process.env, 'AGY_PATH');
      Reflect.deleteProperty(process.env, 'OPENCODE_PATH');
      Reflect.deleteProperty(process.env, 'CODEX_PATH');

      assert.equal(resolveHarnessExecutable('mock', DEFAULT_CONFIG), null);

      assert.equal(resolveHarnessExecutable('agy', DEFAULT_CONFIG), 'agy');
      process.env.AGY_PATH = '/env/agy';
      assert.equal(resolveHarnessExecutable('agy', DEFAULT_CONFIG), '/env/agy');

      assert.equal(resolveHarnessExecutable('opencode', DEFAULT_CONFIG), 'opencode');
      const explicitOpencode = defineConfig({ opencode: { bin: '/opt/opencode' } });
      assert.equal(resolveHarnessExecutable('opencode', explicitOpencode), '/opt/opencode');
      process.env.OPENCODE_PATH = '/env/opencode';
      assert.equal(
        resolveHarnessExecutable('opencode', explicitOpencode),
        '/env/opencode',
        'OPENCODE_PATH takes precedence, matching the adapter',
      );
      assert.equal(resolveHarnessExecutable('opencode', defineConfig({})), '/env/opencode');

      assert.equal(resolveHarnessExecutable('codex', defineConfig({ harness: 'codex' })), 'codex');
      process.env.CODEX_PATH = '/env/codex';
      assert.equal(
        resolveHarnessExecutable('codex', defineConfig({ harness: 'codex' })),
        '/env/codex',
      );
      const explicitCodex = defineConfig({ harness: 'codex', codex: { bin: '/opt/codex' } });
      assert.equal(resolveHarnessExecutable('codex', explicitCodex), '/opt/codex');
    } finally {
      restoreEnv();
    }
  });

  it('derives executor identity only from the selected harness, with a default sentinel', () => {
    restoreEnv();
    try {
      Reflect.deleteProperty(process.env, 'OSQ_MODEL');

      assert.deepEqual(resolveExecutorIdentity(defineConfig({})), {
        harness: 'agy',
        model: DEFAULT_CONFIG.agy?.model,
        effort: null,
      });

      assert.deepEqual(resolveExecutorIdentity(defineConfig({ harness: 'opencode' })), {
        harness: 'opencode',
        model: DEFAULT_CONFIG.opencode?.model,
        effort: null,
      });

      assert.deepEqual(resolveExecutorIdentity(defineConfig({ harness: 'codex' })), {
        harness: 'codex',
        model: 'default',
        effort: null,
      });
      assert.notEqual(
        resolveExecutorIdentity(defineConfig({ harness: 'codex' })).model,
        DEFAULT_CONFIG.agy?.model,
        'codex never borrows the agy model',
      );

      assert.deepEqual(
        resolveExecutorIdentity(
          defineConfig({ harness: 'codex', codex: { model: 'gpt-5-codex', effort: 'high' } }),
        ),
        { harness: 'codex', model: 'gpt-5-codex', effort: 'high' },
      );

      const bareOpencode = {
        ...DEFAULT_CONFIG,
        harness: 'opencode',
        opencode: {},
      } as OsqConfig;
      assert.deepEqual(resolveExecutorIdentity(bareOpencode), {
        harness: 'opencode',
        model: 'default',
        effort: null,
      });
    } finally {
      restoreEnv();
    }
  });

  it('declares planner-agent capability and native attribution per catalog entry', () => {
    assert.deepEqual(lookupHarness('opencode').planner, {
      agent: true,
      defaultAgent: 'osq-planner',
      briefModelWhenNative: '',
    });
    assert.equal(lookupHarness('agy').planner.agent, true);
    assert.equal(lookupHarness('mock').planner.agent, true);
    assert.equal(lookupHarness('codex').planner.agent, false);
    assert.equal(lookupHarness('codex').planner.briefModelWhenNative, 'default');
  });

  it('keeps adapter factories at runtime parity with catalog names', () => {
    assert.deepEqual(Object.keys(harnessAdapterFactories).sort(), [...HARNESS_NAMES].sort());
    for (const name of HARNESS_NAMES) {
      assert.equal(getHarnessAdapter(name).name, name);
    }
    assert.equal(getHarnessAdapter('AGY').name, 'agy');
    assert.notEqual(
      harnessAdapterFactories.agy(),
      harnessAdapterFactories.agy(),
      'factories construct fresh adapters',
    );
    assert.throws(
      () => getHarnessAdapter('unsupported-harness'),
      /Unknown harness adapter: "unsupported-harness"\. Available adapters: agy, opencode, mock, codex/,
    );
  });

  it('exposes the catalog through the public configuration entry point', () => {
    assert.equal(typeof publicApi.lookupHarness, 'function');
    assert.equal(typeof publicApi.resolveExecutorIdentity, 'function');
    assert.equal(typeof publicApi.resolvePlannerSelection, 'function');
    assert.equal(publicApi.HARNESS_CATALOG.length, publicApi.HARNESS_NAMES.length);
  });
});
