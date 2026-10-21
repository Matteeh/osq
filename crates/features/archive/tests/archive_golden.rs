//! Proves the archive leaves TypeScript's golden tree byte for byte.

mod support;

use std::path::Path;

use support::{fixture, run, scratch, tree};

/// The golden tree TypeScript's `archiveSpecFolder` left.
const GOLDEN: &str = "tests/golden/project";

/// Proves the scratch tree equals the golden tree and both folders are absent.
///
/// Covers: rust-archive/golden-archive
#[test]
fn golden_archive() {
    let root = scratch("golden-archive");
    assert_eq!(
        tree(&root),
        tree(&fixture()),
        "the scratch starts as the fixture"
    );

    run(&root, &["007"]).expect("the change archives");

    let golden = Path::new(env!("CARGO_MANIFEST_DIR")).join(GOLDEN);
    let actual = tree(&root);
    assert_eq!(actual, tree(&golden));
    assert!(!actual.contains_key("openspec/specs/beta"));
    assert!(!actual.contains_key("openspec/changes/007-sample"));
}
