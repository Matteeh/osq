import { cargoManifestDependencies } from './cargo-manifest.js';
import { rustTestModuleRanges } from './rust-test-modules.js';

/** One 1-based, inclusive line range in a source file. */
export interface LineRange {
  readonly start: number;
  readonly end: number;
}

/** The crate names a manifest declares, or the line where reading stopped. */
export type ManifestRead =
  | { readonly ok: true; readonly names: readonly string[] }
  | { readonly ok: false; readonly error: string };

/** How a language adapter reads that language's code and manifest. */
export interface LanguageAdapter {
  /** The inline test module ranges of a source text, or null without any. */
  readonly testModuleRanges: ((source: string) => readonly LineRange[]) | null;
  /** The crate names a manifest declares, or null without a reader. */
  readonly manifestDependencies: ((content: string) => ManifestRead) | null;
}

/** The adapter for a language whose code holds no inline tests or manifest. */
const NO_INLINE_TESTS: LanguageAdapter = {
  testModuleRanges: null,
  manifestDependencies: null,
};

/** The adapter for Rust, whose source files hold `#[cfg(test)]` modules. */
const RUST: LanguageAdapter = {
  testModuleRanges: rustTestModuleRanges,
  manifestDependencies: cargoManifestDependencies,
};

/**
 * The adapter that reads `language`'s code.
 *
 * @scenario languages: Test module line ranges
 * @scenario languages: No inline test modules in TypeScript
 * @scenario languages: No manifest reader for other languages
 * @adr 017
 */
export function languageAdapter(language: string): LanguageAdapter {
  return language === 'Rust' ? RUST : NO_INLINE_TESTS;
}
