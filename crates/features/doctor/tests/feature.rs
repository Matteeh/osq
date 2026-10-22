//! Proves the empty doctor feature's name, commands and refusals.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_doctor::DoctorFeature;

/// Creates an empty scratch project root for one test.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Proves both rows of "Empty doctor feature".
///
/// Covers: rust-doctor/empty-doctor-feature
#[test]
fn empty_doctor_feature() {
    let feature = DoctorFeature;
    assert_eq!(feature.name(), "doctor");
    assert!(feature.commands().is_empty(), "it lists no command");
    let root = scratch("empty-doctor-feature");
    for (command, text) in [
        ("doctor", "unknown command: doctor"),
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
