import { rustTestModuleRanges } from './rust-test-modules.js';

/** One 1-based, inclusive line range in a source file. */
export interface LineRange {
  readonly start: number;
  readonly end: number;
}

/** How a language adapter reads that language's code. */
export interface LanguageAdapter {
  /** The inline test module ranges of a source text, or null without any. */
  readonly testModuleRanges: ((source: string) => readonly LineRange[]) | null;
}

/** The adapter for a language whose code holds no inline test modules. */
const NO_INLINE_TESTS: LanguageAdapter = { testModuleRanges: null };

/** The adapter for Rust, whose source files hold `#[cfg(test)]` modules. */
const RUST: LanguageAdapter = { testModuleRanges: rustTestModuleRanges };

/**
 * The adapter that reads `language`'s code.
 *
 * @scenario languages: Test module line ranges
 * @scenario languages: No inline test modules in TypeScript
 * @adr 017
 */
export function languageAdapter(language: string): LanguageAdapter {
  return language === 'Rust' ? RUST : NO_INLINE_TESTS;
}
