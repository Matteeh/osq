//! Proves the empty retry feature's name, commands and refusals.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_retry::RetryFeature;

/// Creates an empty scratch project root for one test.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Proves both rows of "Empty retry feature".
///
/// Covers: rust-retry/empty-retry-feature
#[test]
fn empty_retry_feature() {
    let feature = RetryFeature;
    assert_eq!(feature.name(), "retry");
    assert!(feature.commands().is_empty(), "it lists no command");
    let root = scratch("empty-retry-feature");
    for (command, text) in [
        ("retry", "unknown command: retry"),
        ("inbox", "unknown command: inbox"),
    ] {
        let result = feature.run(&Invocation::new(&root, command, Vec::new()));
        assert_eq!(
            result
                .expect_err("the feature refuses every invocation")
                .to_string(),
            text,
            "{command}"
        );
    }
}
