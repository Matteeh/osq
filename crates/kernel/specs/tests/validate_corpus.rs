//! Corpus tests: this repository's living specs and archived delta specs validate.
//!
//! Both read documents outside this crate, so they are corpus tests (rust-core
//! "Corpus tests"): they carry the corpus ignore, run under
//! `scripts/verify-rust.sh`, and cargo-mutants leaves them out.

use osq_kernel_specs::{SpecFinding, validate_delta, validate_living_specs};
use std::path::{Path, PathBuf};

/// The repository root, three folders above this crate's manifest.
fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("the repository root is three folders above crates/kernel/specs")
        .to_path_buf()
}

/// The change number a folder name leads with, if it leads with digits.
fn leading_number(name: &str) -> Option<u32> {
    let digits: String = name.chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

/// One finding as its file, line, code and message.
fn describe(finding: &SpecFinding) -> String {
    format!(
        "{}:{}: {}: {}",
        finding.file,
        finding.line,
        finding.code.as_str(),
        finding.message
    )
}

/// Every finding as a line, joined, so a failure prints all of them.
fn describe_all(findings: &[SpecFinding]) -> String {
    findings.iter().map(describe).collect::<Vec<_>>().join("\n")
}

/// A path under `root` written repository-relative.
fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .display()
        .to_string()
}

/// Covers: rust-specs/living-specs-validate
#[ignore = "corpus test: reads the live specs and archive"]
#[test]
fn living_specs_validate() {
    let specs = repository_root().join("openspec/specs");
    let findings = validate_living_specs(&specs).expect("this repository's living specs");
    assert!(
        findings.is_empty(),
        "living spec findings:\n{}",
        describe_all(&findings)
    );
}

/// The archived change folders numbered 001 to 216, by number.
fn archived_changes(root: &Path) -> Vec<(u32, PathBuf)> {
    let archive = root.join("openspec/changes/archive");
    let Ok(entries) = std::fs::read_dir(&archive) else {
        return Vec::new();
    };
    let mut changes: Vec<(u32, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let number = leading_number(&entry.file_name().to_string_lossy())?;
            (1..=216).contains(&number).then(|| (number, entry.path()))
        })
        .collect();
    changes.sort_by_key(|(number, _)| *number);
    changes
}

/// The `specs/<capability>/spec.md` paths of one archived change.
fn delta_paths(change: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(change.join("specs")) else {
        return Vec::new();
    };
    let mut paths: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path().join("spec.md"))
        .filter(|path| path.is_file())
        .collect();
    paths.sort();
    paths
}

/// The change numbers the corpus expects to hold no delta spec.
fn expected_without_delta() -> Vec<u32> {
    let mut numbers: Vec<u32> = (1..=15).collect();
    numbers.push(18);
    numbers.push(19);
    numbers
}

/// Covers: rust-specs/archived-deltas-validate
#[ignore = "corpus test: reads the live specs and archive"]
#[test]
fn archived_deltas_validate() {
    let root = repository_root();
    let mut findings = Vec::new();
    let mut without = Vec::new();
    for (number, change) in archived_changes(&root) {
        let deltas = delta_paths(&change);
        if deltas.is_empty() {
            without.push(number);
            continue;
        }
        for path in deltas {
            let file = relative(&root, &path);
            let text = std::fs::read_to_string(&path).expect("a delta spec reads");
            findings.extend(validate_delta(&file, &text));
        }
    }
    assert!(
        findings.is_empty(),
        "archived delta findings:\n{}",
        describe_all(&findings)
    );
    assert_eq!(
        expected_without_delta(),
        without,
        "archived changes numbered 001 to 216 without a delta spec"
    );
}
