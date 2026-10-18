//! Proves every corpus test is marked and the verify script runs corpus tests.

use std::fs;
use std::path::{Path, PathBuf};

/// The attribute prefix every corpus test carries (rust-core "Corpus tests").
const CORPUS_IGNORE: &str = "#[ignore = \"corpus test: ";

/// One `#[test]` function and whether it carries the corpus ignore attribute.
struct TestFunction<'a> {
    /// The function's name as written.
    name: &'a str,
    /// Whether the function carries the corpus ignore attribute.
    ignored: bool,
}

/// Proves every `*_corpus.rs` test under `crates/` carries the corpus ignore.
///
/// Covers: rust-core/corpus-tests-are-marked
#[test]
fn corpus_tests_are_marked() {
    let mut corpus = Vec::new();
    collect_corpus_files(&workspace_root().join("crates"), &mut corpus);
    corpus.sort();
    assert!(
        !corpus.is_empty(),
        "no *_corpus.rs file under crates/; an empty walk never passes"
    );
    for file in &corpus {
        let source =
            fs::read_to_string(file).unwrap_or_else(|error| panic!("{}: {error}", file.display()));
        for test in test_functions(&source) {
            assert!(
                test.ignored,
                "{}: test {} is not marked `{CORPUS_IGNORE}...\"`",
                file.display(),
                test.name
            );
        }
    }
}

/// Proves the verify script runs the ignored corpus tests.
///
/// Covers: rust-core/verify-runs-corpus-tests
#[test]
fn verify_runs_corpus_tests() {
    let script = workspace_root().join("scripts/verify-rust.sh");
    let text =
        fs::read_to_string(&script).unwrap_or_else(|error| panic!("{}: {error}", script.display()));
    assert!(
        text.lines()
            .any(|line| line.trim() == "cargo test --workspace -- --include-ignored"),
        "{} does not run `cargo test --workspace -- --include-ignored`",
        script.display()
    );
}

/// The workspace root, two folders up from the `osq-core` manifest.
fn workspace_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("the workspace root is two folders above crates/core")
        .to_path_buf()
}

/// Collects every `*_corpus.rs` file directly inside a `tests` folder.
fn collect_corpus_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_corpus_files(&path, out);
        } else if is_corpus_test(&path) {
            out.push(path);
        }
    }
}

/// Whether a path is a `*_corpus.rs` file directly inside a `tests` folder.
fn is_corpus_test(path: &Path) -> bool {
    let in_tests = path
        .parent()
        .and_then(Path::file_name)
        .is_some_and(|name| name == "tests");
    let is_corpus = path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.ends_with("_corpus.rs"));
    in_tests && is_corpus
}

/// Reads every `#[test]` function of one source file and its ignore attribute.
fn test_functions(source: &str) -> Vec<TestFunction<'_>> {
    let lines: Vec<&str> = source.lines().collect();
    let mut functions = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        let Some(name) = function_name(line) else {
            continue;
        };
        let attributes = attribute_block(&lines, index);
        if !attributes.contains(&"#[test]") {
            continue;
        }
        let ignored = attributes
            .iter()
            .any(|attribute| attribute.starts_with(CORPUS_IGNORE));
        functions.push(TestFunction { name, ignored });
    }
    functions
}

/// The contiguous `#[...]` lines directly above a function line, nearest first.
fn attribute_block<'a>(lines: &[&'a str], function_line: usize) -> Vec<&'a str> {
    let mut attributes = Vec::new();
    let mut index = function_line;
    while index > 0 {
        let previous = lines[index - 1].trim();
        if previous.starts_with("#[") && previous.ends_with(']') {
            attributes.push(previous);
            index -= 1;
        } else {
            break;
        }
    }
    attributes
}

/// The name of the function a line declares, when it declares one.
fn function_name(line: &str) -> Option<&str> {
    let trimmed = line.trim_start();
    if trimmed.starts_with("//") {
        return None;
    }
    let mut words = trimmed.split_whitespace();
    while let Some(word) = words.next() {
        if word == "fn" {
            return words
                .next()?
                .split('(')
                .next()
                .filter(|name| !name.is_empty());
        }
    }
    None
}
