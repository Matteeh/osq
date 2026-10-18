//! Differential merge tests: the frozen `openspec-diff` cases.

use osq_kernel_specs::{MergeChangeError, MergedSpec, merge_change};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// The frozen `openspec-diff` fixtures folder.
fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/merge/openspec-diff")
}

/// The scratch folder each case is copied to.
fn scratch(case: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_TARGET_TMPDIR"))
        .join("differential")
        .join(case)
}

/// Reads a fixture file as UTF-8 text.
fn read_text(path: &Path) -> String {
    let bytes =
        std::fs::read(path).unwrap_or_else(|error| panic!("reading {}: {error}", path.display()));
    String::from_utf8(bytes).unwrap_or_else(|error| panic!("utf-8 of {}: {error}", path.display()))
}

/// Copies every file and folder under `source` into `target`.
fn copy_tree(source: &Path, target: &Path) {
    std::fs::create_dir_all(target).expect("the target folder");
    for entry in std::fs::read_dir(source)
        .expect("the source folder")
        .flatten()
    {
        let path = entry.path();
        let destination = target.join(entry.file_name());
        if path.is_dir() {
            copy_tree(&path, &destination);
        } else {
            std::fs::copy(&path, &destination).expect("a copied file");
        }
    }
}

/// The folders directly under `dir`, in byte order of their names.
fn folders(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut folders: Vec<PathBuf> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.path())
        .collect();
    folders.sort_by(|left, right| left.file_name().cmp(&right.file_name()));
    folders
}

/// Writes each merged text, or removes a capability folder the change empties.
fn apply(specs_root: &Path, specs: &[MergedSpec]) {
    for spec in specs {
        let folder = specs_root.join(&spec.capability);
        match &spec.text {
            Some(text) => {
                std::fs::create_dir_all(&folder).expect("the capability folder");
                std::fs::write(folder.join("spec.md"), text).expect("the merged spec");
            }
            None => {
                std::fs::remove_dir_all(&folder).expect("the emptied capability folder");
            }
        }
    }
}

/// Every file under `root`, keyed by its `/`-joined relative path.
fn tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut files = BTreeMap::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else {
                let relative = path
                    .strip_prefix(root)
                    .expect("a path under the root")
                    .to_string_lossy()
                    .replace('\\', "/");
                files.insert(relative, std::fs::read(&path).expect("a read file"));
            }
        }
    }
    files
}

/// The message of a merge refusal the case expects.
fn refusal_message(error: &MergeChangeError) -> String {
    match error {
        MergeChangeError::Merge { error, .. } => error.to_string(),
        MergeChangeError::Read(error) => panic!("unexpected read error: {error}"),
    }
}

/// Covers: rust-specs/differential-cases
#[test]
fn differential_cases() {
    let rows: &[(&str, bool)] = &[
        ("added", true),
        ("given-and", true),
        ("modified", true),
        ("new-capability", true),
        ("removed", true),
        ("renamed", true),
        ("second-change", true),
        ("bare-rename", false),
        ("dropped-scenario", false),
        ("duplicate-added", false),
    ];
    for (case, identical) in rows {
        let work = scratch(case);
        let _ = std::fs::remove_dir_all(&work);
        copy_tree(&fixtures().join(case), &work);

        let specs_root = work.join("work");
        if work.join("specs").is_dir() {
            copy_tree(&work.join("specs"), &specs_root);
        }
        let mut refusal = None;
        for change in folders(&work.join("changes")) {
            match merge_change(&change, &specs_root) {
                Ok(specs) => apply(&specs_root, &specs),
                Err(error) => {
                    refusal = Some(refusal_message(&error));
                    break;
                }
            }
        }
        if *identical {
            assert_eq!(None, refusal, "case {case} refused");
            let expected = tree(&work.join("expected"));
            let actual = tree(&specs_root);
            assert_eq!(expected, actual, "the tree of case {case}");
        } else {
            let expected = read_text(&work.join("error.txt"));
            assert_eq!(Some(expected), refusal, "the refusal of case {case}");
        }
    }
}
