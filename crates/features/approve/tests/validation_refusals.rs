//! Proves the lint refusal for delta specs that fail the specs kernel.

mod support;

use std::fs;

use osq_core::FeatureError;

use support::{exists, fixture, run, scratch, write};

/// One row: its name, its delta spec or none, and the message after `Lint failed for spec "001-a":`.
type Row = (&'static str, Option<&'static str>, &'static str);

/// Every row of "Validation refusals", in the scenario's order.
const ROWS: &[Row] = &[
    (
        "no-delta",
        None,
        "/proposal.md:1: the change holds no delta spec",
    ),
    (
        "no-shall",
        Some(
            "## ADDED Requirements\n\n### Requirement: Alpha rests\n\
             The system rests alpha.\n\n#### Scenario: Alpha rests\n\
             - **WHEN** alpha stops\n- **THEN** alpha rests\n",
        ),
        "/specs/alpha/spec.md:3: requirement `Alpha rests` states no SHALL or MUST",
    ),
    (
        "unknown-requirement",
        Some(
            "## MODIFIED Requirements\n\n### Requirement: Beta runs\n\
             The system SHALL run beta.\n\n#### Scenario: Beta runs\n\
             - **WHEN** beta starts\n- **THEN** beta runs\n",
        ),
        "/specs/alpha/spec.md:3: the delta names `Beta runs`, which the living spec has no \
         requirement for",
    ),
    (
        "already-exists",
        Some(
            "## ADDED Requirements\n\n### Requirement: Alpha runs\n\
             The system SHALL run alpha.\n\n#### Scenario: A\n\
             - **WHEN** a\n- **THEN** a\n",
        ),
        "/specs/alpha/spec.md: alpha ADDED failed for header \"### Requirement: Alpha runs\" - \
         already exists",
    ),
];

/// Writes the row's root: the living alpha spec, its proposal and, where given, its delta.
fn repository(name: &str, delta: Option<&str>) -> std::path::PathBuf {
    let root = scratch(&format!("validation-{name}"));
    let living = fixture("approve-repo").join("openspec/specs/alpha/spec.md");
    let living = fs::read_to_string(living).expect("the living alpha spec reads");
    write(&root, "openspec/specs/alpha/spec.md", living);
    write(
        &root,
        "openspec/changes/001-a/proposal.md",
        "---\ntitle: A\n---\n",
    );
    if let Some(delta) = delta {
        write(&root, "openspec/changes/001-a/specs/alpha/spec.md", delta);
    }
    root
}

/// Proves every row of "Validation refusals".
///
/// Covers: rust-approve/validation-refusals
#[test]
fn validation_refusals() {
    for &(name, delta, tail) in ROWS {
        let root = repository(name, delta);
        let folder = root.join("openspec/changes/001-a");
        let error = run(&root, "1").expect_err("the delta specs fail validation");
        assert_eq!(
            error.to_string(),
            format!(
                "approve failed: Lint failed for spec \"001-a\":\n  - {}{tail}",
                folder.display()
            ),
            "{name}"
        );
        match &error {
            FeatureError::Failed { command, .. } => {
                assert_eq!(command, "approve", "{name}: command");
            }
            other => panic!("{name}: expected a failed error, got {other:?}"),
        }
        assert!(
            !exists(&root, "openspec/changes/001-a/.run/approved"),
            "{name}: no marker"
        );
    }
}
