//! Corpus golden tests: the archived documents and the live living specs.
//!
//! Both are corpus tests (rust-core "Corpus tests"): they read the archive and
//! the living specs outside this crate, so they carry the corpus ignore, run
//! under `scripts/verify-rust.sh`, and cargo-mutants leaves them out.
//! `golden_cases.rs` is their fast counterpart.

pub mod golden_support;

#[path = "golden_corpus/corpus.rs"]
mod corpus;

use golden_support::assert_no_failures;

/// Covers: rust-specs/archived-documents-match-typescript
#[ignore = "corpus test: reads the live archive"]
#[test]
fn archived_documents_match_typescript() {
    let failures = corpus::archive_failures(&corpus::repository_root());
    assert_no_failures(&failures);
}

/// Covers: rust-specs/living-specs-read
#[ignore = "corpus test: reads the live living specs"]
#[test]
fn living_specs_read() {
    let failures = corpus::living_failures(&corpus::repository_root());
    assert_no_failures(&failures);
}
