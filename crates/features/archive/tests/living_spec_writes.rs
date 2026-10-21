//! Proves the living specs, the sidecars and a failed living-file write.

mod reseal;
mod support;

use std::fs;
use std::path::Path;

use osq_core::FeatureError;

use support::{fixture, run, scratch, tree};

/// The fixture change the tests edit and archive.
const CHANGE: &str = "openspec/changes/007-sample";

/// Proves the living specs and sidecars one archive leaves.
///
/// Covers: rust-archive/living-specs-after-an-archive
#[test]
fn living_specs_after_an_archive() {
    let root = scratch("living-specs");
    run(&root, &["007"]).expect("the change archives");
    let specs = root.join("openspec/specs");

    let alpha = read(&specs.join("alpha/spec.md"));
    assert!(alpha.contains("### Requirement: Alpha one"));
    assert!(alpha.contains("The system SHALL do alpha one, twice."));
    assert!(alpha.contains("### Requirement: Alpha second"));
    assert!(alpha.contains("### Requirement: Alpha three"));
    assert!(!alpha.contains("### Requirement: Alpha two"));
    assert_eq!(read(&specs.join("alpha/osq.yml")), "group: core\n");
    assert!(!tree(&root).contains_key("openspec/specs/beta"));
    assert!(read(&specs.join("gamma/spec.md")).contains("### Requirement: Gamma one"));
    assert_eq!(read(&specs.join("gamma/osq.yml")), "group: rust\n");
    assert_eq!(
        fs::read(specs.join("epsilon/spec.md")).unwrap(),
        fs::read(fixture().join("openspec/specs/epsilon/spec.md")).unwrap()
    );
    assert_eq!(
        read(&specs.join("epsilon/osq.yml")),
        "group: rust\ntags:\n  - moved\n"
    );
}

/// Proves each row of the `creates` table writes or leaves the sidecar it names.
///
/// Covers: rust-archive/created-sidecars
#[test]
fn created_sidecars() {
    let rows: [(&str, Option<&str>, &str, Option<&str>); 11] = [
        (
            "mapping",
            Some("creates:\n  - name: gamma\n    group: rust"),
            "gamma/osq.yml",
            Some("group: rust\n"),
        ),
        (
            "trimmed",
            Some("creates:\n  - name: \" gamma \"\n    group: \" rust \""),
            "gamma/osq.yml",
            Some("group: rust\n"),
        ),
        (
            "bare name",
            Some("creates:\n  - gamma"),
            "gamma/osq.yml",
            None,
        ),
        (
            "no group",
            Some("creates:\n  - name: gamma"),
            "gamma/osq.yml",
            None,
        ),
        (
            "second entry",
            Some("creates:\n  - gamma\n  - name: gamma\n    group: rust"),
            "gamma/osq.yml",
            Some("group: rust\n"),
        ),
        (
            "number entry",
            Some("creates:\n  - 7\n  - name: gamma\n    group: rust"),
            "gamma/osq.yml",
            None,
        ),
        ("not a list", Some("creates: gamma"), "gamma/osq.yml", None),
        ("absent", None, "gamma/osq.yml", None),
        (
            "existing sidecar",
            Some("creates:\n  - name: alpha\n    group: rust"),
            "alpha/osq.yml",
            Some("group: core\n"),
        ),
        (
            "emptied capability",
            Some("creates:\n  - name: beta\n    group: rust"),
            "beta",
            None,
        ),
        (
            "no living spec",
            Some("creates:\n  - name: zeta\n    group: rust"),
            "zeta",
            None,
        ),
    ];
    for (index, (name, yaml, relative, expected)) in rows.iter().enumerate() {
        let root = scratch(&format!("created-sidecars-{index}"));
        let change = root.join(CHANGE);
        set_creates(&change, *yaml);
        reseal::reseal(&change);
        run(&root, &["007"]).unwrap_or_else(|error| panic!("{name}: {error}"));
        assert_sidecar(&root, relative, *expected, name);
    }
}

/// Proves a living file's failed write names its path and leaves the change active.
///
/// Covers: rust-archive/living-spec-write-failure
#[test]
fn living_spec_write_failure() {
    let root = scratch("living-write-failure");
    let specs = root.join("openspec/specs");
    fs::write(specs.join("gamma"), "x").unwrap();

    let error = run(&root, &["007"]).expect_err("gamma cannot be written");
    let displayed = error.to_string();
    assert!(
        displayed.starts_with("archive failed: cannot write openspec/specs/gamma/spec.md: "),
        "{displayed}"
    );
    match &error {
        FeatureError::Failed { command, .. } => assert_eq!(command, "archive"),
        other => panic!("expected a failed error, got {other:?}"),
    }
    assert_eq!(fs::read_to_string(specs.join("gamma")).unwrap(), "x");
    assert!(root.join(CHANGE).is_dir(), "the change stays active");
}

/// Proves an emptied capability without a sidecar still leaves nothing behind.
///
/// Covers: rust-archive/living-specs-after-an-archive
#[test]
fn emptied_capability_without_a_sidecar() {
    let root = scratch("emptied-without-sidecar");
    fs::remove_file(root.join("openspec/specs/beta/osq.yml")).unwrap();
    run(&root, &["007"]).expect("the change archives");
    assert!(!tree(&root).contains_key("openspec/specs/beta"));
}

/// Proves an emptied capability's sidecar that cannot be removed fails the write.
///
/// Covers: rust-archive/living-spec-write-failure
#[test]
fn emptied_capability_with_an_unremovable_sidecar() {
    let root = scratch("emptied-unremovable-sidecar");
    let sidecar = root.join("openspec/specs/beta/osq.yml");
    fs::remove_file(&sidecar).unwrap();
    fs::create_dir_all(&sidecar).unwrap();
    let error = run(&root, &["007"]).expect_err("the sidecar cannot be removed");
    let displayed = error.to_string();
    assert!(
        displayed.starts_with("archive failed: cannot write openspec/specs/beta/osq.yml: "),
        "{displayed}"
    );
}

/// Reads a file as UTF-8 text.
fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap()
}

/// Replaces the proposal's `creates` block, or removes it for no YAML.
fn set_creates(change: &Path, yaml: Option<&str>) {
    let path = change.join("proposal.md");
    let text = read(&path);
    let start = text.find("creates:").expect("the fixture declares creates");
    let end = start + text[start..].find("\nfeatures:").expect("features follows") + 1;
    let block = yaml.map_or(String::new(), |yaml| format!("{yaml}\n"));
    fs::write(&path, format!("{}{block}{}", &text[..start], &text[end..])).unwrap();
}

/// Asserts one path under the living specs folder holds `expected` or is absent.
fn assert_sidecar(root: &Path, relative: &str, expected: Option<&str>, label: &str) {
    let path = root.join("openspec/specs").join(relative);
    match expected {
        Some(text) => assert_eq!(read(&path), text, "{label}: {relative}"),
        None => assert!(!path.exists(), "{label}: {relative} is absent"),
    }
}
