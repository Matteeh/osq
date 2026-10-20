//! Collecting every rust-specs "`OpenSpec` validate parity" item and both
//! outcomes.

mod archive;
mod delta;
mod living;
mod openspec;
mod targets;

use super::cli::OpenSpecCli;
use super::report::Comparison;
use std::path::Path;

/// Compares every item of rust-specs "`OpenSpec` validate parity": the living
/// specs, the archived changes, and the validate fixtures.
///
/// # Panics
///
/// Panics when a temporary project cannot be written or an item cannot be
/// prepared.
#[must_use]
pub fn validate_comparisons(repo: &Path, cli: &OpenSpecCli) -> Vec<Comparison> {
    let mut comparisons = living::living_spec_comparisons(repo, cli);
    comparisons.extend(living::living_fixture_comparisons(repo, cli));
    comparisons.extend(delta::delta_fixture_comparisons(repo, cli));
    comparisons.extend(targets::target_comparisons(repo, cli));
    comparisons.extend(archive::archive_comparisons(repo, cli));
    comparisons
}
