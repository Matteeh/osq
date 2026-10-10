import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SLICES } from '../src/cli/slices.js';
import {
  type SliceConfigBlock,
  composeDefaultConfig,
  resolveSliceConfig,
} from '../src/core/foundation/config-slices.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';

/** The base object the "A slice block joins the defaults" rows use. */
const BASE = { harness: 'agy', limits: { maxScopeFiles: 8 } };

/** A structurally-typed slice, as the config folds read one. */
interface TestSlice {
  readonly name: string;
  readonly config?: readonly SliceConfigBlock[];
}

/** A block whose resolver returns its raw value, else its defaults. */
function block(key: string, defaults?: unknown): SliceConfigBlock {
  return { key, defaults, resolve: (raw) => raw ?? defaults };
}

/** A slice with the given name and blocks. */
function slice(name: string, ...blocks: SliceConfigBlock[]): TestSlice {
  return { name, config: blocks };
}

/** The rows of the "A slice block joins the defaults" table. */
const COMPOSE_CASES: readonly {
  slices: TestSlice[];
  result?: string;
  throws?: string;
}[] = [
  { slices: [], result: '{"harness":"agy","limits":{"maxScopeFiles":8}}' },
  {
    slices: [slice('widgets', block('widgets', { size: 3 }))],
    result: '{"harness":"agy","limits":{"maxScopeFiles":8},"widgets":{"size":3}}',
  },
  {
    slices: [slice('widgets', block('harness'))],
    throws: 'slice widgets: config key harness is already defined',
  },
  {
    slices: [slice('widgets', block('widgets')), slice('gizmos', block('widgets'))],
    throws: 'slice gizmos: config key widgets is already defined',
  },
];

/** The `widgets` slice "A slice block resolves the user's value" defines. */
const WIDGETS_SLICES: readonly TestSlice[] = [
  {
    name: 'widgets',
    config: [
      {
        key: 'widgets',
        defaults: { size: 3 },
        resolve: (raw) => {
          const record = (raw ?? {}) as { size?: unknown };
          const size = record.size ?? 3;
          if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
            throw new Error('widgets.size must be a positive integer');
          }
          return { size };
        },
      },
    ],
  },
];

/** The rows of the "A slice block resolves the user's value" table. */
const RESOLVE_CASES: readonly { userConfig: object; result: object; throws?: string }[] = [
  { userConfig: {}, result: { widgets: { size: 3 } } },
  { userConfig: { widgets: { size: 5 } }, result: { widgets: { size: 5 } } },
  {
    userConfig: { widgets: { size: -1 } },
    result: {},
    throws: 'widgets.size must be a positive integer',
  },
];

/** Every registered block's defaults next to what it resolves from `undefined`. */
function registeredDefaults(): { defaults: unknown; resolved: unknown }[] {
  return SLICES.flatMap((entry) =>
    (entry.config ?? []).map((configBlock) => ({
      defaults: configBlock.defaults,
      resolved: configBlock.resolve(undefined),
    })),
  );
}

describe('Slice configuration blocks', () => {
  it('A slice block joins the defaults', () => {
    for (const row of COMPOSE_CASES) {
      if (row.throws !== undefined) {
        assert.throws(
          () => composeDefaultConfig(BASE, row.slices),
          (error: unknown) => error instanceof Error && error.message === row.throws,
        );
        continue;
      }
      assert.equal(JSON.stringify(composeDefaultConfig(BASE, row.slices)), row.result);
    }
  });

  it("A slice block resolves the user's value", () => {
    for (const row of RESOLVE_CASES) {
      if (row.throws !== undefined) {
        assert.throws(
          () => resolveSliceConfig(row.userConfig, WIDGETS_SLICES),
          (error: unknown) => error instanceof Error && error.message === row.throws,
        );
        continue;
      }
      assert.deepEqual(resolveSliceConfig(row.userConfig, WIDGETS_SLICES), row.result);
    }
  });

  it('Registered defaults match their resolution', () => {
    for (const pair of registeredDefaults()) {
      assert.deepEqual(pair.resolved, pair.defaults);
    }
  });

  it('composing the defaults with no slices changes nothing', () => {
    assert.equal(
      JSON.stringify(DEFAULT_CONFIG),
      JSON.stringify(composeDefaultConfig(DEFAULT_CONFIG, [])),
    );
  });
});
