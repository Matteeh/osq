//! Proves the errors lint reports when a check cannot run.

mod support;

use osq_core::FeatureError;

use support::{run, scratch, write};

/// The delta spec that needs a workspace above it to reach the link gates.
const DELTA: &str = "## ADDED Requirements\n\n### Requirement: Alpha runs\n\
                     The system SHALL run alpha.\n\n#### Scenario: Alpha runs\n\
                     - **WHEN** alpha starts\n- **THEN** alpha runs\n";

/// Proves every row of "Lint check errors".
///
/// Covers: rust-lint/lint-check-errors
#[test]
fn lint_check_errors() {
    let rows: [(&str, &[u8], &str); 2] = [
        (
            "unreadable-delta",
            &[0xff, 0xfe],
            "/openspec/changes/001-a/specs/alpha/spec.md: ",
        ),
        ("bad-manifest", DELTA.as_bytes(), "/Cargo.toml: "),
    ];
    for (name, delta, tail) in rows {
        let root = scratch(&format!("lint_check_errors_{name}"));
        write(
            &root,
            "openspec/changes/001-a/proposal.md",
            "---\ntitle: A\n---\n",
        );
        write(&root, "openspec/changes/001-a/specs/alpha/spec.md", delta);
        if name == "bad-manifest" {
            write(&root, "Cargo.toml", "[package]\nname = \"one\"\n");
        }
        let error = run(&root, "1").expect_err("the check cannot run");
        let message = failed_message(error);
        let prefix = format!("{}{tail}", root.display());
        assert!(message.starts_with(&prefix), "{name}: {message}");
        assert!(!message.contains('\n'), "{name}: no finding line");
    }
}

/// The message of a failed error for the command `lint`.
fn failed_message(error: FeatureError) -> String {
    match error {
        FeatureError::Failed {
            command, message, ..
        } => {
            assert_eq!(command, "lint");
            message
        }
        other => panic!("expected a failed error, got {other:?}"),
    }
}
