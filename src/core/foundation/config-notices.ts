/**
 * Approval notice settings. `defineConfig` validates and defaults this block
 * here, so a consumer never sees a partial notices configuration.
 */
export interface NoticesConfig {
  /** How many notices the approve view leads with; the rest fold. */
  readonly maxShown: number;
  /** More tasks than this raises the `many_tasks` notice. */
  readonly maxTasks: number;
  /** More resolved files than this raises the `large_scope` notice. */
  readonly maxResolvedFiles: number;
  /** Scope patterns, besides the built-in rule files, a task may not reach. */
  readonly rulePaths: readonly string[];
}

export const DEFAULT_NOTICES_CONFIG: NoticesConfig = {
  maxShown: 5,
  maxTasks: 6,
  maxResolvedFiles: 15,
  rulePaths: [],
};

const COUNT_FIELDS = ['maxShown', 'maxTasks', 'maxResolvedFiles'] as const;

type CountField = (typeof COUNT_FIELDS)[number];

/**
 * Validate an optional `notices` block over the defaults. A partial block keeps
 * each missing default; a count that is not a positive integer, or a
 * `rulePaths` value that is not a list of non-empty scope patterns, is rejected
 * with an error naming its key.
 */
export function validateNoticesConfig(notices: unknown): NoticesConfig {
  if (notices === undefined) return DEFAULT_NOTICES_CONFIG;
  if (typeof notices !== 'object' || notices === null || Array.isArray(notices)) {
    throw new Error('notices configuration must be an object');
  }
  const record = notices as Record<string, unknown>;
  const result: Record<CountField, number> = { ...DEFAULT_NOTICES_CONFIG };
  for (const field of COUNT_FIELDS) {
    const value = record[field] === undefined ? DEFAULT_NOTICES_CONFIG[field] : record[field];
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new Error(`notices.${field} must be a positive integer`);
    }
    result[field] = value;
  }

  const rulePaths =
    record.rulePaths === undefined ? DEFAULT_NOTICES_CONFIG.rulePaths : record.rulePaths;
  if (
    !Array.isArray(rulePaths) ||
    !rulePaths.every((entry) => typeof entry === 'string' && entry.trim() !== '')
  ) {
    throw new Error('notices.rulePaths must be a list of scope patterns');
  }

  return { ...result, rulePaths };
}
