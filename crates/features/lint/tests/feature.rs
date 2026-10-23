//! Proves the lint feature's name and one command.

use osq_core::{Command, Feature};
use osq_feature_lint::LintFeature;

/// Proves "Lint feature commands".
///
/// Covers: rust-lint/lint-feature-commands
#[test]
fn lint_feature_commands() {
    let feature = LintFeature;
    assert_eq!(feature.name(), "lint");
    assert_eq!(
        feature.commands(),
        vec![Command::new(
            "lint",
            "validate a change's delta specs and the Rust link gates",
            "<id>",
        )]
    );
}
