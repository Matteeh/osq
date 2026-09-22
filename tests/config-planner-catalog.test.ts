import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolvePlannerSelection,
  validatePlannerConfig,
} from '../src/core/foundation/config-codex.js';
import { DEFAULT_CONFIG, defineConfig } from '../src/core/foundation/config.js';
import { HARNESS_CATALOG, HARNESS_NAMES } from '../src/core/foundation/harness-catalog.js';
import * as publicApi from '../src/index.js';

const SAVED_OSQ_MODEL = process.env.OSQ_MODEL;

function restoreEnv(): void {
  if (SAVED_OSQ_MODEL === undefined) Reflect.deleteProperty(process.env, 'OSQ_MODEL');
  else process.env.OSQ_MODEL = SAVED_OSQ_MODEL;
}

describe('catalog-driven planner validation', () => {
  it('accepts every catalogued harness with any supported casing and normalizes the name', () => {
    for (const name of HARNESS_NAMES) {
      assert.deepEqual(validatePlannerConfig({ harness: name.toUpperCase(), model: 'm' }), {
        harness: name,
        model: 'm',
      });
    }
  });

  it('retains the required non-empty planner model', () => {
    assert.throws(
      () => validatePlannerConfig({ harness: 'agy' }),
      /planner\.model must be a non-empty string/,
    );
    assert.throws(
      () => validatePlannerConfig({ harness: 'agy', model: '   ' }),
      /planner\.model must be a non-empty string/,
    );
  });

  it('rejects uncatalogued harnesses naming the catalog entries', () => {
    assert.throws(
      () => validatePlannerConfig({ harness: 'bogus', model: 'm' }),
      /Unsupported planner harness: "bogus"\. Must be one of: agy, opencode, mock, codex/,
    );
  });

  it('rejects optional settings unsupported by the selected harness, naming harness and setting', () => {
    assert.throws(
      () => validatePlannerConfig({ harness: 'codex', model: 'm', agent: 'osq-planner' }),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return message.includes('codex') && message.includes('agent');
      },
    );

    // Agent support is derived directly from the catalog: exactly the entries
    // declaring support accept the setting.
    for (const entry of HARNESS_CATALOG) {
      const validate = (): unknown =>
        validatePlannerConfig({ harness: entry.name, model: 'm', agent: 'some-agent' });
      if (entry.planner.agent) {
        assert.doesNotThrow(validate, `${entry.name} supports planner.agent`);
      } else {
        assert.throws(validate, new RegExp(`for the ${entry.name} harness`));
      }
    }
  });

  it('rejects malformed optional settings before harness-specific checks', () => {
    assert.throws(
      () => validatePlannerConfig({ harness: 'agy', model: 'm', agent: '  ' }),
      /planner\.agent must be a non-empty string if provided/,
    );
  });
});

describe('catalog-driven planner selection', () => {
  it('uses explicit planner values and the supported default agent', () => {
    const opencodePlanner = defineConfig({
      harness: 'codex',
      codex: { model: 'executor-model', effort: 'high' },
      planner: { harness: 'opencode', model: 'planner-model' },
    });
    assert.deepEqual(resolvePlannerSelection(opencodePlanner), {
      harness: 'opencode',
      model: 'planner-model',
      briefModel: 'planner-model',
      agent: 'osq-planner',
    });

    const codexPlanner = defineConfig({
      harness: 'agy',
      planner: { harness: 'codex', model: 'codex-planner' },
    });
    assert.deepEqual(resolvePlannerSelection(codexPlanner), {
      harness: 'codex',
      model: 'codex-planner',
      briefModel: 'codex-planner',
    });
  });

  it('never leaks executor effort or cross-harness defaults into an explicit planner', () => {
    const mixed = defineConfig({
      harness: 'codex',
      codex: { model: 'executor-model', effort: 'high' },
      planner: { harness: 'agy', model: 'agy-planner-model' },
    });
    const selection = resolvePlannerSelection(mixed);
    assert.deepEqual(selection, {
      harness: 'agy',
      model: 'agy-planner-model',
      briefModel: 'agy-planner-model',
    });
    assert.ok(!('agent' in selection), 'agy has no default planner agent');
    assert.notEqual(selection.model, 'executor-model');
  });

  it('falls back to the selected executor catalog entry with native attribution', () => {
    restoreEnv();
    try {
      Reflect.deleteProperty(process.env, 'OSQ_MODEL');

      assert.deepEqual(resolvePlannerSelection(defineConfig({ harness: 'codex' })), {
        harness: 'codex',
        briefModel: 'default',
      });
      assert.deepEqual(
        resolvePlannerSelection(defineConfig({ harness: 'codex', codex: { model: 'exec-model' } })),
        { harness: 'codex', model: 'exec-model', briefModel: 'exec-model' },
      );

      const opencode = resolvePlannerSelection(defineConfig({ harness: 'opencode' }));
      assert.deepEqual(opencode, {
        harness: 'opencode',
        model: DEFAULT_CONFIG.opencode?.model,
        briefModel: DEFAULT_CONFIG.opencode?.model,
        agent: 'osq-planner',
      });

      assert.deepEqual(resolvePlannerSelection(defineConfig({ harness: 'agy' })), {
        harness: 'agy',
        model: DEFAULT_CONFIG.agy?.model,
        briefModel: DEFAULT_CONFIG.agy?.model,
      });
    } finally {
      restoreEnv();
    }
  });

  it('uses planner values for a mixed harness selection without executor leakage', () => {
    const config = defineConfig({
      harness: 'opencode',
      opencode: { model: 'opencode-exec', agent: 'osq-coder' },
      planner: { harness: 'codex', model: 'codex-plan' },
    });
    assert.deepEqual(resolvePlannerSelection(config), {
      harness: 'codex',
      model: 'codex-plan',
      briefModel: 'codex-plan',
    });
  });
});

describe('planner configuration integration and exports', () => {
  it('keeps defineConfig planner validation wired to the catalog', () => {
    assert.deepEqual(
      defineConfig({ planner: { harness: 'MOCK', model: 'mock-model', agent: 'mock-planner' } })
        .planner,
      { harness: 'mock', model: 'mock-model', agent: 'mock-planner' },
    );
    assert.throws(
      () => defineConfig({ planner: { harness: 'codex', model: 'm', agent: 'osq-planner' } }),
      /for the codex harness/,
    );
    assert.throws(
      () => defineConfig({ planner: { harness: 'NOPE', model: 'm' } }),
      /Unsupported planner harness: "NOPE"/,
    );
  });

  it('exposes catalog planner helpers through the public entry point', () => {
    assert.equal(typeof publicApi.resolvePlannerSelection, 'function');
    assert.equal(typeof publicApi.validatePlannerConfig, 'function');
    assert.equal(typeof publicApi.resolveExecutorIdentity, 'function');
    assert.equal(typeof publicApi.availableHarnessNames, 'function');
  });
});
