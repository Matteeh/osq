/**
 * `osq docs`: renders the docs site to Markdown under `--out`, default
 * `docs/osq`, removes the stale pages directly under `capabilities/` and
 * `adrs/`, and reports how many pages it wrote. It follows `digestCommand`'s
 * shape and writes nothing outside the output directory.
 */

import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type CommandInputs, resolveInputs } from '../cli/command-inputs.js';
import { buildDocsSite } from './docs-site.js';
import { renderDocsSite } from './markdown.js';

/** The options `docsCommand` accepts. */
export interface DocsCommandOptions extends CommandInputs {
  /** Output directory, relative to `cwd`; defaults to `docs/osq`. */
  readonly out?: string;
}

/** Remove every `.md` file directly in `dir` whose name `keep` does not hold. */
async function removeStale(dir: string, keep: ReadonlySet<string>): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || keep.has(entry.name)) continue;
    await fs.rm(path.join(dir, entry.name));
  }
}

/**
 * Write the docs site as Markdown under `out`, remove the stale pages, print
 * `wrote <n> pages to <out>`, and return the written absolute paths.
 *
 * @scenario docs: Docs written from the fixture
 * @scenario docs: Page lines from the fixture
 * @adr 016
 */
export async function docsCommand(options: DocsCommandOptions = {}): Promise<string[]> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();
  const out = options.out ?? 'docs/osq';
  const outDir = path.resolve(inputs.cwd, out);

  const site = await buildDocsSite(inputs.cwd, config);
  const files = renderDocsSite(site);

  await removeStale(
    path.join(outDir, 'capabilities'),
    new Set(site.capabilities.map((capability) => `${capability.name}.md`)),
  );
  await removeStale(path.join(outDir, 'adrs'), new Set(site.adrs.map((adr) => `${adr.number}.md`)));

  const written: string[] = [];
  for (const [relative, content] of files) {
    const target = path.join(outDir, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
    written.push(target);
  }

  inputs.stdout(`wrote ${files.size} pages to ${out}\n`);
  return written;
}
