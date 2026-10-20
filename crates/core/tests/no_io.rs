//! Proves core depends only on `serde`, `serde_json` and `sha2` and names no IO module.

use std::fs;
use std::path::{Path, PathBuf};

/// The IO modules and types no file under `crates/core/src/` may name.
const FORBIDDEN: [&str; 7] = [
    "std::fs",
    "std::process",
    "std::env",
    "std::net",
    "std::thread",
    "SystemTime",
    "Instant",
];

/// Proves the manifest and every source file stay free of IO.
///
/// Covers: rust-core/core-source-names-no-io-module
#[test]
fn core_source_names_no_io_module() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    assert_dependencies(root);
    let mut files = Vec::new();
    collect_rust_files(&root.join("src"), &mut files);
    assert!(!files.is_empty(), "no rust files under src");
    for file in &files {
        let source =
            fs::read_to_string(file).unwrap_or_else(|error| panic!("{}: {error}", file.display()));
        for forbidden in FORBIDDEN {
            assert!(
                !source.contains(forbidden),
                "{} names {forbidden}",
                file.display()
            );
        }
    }
}

/// Asserts the manifest's `[dependencies]` table names exactly the three crates.
fn assert_dependencies(root: &Path) {
    let manifest = fs::read_to_string(root.join("Cargo.toml"))
        .unwrap_or_else(|error| panic!("{}: {error}", root.display()));
    let mut names: Vec<String> = Vec::new();
    let mut in_dependencies = false;
    for line in manifest.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            in_dependencies = trimmed == "[dependencies]";
            continue;
        }
        if !in_dependencies {
            continue;
        }
        let Some((key, _)) = trimmed.split_once('=') else {
            continue;
        };
        let name = key.split_once('.').map_or(key, |(name, _)| name);
        names.push(name.trim().to_owned());
    }
    names.sort();
    assert_eq!(names, ["serde", "serde_json", "sha2"]);
}

/// Collects every `.rs` file under a directory.
fn collect_rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_rust_files(&path, out);
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            out.push(path);
        }
    }
}
