import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Package root of the running osq build: `src/core/foundation/` when executed
 * through `tsx`, `dist/core/foundation/` once compiled. Both resolve three
 * levels up.
 */
export const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));

/** Path to the package's bundled `templates/` directory. */
export const TEMPLATES_ROOT = path.join(PACKAGE_ROOT, 'templates');
