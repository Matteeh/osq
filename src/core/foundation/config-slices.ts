/**
 * The slice config-block port and the two folds that join registered slices
 * into the public configuration. It imports nothing from `src/cli/`, so it
 * types slices structurally and `SLICES` is assignable to that type.
 */

/** The top-level config key one slice owns, with its default and resolver. */
export interface SliceConfigBlock {
  /** The top-level `OsqConfig` key this block owns. */
  readonly key: string;
  readonly defaults: unknown;
  /** The resolved block for the user's raw value, or `undefined`; throws on an invalid value. */
  readonly resolve: (raw: unknown) => unknown;
}

/** The part of a slice the config folds read. */
export interface ConfigSlice {
  readonly name: string;
  readonly config?: readonly SliceConfigBlock[];
}

/**
 * Build the default config from `base` and every registered slice's blocks:
 * `base`'s keys in order, then each block key with its defaults, in registry
 * order. A key `base` or an earlier block already holds throws.
 *
 * @scenario cli-foundation: A slice block joins the defaults
 * @adr 016
 */
export function composeDefaultConfig<T extends object>(base: T, slices: readonly ConfigSlice[]): T {
  const result: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>) };
  for (const slice of slices) {
    for (const block of slice.config ?? []) {
      if (Object.prototype.hasOwnProperty.call(result, block.key)) {
        throw new Error(`slice ${slice.name}: config key ${block.key} is already defined`);
      }
      result[block.key] = block.defaults;
    }
  }
  return result as unknown as T;
}

/**
 * Resolve every registered slice block from the user's raw config, mapping
 * each block key to `resolve(config[key])`.
 *
 * @scenario cli-foundation: A slice block resolves the user's value
 * @scenario cli-foundation: Registered defaults match their resolution
 * @adr 016
 */
export function resolveSliceConfig(
  config: object,
  slices: readonly ConfigSlice[],
): Record<string, unknown> {
  const raw = config as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const slice of slices) {
    for (const block of slice.config ?? []) {
      result[block.key] = block.resolve(raw[block.key]);
    }
  }
  return result;
}
