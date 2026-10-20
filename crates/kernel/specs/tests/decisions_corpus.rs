//! Corpus test: this repository's live decisions read as ADRs and validate.

use osq_kernel_specs::{read_decisions, validate_decisions};
use std::fs;
use std::path::{Path, PathBuf};

/// The repository root, three folders above the crate manifest.
fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("the repository root")
        .to_path_buf()
}

/// The names of the capability folders under `openspec/specs`, sorted.
fn living_capabilities(root: &Path) -> Vec<String> {
    let mut names = Vec::new();
    for entry in fs::read_dir(root.join("openspec/specs")).expect("read living specs") {
        let entry = entry.expect("read a living spec folder");
        if entry.file_type().expect("read the entry kind").is_dir() {
            names.push(entry.file_name().to_string_lossy().into_owned());
        }
    }
    names.sort();
    names
}

/// Covers: rust-specs/Live decisions validate
#[test]
#[ignore = "corpus test: reads the live decisions folder"]
fn live_decisions_validate() {
    let root = repository_root();
    let records = read_decisions(&root, Path::new("decisions"), Path::new("openspec"));
    let living = living_capabilities(&root);

    assert!(
        records.ignored.is_empty(),
        "ignored decisions files: {:?}",
        records.ignored
    );

    let markdown = fs::read_dir(root.join("decisions"))
        .expect("read the decisions folder")
        .filter_map(Result::ok)
        .filter(|entry| {
            entry.file_type().is_ok_and(|kind| kind.is_file())
                && entry.file_name().to_string_lossy().ends_with(".md")
                && entry.file_name().to_string_lossy() != "README.md"
        })
        .count();
    assert_eq!(
        records.adrs.len(),
        markdown,
        "every Markdown file is an ADR"
    );

    let problems = validate_decisions(&records, &living, 160);
    let messages: Vec<String> = problems.errors.iter().map(ToString::to_string).collect();
    assert!(messages.is_empty(), "errors:\n{}", messages.join("\n"));
}
