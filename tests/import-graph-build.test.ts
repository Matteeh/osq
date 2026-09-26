import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  IGNORED_DIRS,
  buildImportGraph,
  reachImporters,
  reachImports,
} from '../src/core/spec/import-graph.js';
import { countImportFanIn, gatherRepoCounts } from '../src/watcher/measures.js';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC_DIR = path.join(REPO, 'src');
const SCRIPT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const OSQ_TARGETS = [
  'src/core/foundation/config.ts',
  'src/core/report/planning.ts',
  'src/harness/codex/codex.ts',
  'src/core/status/state.ts',
  'src/core/spec/parser.ts',
];

const roots: string[] = [];

/** Create a temporary repository holding `files` keyed by relative POSIX path. */
async function makeRepo(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-import-graph-'));
  roots.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf8');
  }
  return root;
}

afterEach(async () => {
  while (roots.length > 0) {
    await fs.rm(roots.pop() ?? '', { recursive: true, force: true });
  }
});

/** Import statements exercising every specifier form the graph follows. */
const ALL_FORMS = [
  "export { reexported } from './reexport.js';",
  "import type { Shape } from './types.js';",
  "import './side-effect.js';",
  "const lazy = import('./dynamic.js');",
  "const legacy = require('./required.js');",
].join('\n');

describe('buildImportGraph', () => {
  it('resolves a .js specifier to the existing .ts file', async () => {
    const root = await makeRepo({
      'src/b.ts': 'export const b = 1;\n',
      'src/a.ts': "import { b } from './b.js';\n",
    });

    const graph = await buildImportGraph(root);

    assert.deepEqual(graph.files, ['src/a.ts', 'src/b.ts']);
    assert.deepEqual(graph.importsOf('src/a.ts'), ['src/b.ts']);
    assert.deepEqual(graph.importersOf('src/b.ts'), ['src/a.ts']);
    assert.deepEqual(graph.importsOf('src/b.ts'), []);
    assert.deepEqual(graph.importersOf('src/a.ts'), []);
  });

  it('follows export ... from, import type, dynamic import(), and require()', async () => {
    const root = await makeRepo({
      'src/main.ts': `${ALL_FORMS}\n`,
      'src/reexport.ts': 'export const reexported = 1;\n',
      'src/types.ts': 'export interface Shape { x: number }\n',
      'src/side-effect.ts': 'export {};\n',
      'src/dynamic.ts': 'export const dynamic = 1;\n',
      'src/required.ts': 'export const required = 1;\n',
    });

    const graph = await buildImportGraph(root);

    assert.deepEqual(graph.importsOf('src/main.ts'), [
      'src/dynamic.ts',
      'src/reexport.ts',
      'src/required.ts',
      'src/side-effect.ts',
      'src/types.ts',
    ]);
    assert.deepEqual(graph.importersOf('src/dynamic.ts'), ['src/main.ts']);
    assert.deepEqual(graph.importersOf('src/types.ts'), ['src/main.ts']);
  });

  it('resolves a directory import to its index file', async () => {
    const root = await makeRepo({
      'src/a.ts': "import { lib } from './lib';\n",
      'src/lib/index.ts': 'export const lib = 1;\n',
    });

    const graph = await buildImportGraph(root);

    assert.deepEqual(graph.importsOf('src/a.ts'), ['src/lib/index.ts']);
    assert.deepEqual(graph.importersOf('src/lib/index.ts'), ['src/a.ts']);
  });

  it('never resolves bare or aliased specifiers', async () => {
    const root = await makeRepo({
      'src/app.ts': [
        "import fs from 'node:fs';",
        "import React from 'react';",
        "import { x } from '@scope/pkg';",
        "import { y } from '#internal';",
      ].join('\n'),
    });

    const graph = await buildImportGraph(root);

    assert.deepEqual(graph.importsOf('src/app.ts'), []);
  });

  it('leaves out ignored folders and options.skip', async () => {
    const root = await makeRepo({
      'src/a.ts': 'export const a = 1;\n',
      'openspec/changes/1/b.ts': 'export const b = 1;\n',
      'node_modules/pkg/c.ts': 'export const c = 1;\n',
      'dist/d.ts': 'export const d = 1;\n',
    });

    const withSkip = await buildImportGraph(root, { skip: ['openspec'] });

    assert.deepEqual(withSkip.files, ['src/a.ts']);

    const withoutSkip = await buildImportGraph(root);

    assert.deepEqual(withoutSkip.files, ['openspec/changes/1/b.ts', 'src/a.ts']);
  });

  it('excludes declaration files from the graph', async () => {
    const root = await makeRepo({
      'src/types.d.ts': 'export interface Shape { x: number }\n',
      'src/a.ts': 'export const a = 1;\n',
    });

    const graph = await buildImportGraph(root);

    assert.deepEqual(graph.files, ['src/a.ts']);
    assert.deepEqual(graph.importsOf('src/types.d.ts'), []);
  });

  it('returns an empty graph for a repository without script files', async () => {
    const root = await makeRepo({
      'main.py': 'print("hello")\n',
      'pkg/module.py': 'x = 1\n',
    });

    const graph = await buildImportGraph(root);

    assert.deepEqual(graph.files, []);
    assert.deepEqual(graph.importsOf('main.py'), []);
    assert.deepEqual(graph.importersOf('main.py'), []);
  });

  it('shares the ignored folder names with gatherRepoCounts', async () => {
    assert.ok(IGNORED_DIRS.has('node_modules'));
    assert.ok(IGNORED_DIRS.has('dist'));
    assert.ok(IGNORED_DIRS.has('.git'));

    const root = await makeRepo({
      'src/a.ts': 'a',
      'coverage/report.ts': 'ignored\n',
      '.nyc_output/out.ts': 'ignored\n',
    });

    assert.deepEqual(await gatherRepoCounts(root), { files: 1, lines: 1 });
  });
});

describe('reachImports', () => {
  it('returns every file the start imports at any depth, sorted', async () => {
    const root = await makeRepo({
      'src/a.ts': "import './b.js';\n",
      'src/b.ts': "import './c.js';\n",
      'src/c.ts': 'export const c = 1;\n',
    });
    const graph = await buildImportGraph(root);

    assert.deepEqual(reachImports(graph, ['src/a.ts']), ['src/b.ts', 'src/c.ts']);
    assert.deepEqual(reachImports(graph, ['src/c.ts']), []);
  });

  it('does not include a start file unless a cycle reaches it', async () => {
    const root = await makeRepo({
      'src/a.ts': "import './b.js';\n",
      'src/b.ts': "import './a.js';\n",
    });
    const graph = await buildImportGraph(root);

    assert.deepEqual(reachImports(graph, ['src/a.ts']), ['src/a.ts', 'src/b.ts']);
  });
});

describe('reachImporters', () => {
  it('reports each importing file with its depth, nearest first', async () => {
    const root = await makeRepo({
      'tests/a.test.ts': "import '../src/b.js';\n",
      'src/b.ts': "import './c.js';\n",
      'src/c.ts': 'export const c = 1;\n',
    });
    const graph = await buildImportGraph(root);

    assert.deepEqual(reachImporters(graph, ['src/c.ts'], 1), [{ file: 'src/b.ts', depth: 1 }]);
    assert.deepEqual(reachImporters(graph, ['src/c.ts'], 2), [
      { file: 'src/b.ts', depth: 1 },
      { file: 'tests/a.test.ts', depth: 2 },
    ]);
    assert.deepEqual(reachImporters(graph, ['src/c.ts'], 0), []);
  });

  it('keeps one entry per file at its nearest depth', async () => {
    const root = await makeRepo({
      'src/direct.ts': "import './target.js';\n",
      'src/indirect.ts': "import './direct.js';\n",
      'src/target.ts': 'export const target = 1;\n',
    });
    const graph = await buildImportGraph(root);

    assert.deepEqual(reachImporters(graph, ['src/target.ts'], 3), [
      { file: 'src/direct.ts', depth: 1 },
      { file: 'src/indirect.ts', depth: 2 },
    ]);
  });
});

describe('countImportFanIn', () => {
  it('counts non-scoped src TypeScript files that import a scoped file', async () => {
    const root = await makeRepo({
      'src/foo.ts': 'export const foo = 1;\n',
      'src/bar.ts': "import { foo } from './foo.js';\n",
      'tests/foo.test.ts': "import { foo } from '../src/foo.js';\n",
    });

    assert.equal(await countImportFanIn(root, ['src/foo.ts']), 1);
  });

  it('does not count an importer of a prefix-named sibling', async () => {
    const root = await makeRepo({
      'src/codex.ts': 'export const codex = 1;\n',
      'src/codex-prompt.ts': 'export const prompt = 1;\n',
      'src/x.ts': "import './codex-prompt.js';\n",
      'src/y.ts': "import './codex.js';\n",
    });

    assert.equal(await countImportFanIn(root, ['src/codex.ts']), 1);
  });

  it('returns 0 when the scope holds no existing src file', async () => {
    const root = await makeRepo({ 'src/foo.ts': 'export const foo = 1;\n' });

    assert.equal(await countImportFanIn(root, ['src/missing.ts']), 0);
  });

  it('resolves a glob into its real import targets', async () => {
    const root = await makeRepo({
      'src/core/foo.ts': 'export const foo = 1;\n',
      'src/other/baz.ts': "import { foo } from '../core/foo.js';\n",
    });

    assert.equal(await countImportFanIn(root, ['src/core/*.ts']), 1);
  });
});

/** Recursively list `src/**\/*.ts` excluding declarations, as project-relative POSIX. */
async function listSrcTypeScriptFiles(dir = SRC_DIR, acc: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await listSrcTypeScriptFiles(full, acc);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      acc.push(path.relative(REPO, full).split(path.sep).join('/'));
    }
  }
  return acc;
}

/** True when `content` quotes a whole specifier resolving from `importer` to `target`. */
function quotesSpecifierFor(content: string, importer: string, target: string): boolean {
  let relative = path.posix.relative(path.posix.dirname(importer), target);
  if (!relative.startsWith('.')) relative = `./${relative}`;
  const stem = relative.replace(/\.[^./]+$/, '');
  const candidates = [stem, ...SCRIPT_EXTENSIONS.map((extension) => `${stem}${extension}`)];
  return candidates.some(
    (candidate) => content.includes(`'${candidate}'`) || content.includes(`"${candidate}"`),
  );
}

/** Count src TypeScript files quoting a whole specifier for each target. */
async function quotedSpecifierFanIn(targets: readonly string[]): Promise<Record<string, number>> {
  const files = await listSrcTypeScriptFiles();
  const contents = new Map<string, string>();
  for (const file of files) contents.set(file, await fs.readFile(path.join(REPO, file), 'utf8'));
  const counts: Record<string, number> = {};
  for (const target of targets) {
    let count = 0;
    for (const file of files) {
      if (file === target) continue;
      if (quotesSpecifierFor(contents.get(file) ?? '', file, target)) count += 1;
    }
    counts[target] = count;
  }
  return counts;
}

describe("countImportFanIn on osq's own repository", () => {
  it('equals a search for whole quoted import specifiers', async () => {
    const expected = await quotedSpecifierFanIn(OSQ_TARGETS);

    for (const target of OSQ_TARGETS) {
      assert.equal(
        await countImportFanIn(REPO, [target]),
        expected[target],
        `fan-in mismatch for ${target}`,
      );
    }
  });
});
