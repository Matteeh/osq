//! Proves an archived sync reapplies the change's delta to the living specs.

mod support;

use osq_kernel_sync::{SyncKind, SyncOptions, SyncOutcome};
use support::SyncRepo;

/// The alpha change's delta, as the land goldens write it.
const ALPHA_DELTA: &str = "## ADDED Requirements\n\n### Requirement: Alpha\nThe system SHALL alpha.\n\n#### Scenario: Alpha works\n- **WHEN** alpha\n- **THEN** alpha\n";

/// Proves an archived sync merges the change's delta into a living spec.
///
/// Covers: rust-sync/sync-outcomes
#[test]
fn archived_sync_reapplies_the_delta_to_the_living_specs() {
    let repo = SyncRepo::new("archived-spec-rebuild");
    let change = repo.add_archived_change("001-alpha-orders", "true");
    repo.write(
        &change.path,
        "openspec/changes/archive/001-alpha-orders/specs/orders/spec.md",
        ALPHA_DELTA,
    );
    repo.commit_all(&change.path, "branch adds alpha delta");
    repo.main_file("other.txt", "other\n", "main adds other");

    let result = SyncRepo::sync(
        &change,
        SyncKind::Archived,
        SyncOptions {
            records: false,
            verify: true,
            tasks: None,
        },
    );

    assert!(matches!(result, Ok(SyncOutcome::Synced { .. })));
    let spec = repo.read(&change.path, "openspec/specs/orders/spec.md");
    assert!(spec.contains("### Requirement: Alpha"), "{spec}");
}
