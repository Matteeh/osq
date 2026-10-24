//! Helpers shared by the lint feature's tests.
//!
//! Each test binary compiles this module on its own, so some helpers are
//! unused in a given binary even though another test uses them.
#![allow(dead_code)]

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation, Output};
use osq_feature_lint::LintFeature;

/// The path of the lint fixture project under the crate's `tests/fixtures`.
pub fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("lint-project")
}

/// A fresh empty scratch root under `CARGO_TARGET_TMPDIR`, named `name`.
pub fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Writes one file under `root`, creating its folders.
pub fn write(root: &Path, relative: &str, contents: impl AsRef<[u8]>) {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the file's folders are created");
    }
    fs::write(path, contents).expect("the file is written");
}

/// Runs the lint feature's `lint` with one query at `root`, removing the
/// repository lines that every change-block scenario ignores.
pub fn run(root: &Path, query: &str) -> Result<Output, FeatureError> {
    run_args_without_repository(root, "lint", &[query])
}

/// Runs the lint feature's `command` with `args`, removing repository lines.
pub fn run_args_without_repository(
    root: &Path,
    command: &str,
    args: &[&str],
) -> Result<Output, FeatureError> {
    without_repository(run_args(root, command, args))
}

/// Removes every line that starts with `repository: ` from a result.
fn without_repository(result: Result<Output, FeatureError>) -> Result<Output, FeatureError> {
    match result {
        Ok(output) => Ok(Output::text(without_repository_lines(&output.text))),
        Err(FeatureError::Failed {
            command, message, ..
        }) => Err(FeatureError::failed(
            command,
            without_repository_lines(&message),
        )),
        Err(other) => Err(other),
    }
}

/// Drops every line that starts with `repository: `, keeping the final newline.
fn without_repository_lines(text: &str) -> String {
    let kept: Vec<&str> = text
        .lines()
        .filter(|line| !line.starts_with("repository: "))
        .collect();
    let mut output = kept.join("\n");
    if text.ends_with('\n') && !output.is_empty() {
        output.push('\n');
    }
    output
}

/// Runs the lint feature's `command` with literal `args` at `root`.
pub fn run_args(root: &Path, command: &str, args: &[&str]) -> Result<Output, FeatureError> {
    let args = args.iter().map(|arg| (*arg).to_owned()).collect();
    LintFeature.run(&Invocation::new(root, command, args))
}

/// Every file under one folder, as relative path and bytes.
pub fn tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut files = BTreeMap::new();
    collect(root, root, &mut files);
    files
}

/// Adds one folder's files to `files`, descending into its folders.
fn collect(base: &Path, folder: &Path, files: &mut BTreeMap<String, Vec<u8>>) {
    let Ok(entries) = fs::read_dir(folder) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect(base, &path, files);
        } else {
            let relative = path
                .strip_prefix(base)
                .expect("the file sits under the base folder")
                .to_string_lossy()
                .replace('\\', "/");
            files.insert(relative, fs::read(path).expect("the file is read"));
        }
    }
}
