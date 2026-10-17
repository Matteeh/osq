/**
 * The facts of every language osq knows, in preset order, and the one list of
 * which gates and extras cover each language. What a language is made of is
 * data; nothing here reads a file (ADR 017).
 */

/** A binary a task verify may start with, and the subcommands it accepts. */
export interface VerifyRunner {
  readonly binary: string;
  readonly subcommands: readonly string[];
}

/**
 * One language osq knows: its manifests, lock files, extensions, test folders
 * and verify runners.
 */
export interface LanguagePreset {
  readonly name: string;
  readonly manifests: readonly string[];
  readonly lockFiles: readonly string[];
  readonly extensions: readonly string[];
  readonly testFolders: readonly string[];
  readonly verifyRunners: readonly VerifyRunner[];
}

/** Every language osq knows, in the order the coverage list and maps use. */
export const LANGUAGE_PRESETS: readonly LanguagePreset[] = [
  {
    name: 'TypeScript/JavaScript',
    manifests: ['package.json'],
    lockFiles: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'],
    extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
    testFolders: [],
    verifyRunners: [],
  },
  {
    name: 'Rust',
    manifests: ['Cargo.toml'],
    lockFiles: ['Cargo.lock'],
    extensions: ['.rs'],
    testFolders: ['tests', 'benches'],
    verifyRunners: [
      {
        binary: 'cargo',
        subcommands: ['test', 'nextest', 'build', 'check', 'clippy', 'fmt', 'run'],
      },
    ],
  },
  {
    name: 'Python',
    manifests: ['pyproject.toml'],
    lockFiles: ['poetry.lock', 'uv.lock'],
    extensions: ['.py'],
    testFolders: [],
    verifyRunners: [],
  },
  {
    name: 'Go',
    manifests: ['go.mod'],
    lockFiles: ['go.sum'],
    extensions: ['.go'],
    testFolders: [],
    verifyRunners: [],
  },
];

/** A gate or extra, and the languages it covers. */
export interface CoverageEntry {
  readonly name: string;
  readonly kind: 'gate' | 'extra';
  readonly covers: readonly string[];
}

/** The one list of which languages each gate and extra covers, in list order. */
export const LANGUAGE_COVERAGE: readonly CoverageEntry[] = [
  { name: 'test-modification gate', kind: 'gate', covers: ['TypeScript/JavaScript', 'Rust'] },
  { name: 'denied-dependency gate', kind: 'gate', covers: ['TypeScript/JavaScript'] },
  { name: 'verify-command lint', kind: 'extra', covers: ['TypeScript/JavaScript', 'Rust'] },
  { name: 'test output reading', kind: 'extra', covers: ['TypeScript/JavaScript'] },
  { name: 'import graph', kind: 'extra', covers: ['TypeScript/JavaScript'] },
  { name: 'traceability', kind: 'extra', covers: ['TypeScript/JavaScript'] },
  { name: 'function ranges', kind: 'extra', covers: ['TypeScript/JavaScript'] },
  { name: 'repository measures', kind: 'extra', covers: ['TypeScript/JavaScript'] },
];

/** The gates and extras that do not cover a language, each in list order. */
export interface UncoveredBy {
  readonly gates: readonly string[];
  readonly extras: readonly string[];
}

/**
 * The names of the gates and of the extras that do not cover `language`, each
 * in `LANGUAGE_COVERAGE` order.
 *
 * @scenario languages: Gates and extras a language lacks
 * @adr 017
 */
export function uncoveredBy(language: string): UncoveredBy {
  const gates: string[] = [];
  const extras: string[] = [];
  for (const entry of LANGUAGE_COVERAGE) {
    if (entry.covers.includes(language)) continue;
    if (entry.kind === 'gate') gates.push(entry.name);
    else extras.push(entry.name);
  }
  return { gates, extras };
}

/**
 * The verify runners of the presets whose names are in `languages`, in preset
 * order.
 *
 * @scenario languages: Verify runners of the languages
 * @adr 017
 */
export function verifyRunners(languages: readonly string[]): readonly VerifyRunner[] {
  const wanted = new Set(languages);
  return LANGUAGE_PRESETS.filter((preset) => wanted.has(preset.name)).flatMap(
    (preset) => preset.verifyRunners,
  );
}
