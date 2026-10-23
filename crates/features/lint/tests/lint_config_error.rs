//! Proves the error lint gives when `osq.toml` cannot load.

mod copy;
mod support;

use osq_core::FeatureError;

use support::{run, write};

/// Proves "Lint config error".
///
/// Covers: rust-lint/lint-config-error
#[test]
fn lint_config_error() {
    let root = copy::fixture("lint_config_error/bogus-key");
    write(&root, "osq.toml", "bogus = 1\n");
    let error = run(&root, "1").expect_err("the config cannot load");
    match error {
        FeatureError::Failed {
            command, message, ..
        } => {
            assert_eq!(command, "lint");
            assert_eq!(message, "bogus is not an osq.toml key");
        }
        other => panic!("expected a failed error, got {other:?}"),
    }
}
