/**
 * The docs slice: its `docs` config block and the `osq docs` command. It
 * reaches the command code through `import()` and the configuration module
 * through type imports only, as ADR 016 requires.
 */

import type { Command } from 'commander';
import type { Slice } from '../cli/slice-types.js';
import { DOCS_DEFAULTS, resolveDocsConfig } from './docs-config.js';

/**
 * The docs slice: the config block `docs` and the `docs` command in the
 * `Inspection` help group, loading `docs-command.js` through `import()`.
 */
export const slice: Slice = {
  name: 'docs',
  config: [{ key: 'docs', defaults: DOCS_DEFAULTS, resolve: resolveDocsConfig }],
  commands: [
    {
      name: 'docs',
      group: 'Inspection',
      register(program: Command): void {
        program
          .command('docs')
          .description('write one Markdown page per capability and per ADR plus an index')
          .option('--out <dir>', 'directory to write the pages to', 'docs/osq')
          .action(async (options: { out?: string }) => {
            const { docsCommand } = await import('./docs-command.js');
            await docsCommand({ out: options.out });
          });
      },
    },
  ],
};
