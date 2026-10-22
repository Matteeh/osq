//! Proves the doctor feature's name, its one command and its argument errors.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Command, Feature, FeatureError, Invocation};
use osq_feature_doctor::DoctorFeature;

/// Creates an empty scratch project root for one test.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Proves "Doctor feature commands".
///
/// Covers: rust-doctor/doctor-feature-commands
#[test]
fn doctor_feature_commands() {
    let feature = DoctorFeature;
    assert_eq!(feature.name(), "doctor");
    assert_eq!(
        feature.commands(),
        vec![Command::new(
            "doctor",
            "check the configuration and the pi harness",
            "",
        )]
    );
}

/// Proves every row of "Doctor argument errors".
///
/// Covers: rust-doctor/doctor-argument-errors
#[test]
fn doctor_argument_errors() {
    let root = scratch("doctor_argument_errors");
    let rows: [(&str, &[&str], &str); 3] = [
        (
            "doctor",
            &["x"],
            "usage of doctor: expected no arguments, got 1",
        ),
        (
            "doctor",
            &["x", "y"],
            "usage of doctor: expected no arguments, got 2",
        ),
        ("inbox", &[], "unknown command: inbox"),
    ];
    let feature = DoctorFeature;
    for (command, args, text) in rows {
        let invocation = Invocation::new(
            &root,
            command,
            args.iter().map(|arg| (*arg).to_owned()).collect(),
        );
        let error = feature
            .run(&invocation)
            .expect_err("the invocation is refused");
        assert_eq!(error.to_string(), text, "{command} {args:?}");
        match (&error, command) {
            (FeatureError::Usage { command: name, .. }, "doctor") => {
                assert_eq!(name, "doctor", "{command} {args:?}: command");
            }
            (FeatureError::UnknownCommand { .. }, "inbox") => {}
            other => panic!("{command} {args:?}: unexpected error {other:?}"),
        }
    }
}
