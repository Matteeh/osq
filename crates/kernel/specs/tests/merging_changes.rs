//! Merge tests for a change folder: the "Change merges" and edges tables.

use osq_kernel_specs::{
    MergeChangeError, MergeError, MergedSpec, SpecsError, merge_change, merge_living_spec,
    parse_delta,
};
use std::path::{Path, PathBuf};

/// The `validate/` fixtures folder a change merge reads.
fn validate_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/merge/validate")
}

/// The fixture changes folder.
fn changes_dir() -> PathBuf {
    validate_dir().join("changes")
}

/// The fixture living specs folder.
fn specs_dir() -> PathBuf {
    validate_dir().join("specs")
}

/// The scratch folder for the edge cases.
fn scratch() -> PathBuf {
    PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("change-merge-edges")
}

/// Reads a fixture file as UTF-8 text.
fn read_text(path: &Path) -> String {
    let bytes =
        std::fs::read(path).unwrap_or_else(|error| panic!("reading {}: {error}", path.display()));
    String::from_utf8(bytes).unwrap_or_else(|error| panic!("utf-8 of {}: {error}", path.display()))
}

/// Reads the living text a merged spec merges into, or none when absent.
fn living_text(capability: &str) -> Option<String> {
    let path = specs_dir().join(capability).join("spec.md");
    path.is_file().then(|| read_text(&path))
}

/// Checks that each merged text equals `merge_living_spec` of the same inputs.
fn assert_recomputes(specs: &[MergedSpec]) {
    for spec in specs {
        let delta = parse_delta(&read_text(&spec.delta));
        let living = living_text(&spec.capability);
        let expected = merge_living_spec(living.as_deref(), &spec.capability, &delta)
            .unwrap_or_else(|error| panic!("recomputing {}: {error}", spec.delta.display()));
        assert_eq!(
            expected, spec.text,
            "recomputed text of {}",
            spec.capability
        );
    }
}

/// Covers: rust-specs/change-merges
#[test]
fn change_merges() {
    for case in ["clean", "emptied", "fresh"] {
        let change = changes_dir().join(case);
        let specs = merge_change(&change, &specs_dir())
            .unwrap_or_else(|error| panic!("merging {case}: {error}"));
        assert_recomputes(&specs);
    }

    let clean = merge_change(&changes_dir().join("clean"), &specs_dir()).expect("clean merges");
    assert_eq!(1, clean.len(), "clean merged spec count");
    assert_eq!("alpha", clean[0].capability);
    assert_eq!(
        changes_dir().join("clean/specs/alpha/spec.md"),
        clean[0].delta
    );
    assert!(clean[0].text.is_some(), "clean keeps alpha");

    let emptied =
        merge_change(&changes_dir().join("emptied"), &specs_dir()).expect("emptied merges");
    assert_eq!(1, emptied.len(), "emptied merged spec count");
    assert_eq!("beta", emptied[0].capability);
    assert_eq!(None, emptied[0].text, "emptied removes beta");

    let fresh = merge_change(&changes_dir().join("fresh"), &specs_dir()).expect("fresh merges");
    let text = fresh[0].text.as_deref().expect("gamma keeps a text");
    assert!(
        text.starts_with(
            "# gamma Specification\n\n## Purpose\nGamma for the merged validation fixture.\n"
        ),
        "fresh text starts with the skeleton: {text:?}"
    );
}

/// Covers: rust-specs/change-merges
#[test]
fn change_merge_refuses() {
    let change = changes_dir().join("refused");
    let error = merge_change(&change, &specs_dir()).expect_err("refused refuses");
    match &error {
        MergeChangeError::Merge { path, error } => {
            assert_eq!(&change.join("specs/alpha/spec.md"), path, "refusal path");
            assert_eq!(
                &MergeError::ModifiedMissing {
                    capability: "alpha".to_string(),
                    requirement: "Missing".to_string(),
                },
                error
            );
        }
        MergeChangeError::Read(other) => panic!("unexpected read error: {other:?}"),
    }
    assert!(
        error.to_string().contains("specs/alpha/spec.md"),
        "the error names the delta: {error}"
    );
}

/// Covers: rust-specs/change-merge-edges
#[test]
fn change_merge_edges() {
    let root = scratch();
    let _ = std::fs::remove_dir_all(&root);

    let no_specs = root.join("no-specs");
    std::fs::create_dir_all(&no_specs).expect("the no-specs change folder");
    assert!(
        merge_change(&no_specs, &specs_dir())
            .expect("no specs merges")
            .is_empty(),
        "a change with no specs folder gives no merged spec"
    );

    let bare = root.join("bare");
    std::fs::create_dir_all(bare.join("specs/alpha")).expect("the bare change folder");
    assert!(
        merge_change(&bare, &specs_dir())
            .expect("bare merges")
            .is_empty(),
        "a delta folder without spec.md gives no merged spec"
    );

    let bad = root.join("bad");
    std::fs::create_dir_all(bad.join("specs/alpha")).expect("the bad change folder");
    std::fs::write(bad.join("specs/alpha/spec.md"), [0xff_u8, 0xfe]).expect("the bad delta bytes");
    let error = merge_change(&bad, &specs_dir()).expect_err("the bad delta refuses");
    match error {
        MergeChangeError::Read(SpecsError::Read { path, .. }) => {
            assert_eq!(bad.join("specs/alpha/spec.md"), path, "read error path");
        }
        other => panic!("unexpected error: {other:?}"),
    }
}
