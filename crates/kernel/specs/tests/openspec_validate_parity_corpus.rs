//! Corpus test: the Rust validator and the `OpenSpec` CLI agree on every living
//! spec, archived change and validate fixture, except the five differences of
//! rust-specs "Validate differences".
//!
//! It runs the `OpenSpec` CLI over this repository's live specs and archive, so
//! it is a corpus test (rust-core "Corpus tests"): each test carries the corpus
//! ignore, and only a build with the `parity` feature compiles it.

pub mod openspec_parity_support;

use openspec_parity_support::cli::{OpenSpecCli, is_version};
use openspec_parity_support::items::validate_comparisons;
use openspec_parity_support::report::{KnownDifference, assert_parity};
use openspec_parity_support::trees::repository_root;

/// The five differences rust-specs "Validate differences" lists.
const KNOWN_DIFFERENCES: [KnownDifference; 5] = [
    KnownDifference {
        label: "fixtures/validate/living/valid.md",
        rust_passes: true,
        openspec_passes: false,
        why: "OpenSpec warns that a Purpose under 50 characters is too brief, \
              which ADR 026 does not port",
    },
    KnownDifference {
        label: "fixtures/validate/delta/empty-delta-section.md",
        rust_passes: false,
        openspec_passes: true,
        why: "ADR 026 makes every delta section well formed",
    },
    KnownDifference {
        label: "fixtures/validate/delta/invalid-rename.md",
        rust_passes: false,
        openspec_passes: true,
        why: "ADR 026 makes every delta section well formed",
    },
    KnownDifference {
        label: "fixtures/validate/delta/unknown-delta-section.md",
        rust_passes: false,
        openspec_passes: true,
        why: "ADR 026 allows only the four delta sections",
    },
    KnownDifference {
        label: "fixtures/validate/targets/changes/unknown",
        rust_passes: false,
        openspec_passes: true,
        why: "OpenSpec checks targets only at archive, and ADR 026 checks them at validate",
    },
];

/// Covers: rust-specs/validate-differences
#[ignore = "corpus test: runs the OpenSpec CLI on the live specs and archive"]
#[test]
fn cli_reports_a_version() {
    let repo = repository_root();
    let cli = OpenSpecCli::locate(&repo);
    let version = cli.version(&repo);
    assert!(
        is_version(&version),
        "openspec {} --version printed `{version}`, not <n>.<n>.<n>",
        cli.path().display()
    );
}

/// Covers: rust-specs/validate-differences
#[ignore = "corpus test: runs the OpenSpec CLI on the live specs and archive"]
#[test]
fn validate_matches_openspec() {
    let repo = repository_root();
    let cli = OpenSpecCli::locate(&repo);
    let comparisons = validate_comparisons(&repo, &cli);
    let labels: Vec<&str> = comparisons
        .iter()
        .map(|comparison| comparison.label.as_str())
        .collect();
    assert!(
        labels
            .iter()
            .any(|label| label.starts_with("openspec/specs/")),
        "no living spec was compared"
    );
    assert!(
        labels
            .iter()
            .any(|label| label.starts_with("openspec/changes/archive/")),
        "no archived change was compared"
    );
    assert_parity(&comparisons, &KNOWN_DIFFERENCES);
}
