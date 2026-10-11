import { slice as docs } from '../docs/slice.js';
import type { Slice } from './slice-types.js';

/**
 * The one static list of every slice, sorted by name. Each
 * `src/<capability>/slice.ts` or `src/kernel/<capability>/slice.ts` adds one
 * `import { slice as <name> }` line and one entry here, sorted by name.
 */
export const SLICES: readonly Slice[] = [docs];
