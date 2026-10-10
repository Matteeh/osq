import type { Slice } from './slice-types.js';

/**
 * The one static list of every slice, sorted by name. Each
 * `src/<capability>/slice.ts` or `src/kernel/<capability>/slice.ts` adds one
 * `import { slice as <name> }` line and one entry here, sorted by name. It
 * starts empty because no slice has moved yet.
 */
export const SLICES: readonly Slice[] = [];
