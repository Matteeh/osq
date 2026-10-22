//! Proves the empty show feature's name, commands and refusals.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_show::ShowFeature;

/// Creates an empty scratch project root for one test.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Proves both rows of "Empty show feature".
///
/// Covers: rust-show/empty-show-feature
#[test]
fn empty_show_feature() {
    let feature = ShowFeature;
    assert_eq!(feature.name(), "show");
    assert!(feature.commands().is_empty(), "it lists no command");
    let root = scratch("empty-show-feature");
    for (command, text) in [
        ("show", "unknown command: show"),
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
