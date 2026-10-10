import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SLICES } from '../src/cli/slices.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(REPO_ROOT, 'src');

/** One slice folder and the `name` the `slice` it exports carries. */
interface SliceFolder {
  readonly folder: string;
  readonly name: string;
}

/** The two modules a slice's static runtime imports may not reach. */
const FORBIDDEN = new Set(['src/core/foundation/config.ts', 'src/cli/slices.ts']);

/** True when `names` is in ascending order. */
function isSorted(names: readonly string[]): boolean {
  for (let index = 1; index < names.length; index += 1) {
    if ((names[index - 1] ?? '') > (names[index] ?? '')) return false;
  }
  return true;
}

/**
 * Check the registry against the slice folders on disk: every folder is
 * listed, every registered name has a folder, every slice is named after its
 * folder, and the registered names are sorted.
 */
function checkRegistry(folders: readonly SliceFolder[], registered: readonly string[]): string[] {
  const problems: string[] = [];
  const registeredNames = new Set(registered);
  const sliceNames = new Set(folders.map((entry) => entry.name));
  for (const { folder, name } of folders) {
    if (!registeredNames.has(name)) {
      problems.push(`${folder}/slice.ts is not in SLICES`);
    }
    const folderName = folder.split('/').pop();
    if (folderName !== undefined && name !== folderName) {
      problems.push(`${folder}/slice.ts names ${name}, not ${folderName}`);
    }
  }
  for (const name of registered) {
    if (!sliceNames.has(name)) {
      problems.push(`SLICES lists ${name}, which has no slice.ts`);
    }
  }
  if (!isSorted(registered)) problems.push('SLICES is not sorted by name');
  return problems;
}

/** True when the clause after `import`/`export` carries only type bindings. */
function isTypeOnlyClause(clause: string): boolean {
  const trimmed = clause.trim();
  if (/^type\b/.test(trimmed)) return true;
  const braces = /^\{([\s\S]*)\}$/.exec(trimmed);
  if (braces === null) return false;
  const parts = (braces[1] ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => /^type\s/.test(part));
}

/** The runtime, static, relative import specifiers of a source file. */
function runtimeImports(source: string): string[] {
  const specifiers: string[] = [];
  const clauses = /\b(import|export)\b([^'";]*?)from\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(clauses)) {
    if (!isTypeOnlyClause(match[2] ?? '')) specifiers.push(match[3] ?? '');
  }
  for (const match of source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) {
    specifiers.push(match[1] ?? '');
  }
  return specifiers;
}

/** Resolve one relative specifier against `from`, trying the `.ts` file. */
function resolveSpecifier(
  from: string,
  specifier: string,
  files: Record<string, string>,
): string | null {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  for (const candidate of [
    joined,
    joined.replace(/\.js$/, '.ts'),
    `${joined}.ts`,
    path.posix.join(joined, 'index.ts'),
  ]) {
    if (Object.prototype.hasOwnProperty.call(files, candidate)) return candidate;
  }
  return joined.replace(/\.js$/, '.ts');
}

/** The chain from `current` to a forbidden module, or null. */
function chainTo(
  current: string,
  files: Record<string, string>,
  seen: Set<string>,
): string[] | null {
  if (seen.has(current)) return null;
  seen.add(current);
  const source = files[current];
  if (source === undefined) return null;
  for (const specifier of runtimeImports(source)) {
    const resolved = resolveSpecifier(current, specifier, files);
    if (resolved === null) continue;
    if (FORBIDDEN.has(resolved)) return [current, resolved];
    const rest = chainTo(resolved, files, seen);
    if (rest !== null) return [current, ...rest];
  }
  return null;
}

/** Every slice path `src/<capability>/slice.ts` or `src/kernel/...`. */
const SLICE_PATH = /^src\/(?:kernel\/)?[^/]+\/slice\.ts$/;

/**
 * Check every slice file in `files` and report the chain of a static runtime
 * import that reaches the config module or `SLICES`, and nothing otherwise.
 */
function checkImports(files: Record<string, string>): string[] {
  const chains: string[] = [];
  for (const file of Object.keys(files)
    .filter((key) => SLICE_PATH.test(key))
    .sort()) {
    const chain = chainTo(file, files, new Set());
    if (chain !== null) chains.push(chain.join(' -> '));
  }
  return chains;
}

/** Every slice file under `src/`, imported so its `slice.name` is readable. */
async function findSliceFolders(): Promise<SliceFolder[]> {
  const folders: SliceFolder[] = [];
  for (const entry of await fs.readdir(SRC_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const bases =
      entry.name === 'kernel'
        ? (await fs.readdir(path.join(SRC_DIR, 'kernel'), { withFileTypes: true }))
            .filter((sub) => sub.isDirectory())
            .map((sub) => `src/kernel/${sub.name}`)
        : [`src/${entry.name}`];
    for (const base of bases) {
      const relative = `${base}/slice.ts`;
      if (!existsSync(path.join(REPO_ROOT, relative))) continue;
      const loaded = (await import(pathToFileURL(path.join(REPO_ROOT, relative)).href)) as {
        slice: { name: string };
      };
      folders.push({ folder: base, name: loaded.slice.name });
    }
  }
  return folders.sort((left, right) => (left.folder < right.folder ? -1 : 1));
}

/** Every `.ts` file under `dir`, keyed by repository-relative path. */
async function readSourceFiles(
  dir: string,
  files: Record<string, string> = {},
): Promise<Record<string, string>> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await readSourceFiles(full, files);
    else if (entry.name.endsWith('.ts')) {
      files[path.relative(REPO_ROOT, full).split(path.sep).join('/')] = await fs.readFile(
        full,
        'utf8',
      );
    }
  }
  return files;
}

/** Run both registry checks against osq's own `src/` tree and `SLICES`. */
async function checkOwnRegistry(): Promise<string[]> {
  const folders = await findSliceFolders();
  const files = await readSourceFiles(SRC_DIR);
  return [
    ...checkRegistry(
      folders,
      SLICES.map((slice) => slice.name),
    ),
    ...checkImports(files),
  ];
}

/** The `run.ts` body the config-import rows share. */
const RUN_TS = "import { loadConfig } from '../core/foundation/config.js';\n";

/** The rows of the "Registry matches the slice folders" table. */
const REGISTRY_CASES: readonly {
  folders: SliceFolder[];
  registered: string[];
  problems: string[];
}[] = [
  {
    folders: [
      { folder: 'src/land', name: 'land' },
      { folder: 'src/kernel/git', name: 'git' },
    ],
    registered: ['git', 'land'],
    problems: [],
  },
  {
    folders: [{ folder: 'src/land', name: 'land' }],
    registered: [],
    problems: ['src/land/slice.ts is not in SLICES'],
  },
  {
    folders: [],
    registered: ['land'],
    problems: ['SLICES lists land, which has no slice.ts'],
  },
  {
    folders: [{ folder: 'src/land', name: 'landing' }],
    registered: ['landing'],
    problems: ['src/land/slice.ts names landing, not land'],
  },
  {
    folders: [
      { folder: 'src/land', name: 'land' },
      { folder: 'src/kernel/git', name: 'git' },
    ],
    registered: ['land', 'git'],
    problems: ['SLICES is not sorted by name'],
  },
];

/** The rows of the "Slice imports stay off the configuration module" table. */
const IMPORT_CASES: readonly {
  sliceImports: string;
  files: Record<string, string>;
  chain: string | null;
}[] = [
  {
    sliceImports: "import { runLand } from './run.js'",
    files: {
      'src/land/slice.ts': "import { runLand } from './run.js';\n",
      'src/land/run.ts': RUN_TS,
    },
    chain: 'src/land/slice.ts -> src/land/run.ts -> src/core/foundation/config.ts',
  },
  {
    sliceImports: "export { runLand } from './run.js'",
    files: {
      'src/land/slice.ts': "export { runLand } from './run.js';\n",
      'src/land/run.ts': RUN_TS,
    },
    chain: 'src/land/slice.ts -> src/land/run.ts -> src/core/foundation/config.ts',
  },
  {
    sliceImports: "import type { OsqConfig } from '../core/foundation/config.js'",
    files: {
      'src/land/slice.ts': "import type { OsqConfig } from '../core/foundation/config.js';\n",
    },
    chain: null,
  },
  {
    sliceImports: "const run = async () => (await import('./run.js')).runLand()",
    files: {
      'src/land/slice.ts': "const run = async () => (await import('./run.js')).runLand();\n",
      'src/land/run.ts': RUN_TS,
    },
    chain: null,
  },
  {
    sliceImports: "import { SLICES } from '../cli/slices.js'",
    files: { 'src/land/slice.ts': "import { SLICES } from '../cli/slices.js';\n" },
    chain: 'src/land/slice.ts -> src/cli/slices.ts',
  },
];

describe('Slice registry', () => {
  it('Registry matches the slice folders', () => {
    for (const row of REGISTRY_CASES) {
      assert.deepEqual(
        checkRegistry(row.folders, row.registered),
        row.problems,
        `folders ${JSON.stringify(row.folders)} registered ${JSON.stringify(row.registered)}`,
      );
    }
  });

  it('Slice imports stay off the configuration module', () => {
    for (const row of IMPORT_CASES) {
      const expected = row.chain === null ? [] : [row.chain];
      assert.deepEqual(checkImports(row.files), expected, row.sliceImports);
    }
  });

  it("osq's registry passes its own check", async () => {
    assert.deepEqual(await checkOwnRegistry(), []);
  });
});
