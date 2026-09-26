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

/**
 * The running osq's own `index` entry, without an extension: `src/index` under
 * `tsx` and `dist/index` once compiled. Config files import `@matteeh/osq`,
 * which jiti aliases here so they resolve to the running osq.
 */
export const PACKAGE_ENTRY = path.resolve(fileURLToPath(new URL('../../index', import.meta.url)));
